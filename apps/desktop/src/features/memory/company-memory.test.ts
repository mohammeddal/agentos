import { describe, expect, it } from "vitest";
import {
  conflictingIds,
  duplicateEntry,
  entryError,
  memoryContext,
  parseMemory,
  renderMemory,
  type MemoryEntry,
  type MemoryLibrary,
} from "./company-memory";
const entry: MemoryEntry = {
  id: "one",
  kind: "fact",
  status: "reviewed",
  title: "Working hours",
  body: "The team reviews at 9 AM.",
  evidence: "Team handbook, section 2",
  prevention: "",
  scope: "company",
  source: "manual",
  sourceId: "",
  createdAt: "2026-09-27T00:00:00Z",
  updatedAt: "2026-09-27T00:00:00Z",
};
const library: MemoryLibrary = { version: 1, enabled: true, entries: [entry] };
describe("fact-based memory", () => {
  it("round trips Markdown with metadata and special characters", () => {
    const special = {
      ...library,
      entries: [{ ...entry, body: "Arabic العربية\n<!-- comment -->\n```test```" }],
    };
    expect(parseMemory(renderMemory(special))).toEqual(special);
    expect(renderMemory(library)).toContain("Team handbook");
  });
  it("detects external edits rather than silently losing them", () => {
    expect(() =>
      parseMemory(renderMemory(library).replace("## Working hours", "## Changed")),
    ).toThrow("edited outside");
    expect(() => parseMemory("# unknown file")).toThrow("Unrecognized");
  });
  it("memory off preserves records but returns no context", () => {
    const off = { ...library, enabled: false };
    expect(memoryContext(off, [])).toEqual([]);
    expect(parseMemory(renderMemory(off)).entries).toHaveLength(1);
  });
  it("requires evidence for reviewed claims and prevention for lessons", () => {
    expect(entryError({ ...entry, evidence: "" })).toContain("real evidence");
    expect(entryError({ ...entry, kind: "lesson" })).toContain("differently");
    expect(entryError({ ...entry, kind: "lesson", prevention: "Check schedule first" })).toBeNull();
  });
  it("does not promote simulated observations into reviewed knowledge", () => {
    expect(entryError({ ...entry, source: "rehearsal" })).toContain("Rehearsal");
    expect(entryError({ ...entry, source: "rehearsal", status: "draft" })).toBeNull();
  });
  it("excludes drafts, archives, unrelated scope and conflicting claims", () => {
    const mixed: MemoryLibrary = {
      ...library,
      entries: [
        entry,
        { ...entry, id: "two", status: "draft" },
        { ...entry, id: "three", status: "archived" },
        { ...entry, id: "four", scope: "domain:Finance" },
      ],
    };
    expect(memoryContext(mixed, [])).toHaveLength(1);
    expect(memoryContext(mixed, ["domain:Finance"])).toHaveLength(2);
    mixed.entries.push({ ...entry, id: "five", body: "The team reviews at 10 AM." });
    expect(conflictingIds(mixed).size).toBe(2);
    expect(memoryContext(mixed, [])).toHaveLength(0);
  });
  it("detects duplicates and obvious credentials", () => {
    expect(
      duplicateEntry(library, { ...entry, id: "two", body: " The team reviews at 9 AM. " }),
    ).toBe(true);
    expect(entryError({ ...entry, body: "password=example" })).toContain("credential");
  });
});
