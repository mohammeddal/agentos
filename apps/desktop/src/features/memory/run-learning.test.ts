import { describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
import { extractMemoryNotes, runNotes, stripMemoryBlocks } from "./run-learning";
import { starterCompany } from "../company/company-model";
import type { LiveRun } from "../engines/live-runtime";

const block = (json: string) => "Done.\n```agentos-memory\n" + json + "\n```\n";
const agent = starterCompany.offices[0]!.agents[0]!;
const run = (patch: Partial<LiveRun>): LiveRun => ({
  request: {
    id: "r1",
    key: "task:t",
    title: "Fetch news",
    mode: "task",
    folder: "",
    context: "",
    steps: [
      {
        id: "s1",
        label: agent.name,
        engine: "codex",
        prompt: "",
        agentId: agent.id,
        after: [],
        condition: "success",
        approval: false,
      },
    ],
  },
  status: "completed",
  engine: "codex",
  createdAt: 0,
  updatedAt: 0,
  sessionId: "",
  output: "",
  error: "",
  cwd: "",
  currentAgentId: "",
  events: [],
  approvals: [],
  results: [],
  ...patch,
});

describe("run learning", () => {
  it("extracts valid notes and ignores malformed blocks", () => {
    const text =
      block('[{"kind":"lesson","title":"Feeds","body":"RSS is faster than scraping."}]') +
      block("not json");
    expect(extractMemoryNotes(text)).toEqual([
      { kind: "lesson", title: "Feeds", body: "RSS is faster than scraping." },
    ]);
    expect(stripMemoryBlocks(text)).toBe("Done.\n\nDone.");
  });
  it("scopes learned notes to the agent that reported them", () => {
    const notes = runNotes(
      run({
        results: [
          {
            id: "s1",
            label: agent.name,
            status: "completed",
            output: block('[{"title":"Source","body":"Use the official blog."}]'),
          },
        ],
      }),
      starterCompany,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ scope: `agent:${agent.id}`, source: "run", kind: "fact" });
  });
  it("records a failed run as a known issue", () => {
    const [issue] = runNotes(
      run({
        status: "failed",
        error: "notebooklm unauthenticated",
        results: [{ id: "s1", label: agent.name, status: "failed", output: "" }],
      }),
      starterCompany,
    );
    expect(issue).toMatchObject({ kind: "issue", body: "notebooklm unauthenticated" });
  });
});
