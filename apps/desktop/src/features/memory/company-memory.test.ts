import { describe, expect, it } from "vitest";
import {
  conflictingIds,
  duplicateEntry,
  entryError,
  memoryContext,
  memoryDocuments,
  parseEntryDocument,
  parseMemory,
  renderEntryDocument,
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
  it("round trips editable per-memory Markdown files and builds an index", () => {
    const document = renderEntryDocument(entry);
    expect(parseEntryDocument(document)).toEqual(entry);
    expect(
      parseEntryDocument(
        document.replace("The team reviews at 9 AM.", "The team reviews at 10 AM."),
      ).body,
    ).toBe("The team reviews at 10 AM.");
    const documents = memoryDocuments(library);
    expect(documents.map((item) => item.path)).toEqual(["MEMORY.md", "main/one.md"]);
    expect(documents[0]!.contents).toContain("main/one.md");
  });
  it("keeps protected file structure and validation around direct Markdown edits", () => {
    expect(() => parseEntryDocument(renderEntryDocument(entry).replace("\n# ", "\n"))).toThrow(
      "Name",
    );
    expect(() =>
      parseEntryDocument(
        renderEntryDocument(entry).replace("The team reviews at 9 AM.", "password=example"),
      ),
    ).toThrow("credential");
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
  it("requires evidence and prevention only in strict review", () => {
    expect(entryError({ ...entry, evidence: "" })).toBeNull();
    expect(entryError({ ...entry, evidence: "" }, true)).toContain("evidence");
    expect(entryError({ ...entry, kind: "lesson" }, true)).toContain("differently");
    expect(
      entryError({ ...entry, kind: "lesson", prevention: "Check schedule first" }, true),
    ).toBeNull();
  });
  it("round-trips a plain note without Evidence or Next time sections", () => {
    const note = { ...entry, evidence: "", prevention: "" };
    const document = renderEntryDocument(note);
    expect(document).not.toContain("## Evidence");
    expect(parseEntryDocument(document)).toEqual(note);
  });
  it("does not promote simulated observations into reviewed knowledge", () => {
    expect(entryError({ ...entry, source: "rehearsal" })).toContain("Rehearsal");
    expect(entryError({ ...entry, source: "rehearsal", status: "draft" })).toBeNull();
  });
  it("uses drafts as plain notes but excludes them in strict review", () => {
    const notes: MemoryLibrary = {
      ...library,
      entries: [entry, { ...entry, id: "two", title: "Draft", status: "draft" }],
    };
    expect(memoryContext(notes, [])).toHaveLength(2);
    expect(memoryContext({ ...notes, strict: true }, [])).toHaveLength(1);
  });
  it("excludes drafts, archives, unrelated scope and conflicting claims", () => {
    const mixed: MemoryLibrary = {
      ...library,
      strict: true,
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
  it("layers main, office, and agent memory for an agent context", () => {
    const scoped: MemoryLibrary = {
      ...library,
      entries: [
        entry,
        { ...entry, id: "office", title: "Office convention", scope: "domain:Finance" },
        { ...entry, id: "agent", title: "Agent preference", scope: "agent:analyst" },
        { ...entry, id: "other", title: "Other agent", scope: "agent:reviewer" },
      ],
    };
    expect(
      memoryContext(scoped, ["domain:Finance", "agent:analyst"]).map((item) => item.id),
    ).toEqual(["one", "office", "agent"]);
  });
  it("detects duplicates and obvious credentials", () => {
    expect(
      duplicateEntry(library, { ...entry, id: "two", body: " The team reviews at 9 AM. " }),
    ).toBe(true);
    expect(entryError({ ...entry, body: "password=example" })).toContain("credential");
  });
});
