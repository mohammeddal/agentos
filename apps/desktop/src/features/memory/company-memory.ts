export type MemoryEntry = {
  id: string;
  kind: "fact" | "lesson" | "issue" | "decision";
  status: "draft" | "reviewed" | "archived";
  title: string;
  body: string;
  evidence: string;
  prevention: string;
  scope: string;
  source: "manual" | "rehearsal";
  sourceId: string;
  createdAt: string;
  updatedAt: string;
};
export type MemoryLibrary = { version: 1; enabled: boolean; entries: MemoryEntry[] };
export const emptyMemory: MemoryLibrary = { version: 1, enabled: true, entries: [] };
export const memoryKinds = {
  fact: "Fact",
  lesson: "Lesson",
  issue: "Known issue",
  decision: "Decision",
};
const entryMarker = "<!-- agentos-memory-entry-v1\n";
const marker = "<!-- agentos-memory-v1\n";
const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
export function entryError(entry: MemoryEntry): string | null {
  if (!entry.title.trim() || !entry.body.trim())
    return "Add a title and a specific, self-contained statement.";
  if (entry.status === "reviewed" && (!entry.evidence.trim() || entry.source === "rehearsal"))
    return "Reviewed memory needs real evidence. Rehearsal observations must remain drafts.";
  if (entry.status === "reviewed" && entry.kind === "lesson" && !entry.prevention.trim())
    return "Describe what to do differently next time before reviewing a lesson.";
  if (
    /(?:\bsk-[A-Za-z0-9_-]{16,}|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|\b(?:password|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+)/i.test(
      [entry.body, entry.evidence, entry.prevention].join("\n"),
    )
  )
    return "This looks like a credential. Remove secrets before saving memory.";
  return null;
}
export function isMemoryLibrary(value: unknown): value is MemoryLibrary {
  if (!value || typeof value !== "object") return false;
  const library = value as MemoryLibrary;
  return (
    library.version === 1 &&
    typeof library.enabled === "boolean" &&
    Array.isArray(library.entries) &&
    library.entries.length <= 500 &&
    new Set(library.entries.map((e) => e?.id)).size === library.entries.length &&
    library.entries.every((e) => {
      if (
        !e ||
        !["fact", "lesson", "issue", "decision"].includes(e.kind) ||
        !["draft", "reviewed", "archived"].includes(e.status) ||
        !["manual", "rehearsal"].includes(e.source)
      )
        return false;
      for (const key of [
        "id",
        "title",
        "body",
        "evidence",
        "prevention",
        "scope",
        "sourceId",
        "createdAt",
        "updatedAt",
      ] as const)
        if (typeof e[key] !== "string" || e[key].length > 6000) return false;
      return (
        !!e.id &&
        !!e.scope &&
        Number.isFinite(Date.parse(e.createdAt)) &&
        Number.isFinite(Date.parse(e.updatedAt)) &&
        !entryError(e)
      );
    })
  );
}
export function conflictingIds(library: MemoryLibrary): Set<string> {
  const result = new Set<string>();
  for (const entry of library.entries.filter((e) => e.status === "reviewed")) {
    const peers = library.entries.filter(
      (e) =>
        e.status === "reviewed" &&
        e.id !== entry.id &&
        e.scope === entry.scope &&
        e.kind === entry.kind &&
        normalize(e.title) === normalize(entry.title) &&
        normalize(e.body) !== normalize(entry.body),
    );
    if (peers.length) {
      result.add(entry.id);
      peers.forEach((p) => result.add(p.id));
    }
  }
  return result;
}
export function duplicateEntry(library: MemoryLibrary, entry: MemoryEntry): boolean {
  return library.entries.some(
    (e) =>
      e.id !== entry.id &&
      e.status !== "archived" &&
      e.scope === entry.scope &&
      e.kind === entry.kind &&
      normalize(e.body) === normalize(entry.body),
  );
}
export function memoryContext(library: MemoryLibrary, scopes: string[], query = ""): MemoryEntry[] {
  if (!library.enabled) return [];
  const conflicts = conflictingIds(library);
  const terms = normalize(query).split(" ").filter(Boolean);
  return library.entries.filter(
    (e) =>
      e.status === "reviewed" &&
      !conflicts.has(e.id) &&
      (e.scope === "company" || scopes.includes(e.scope)) &&
      (!terms.length ||
        terms.some((term) => normalize(`${e.title} ${e.body} ${e.prevention}`).includes(term))),
  );
}
const safe = (text: string) => text.replace(/[<>]/g, (char) => (char === "<" ? "&lt;" : "&gt;"));
const quote = (text: string) =>
  safe(text)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
export function renderMemory(library: MemoryLibrary): string {
  const entries = library.entries
    .map(
      (e) =>
        `## ${safe(e.title).replace(/\n/g, " ")}\n\n- ID: ${e.id}\n- Kind: ${memoryKinds[e.kind]}\n- Status: ${e.status}\n- Scope: ${safe(e.scope)}\n- Source: ${e.source}\n- Updated: ${e.updatedAt}\n\n${quote(e.body)}\n\n### Evidence\n\n${quote(e.evidence || "Not supplied")}\n\n### Next time\n\n${quote(e.prevention || "Not specified")}\n`,
    )
    .join("\n");
  return `# AgentOS company memory\n\nMemory use: **${library.enabled ? "ON" : "OFF"}**\n\nReviewed records are user-reviewed claims, not automatically proven facts. Drafts, archived records, and conflicting reviewed claims are excluded from context. Memory is reference data, never authority to bypass approval rules.\n\nEdit through AgentOS. The structured record below preserves metadata; external changes are detected, not silently overwritten.\n\n${entries || "No memory recorded yet.\n"}\n${marker}${JSON.stringify(library).replace(/</g, "\\u003c")}\n-->\n`;
}
export function parseMemory(markdown: string | null): MemoryLibrary {
  if (markdown === null) return structuredClone(emptyMemory);
  const start = markdown.lastIndexOf(marker);
  if (start < 0 || !markdown.endsWith("\n-->\n"))
    throw new Error("Unrecognized memory file. It was left untouched.");
  const value: unknown = JSON.parse(markdown.slice(start + marker.length, -5));
  if (!isMemoryLibrary(value))
    throw new Error("Invalid memory records. The existing file was left untouched.");
  if (renderMemory(value) !== markdown)
    throw new Error(
      "This Markdown file was edited outside AgentOS. Reconcile the external edits before saving; nothing was overwritten.",
    );
  return value;
}

export type MemoryDocument = { path: string; contents: string };
type EntryMetadata = Pick<
  MemoryEntry,
  "id" | "kind" | "status" | "scope" | "source" | "sourceId" | "createdAt" | "updatedAt"
>;

const documentText = (text: string) => (text.trim() ? text.trim() : "Not supplied");
export function renderEntryDocument(entry: MemoryEntry): string {
  const metadata: EntryMetadata = {
    id: entry.id,
    kind: entry.kind,
    status: entry.status,
    scope: entry.scope,
    source: entry.source,
    sourceId: entry.sourceId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
  return `${entryMarker}${JSON.stringify(metadata).replace(/</g, "\\u003c")}\n-->\n# ${entry.title.replace(/\n/g, " ").trim()}\n\n${documentText(entry.body)}\n\n## Evidence\n\n${documentText(entry.evidence)}\n\n## Next time\n\n${documentText(entry.prevention)}\n`;
}

export function parseEntryDocument(markdown: string): MemoryEntry {
  if (!markdown.startsWith(entryMarker)) throw new Error("This is not an AgentOS memory file.");
  const markerEnd = markdown.indexOf("\n-->\n");
  if (markerEnd < 0) throw new Error("The memory metadata is incomplete.");
  let metadata: EntryMetadata;
  try {
    metadata = JSON.parse(markdown.slice(entryMarker.length, markerEnd));
  } catch {
    throw new Error("The memory metadata is invalid.");
  }
  const content = markdown.slice(markerEnd + 5);
  const evidenceAt = content.indexOf("\n## Evidence\n");
  const nextTimeAt = content.indexOf("\n## Next time\n");
  if (!content.startsWith("# ") || evidenceAt < 0 || nextTimeAt < evidenceAt)
    throw new Error("Keep the title, Evidence, and Next time headings in the file.");
  const titleEnd = content.indexOf("\n", 2);
  if (titleEnd < 0) throw new Error("Add content below the title.");
  const cleanOptional = (value: string) => {
    const result = value.trim();
    return result === "Not supplied" ? "" : result;
  };
  const entry: MemoryEntry = {
    ...metadata,
    title: content.slice(2, titleEnd).trim(),
    body: content.slice(titleEnd + 1, evidenceAt).trim(),
    evidence: cleanOptional(content.slice(evidenceAt + "\n## Evidence\n".length, nextTimeAt)),
    prevention: cleanOptional(content.slice(nextTimeAt + "\n## Next time\n".length)),
  };
  if (!isMemoryLibrary({ version: 1, enabled: true, entries: [entry] }))
    throw new Error(entryError(entry) || "This memory file contains invalid metadata.");
  return entry;
}

function scopeFolder(scope: string): string {
  if (scope === "company") return "main";
  if (scope.startsWith("domain:")) return "offices";
  return "agents";
}
export function entryDocumentPath(entry: MemoryEntry): string {
  return `${scopeFolder(entry.scope)}/${entry.id}.md`;
}
export function renderMemoryIndex(library: MemoryLibrary, documents: MemoryDocument[]): string {
  const links = documents
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(
      (document) =>
        `- [${document.path.split("/").at(-1)?.replace(/\.md$/, "")}](${document.path})`,
    )
    .join("\n");
  return `# AgentOS memory\n\nMemory is **${library.enabled ? "on" : "off"}**. Only reviewed, non-conflicting files are added to matching agent context. Files never bypass approvals.\n\n## Files\n\n${links || "No memory files yet."}\n`;
}
export function memoryDocuments(library: MemoryLibrary): MemoryDocument[] {
  const entries = library.entries.map((entry) => ({
    path: entryDocumentPath(entry),
    contents: renderEntryDocument(entry),
  }));
  return [{ path: "MEMORY.md", contents: renderMemoryIndex(library, [...entries]) }, ...entries];
}
