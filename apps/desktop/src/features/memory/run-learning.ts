import type { Company } from "../company/company-model";
import type { LiveRun } from "../engines/live-runtime";
import {
  entryError,
  memoryDocuments,
  parseEntryDocument,
  parseMemory,
  renderMemory,
  type MemoryEntry,
  type MemoryLibrary,
} from "./company-memory";
import { memoryFile } from "./memory-storage";

/** Fenced block agents use to hand durable lessons back to AgentOS. */
const FENCE = "agentos-memory";
export const LEARNING_INSTRUCTION = `If this work taught you something durable that would help future runs — a project fact, a preference, the cause and fix of a failure, or a decision — end your reply with a fenced block:
\`\`\`${FENCE}
[{"kind":"fact|lesson|issue|decision","title":"short name","body":"one self-contained sentence or two"}]
\`\`\`
Include at most 3 items, only what is genuinely reusable, never secrets or credentials. Omit the block if nothing qualifies.`;

const blockPattern = new RegExp("```" + FENCE + "\\s*\\n([\\s\\S]*?)```", "g");

/** Removes learning blocks from text shown to the user. */
export function stripMemoryBlocks(text: string): string {
  return text.replace(blockPattern, "").trimEnd();
}

type Note = Pick<MemoryEntry, "kind" | "title" | "body">;
const kinds = new Set(["fact", "lesson", "issue", "decision"]);

/** Reads learning blocks from agent output. Malformed blocks are ignored. */
export function extractMemoryNotes(text: string): Note[] {
  const notes: Note[] = [];
  for (const match of text.matchAll(blockPattern)) {
    try {
      const value: unknown = JSON.parse(match[1]!);
      for (const item of Array.isArray(value) ? value.slice(0, 3) : []) {
        if (!item || typeof item !== "object") continue;
        const { kind, title, body } = item as Record<string, unknown>;
        if (typeof title !== "string" || typeof body !== "string") continue;
        if (!title.trim() || !body.trim()) continue;
        notes.push({
          kind: typeof kind === "string" && kinds.has(kind) ? (kind as Note["kind"]) : "fact",
          title: title.trim().slice(0, 120),
          body: body.trim().slice(0, 2000),
        });
      }
    } catch {
      /* Not valid JSON: skip it rather than storing garbage. */
    }
  }
  return notes;
}

/** The memory notes a finished run contributes: learned notes, or an issue when it failed. */
export function runNotes(run: LiveRun, company: Company, now = new Date()): MemoryEntry[] {
  const agents = new Set(company.offices.flatMap((office) => office.agents.map((a) => a.id)));
  const scopeFor = (agentId: string) =>
    agentId && agents.has(agentId) ? `agent:${agentId}` : "company";
  const stamp = now.toISOString();
  const entry = (note: Note, scope: string, sourceId: string): MemoryEntry => ({
    id: crypto.randomUUID(),
    ...note,
    status: "draft",
    evidence: `Learned from run “${run.request.title.slice(0, 120)}” on ${new Date(run.updatedAt).toLocaleString()}.`,
    prevention: "",
    scope,
    source: "run",
    sourceId,
    createdAt: stamp,
    updatedAt: stamp,
  });
  if (run.status === "failed") {
    const step = run.request.steps.find(
      (s) => run.results.find((r) => r.id === s.id)?.status === "failed",
    );
    const error = run.error.trim();
    if (!error) return [];
    return [
      entry(
        {
          kind: "issue",
          title: `Failed: ${(step?.label || run.request.title).slice(0, 100)}`,
          body: error.slice(0, 600),
        },
        scopeFor(step?.agentId || ""),
        `run:${run.request.id}`,
      ),
    ];
  }
  if (run.status !== "completed") return [];
  const outputs = run.results.length
    ? run.results.map((result) => ({
        text: result.output,
        agentId: run.request.steps.find((s) => s.id === result.id)?.agentId || "",
      }))
    : [{ text: run.output, agentId: run.request.steps[0]?.agentId || "" }];
  return outputs.flatMap(({ text, agentId }, index) =>
    extractMemoryNotes(text).map((note, noteIndex) =>
      entry(note, scopeFor(agentId), `run:${run.request.id}:${index}:${noteIndex}`),
    ),
  );
}

const PROCESSED = "agentos:learned-runs:v1";

function processedRuns(runs: LiveRun[]): Set<string> | null {
  try {
    const saved = localStorage.getItem(PROCESSED);
    if (saved === null) {
      // First use: start learning from new runs only, not the whole history.
      const ids = runs.map((run) => run.request.id);
      localStorage.setItem(PROCESSED, JSON.stringify(ids.slice(-500)));
      return null;
    }
    const value: unknown = JSON.parse(saved);
    return new Set(Array.isArray(value) ? value.filter((v) => typeof v === "string") : []);
  } catch {
    return null;
  }
}

let learning = false;

/**
 * Saves notes from runs that finished since the last pass. Runs are marked processed even when
 * memory is off, so turning learning on later does not replay old runs.
 */
export async function learnFromRuns(runs: LiveRun[], company: Company): Promise<number> {
  if (learning) return 0;
  const done = processedRuns(runs);
  if (!done) return 0;
  const finished = runs.filter(
    (run) =>
      (run.status === "completed" || run.status === "failed") &&
      !done.has(run.request.id) &&
      (run.request.mode === "task" || run.request.chatActions),
  );
  if (!finished.length) return 0;
  learning = true;
  try {
    const file = await memoryFile();
    const legacy = parseMemory(file.contents);
    const saved = file.documents.filter((document) => document.path !== "MEMORY.md");
    const library: MemoryLibrary = saved.length
      ? { ...legacy, entries: saved.map((document) => parseEntryDocument(document.contents)) }
      : legacy;
    const known = new Set(library.entries.map((entry) => entry.sourceId));
    const additions =
      library.enabled && library.learn !== false
        ? finished
            .flatMap((run) => runNotes(run, company))
            .filter((entry) => !known.has(entry.sourceId) && !entryError(entry))
        : [];
    if (additions.length && library.entries.length + additions.length <= 500) {
      const next = { ...library, entries: [...library.entries, ...additions] };
      await memoryFile({
        expected: file.contents,
        contents: renderMemory(next),
        expectedDocuments: file.documents,
        documents: memoryDocuments(next),
      });
    }
    finished.forEach((run) => done.add(run.request.id));
    localStorage.setItem(PROCESSED, JSON.stringify([...done].slice(-500)));
    return additions.length;
  } finally {
    learning = false;
  }
}
