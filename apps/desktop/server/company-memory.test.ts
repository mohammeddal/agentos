import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryStore } from "./company-memory";
import { emptyMemory, renderMemory } from "../src/company-memory";
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() { const path = await mkdtemp(join(tmpdir(), "agentos-memory-")); directories.push(path); return { path, store: createMemoryStore(path) }; }
describe("Markdown file persistence", () => {
  it("writes a real Markdown file, reloads it, and keeps the previous revision", async () => {
    const { path, store } = await fixture();
    expect((await store.read()).contents).toBeNull();
    const first = renderMemory(emptyMemory), second = renderMemory({ ...emptyMemory, enabled: false });
    await store.save(null, first);
    expect(await readFile(join(path, "company-memory.md"), "utf8")).toBe(first);
    await store.save(first, second);
    expect((await createMemoryStore(path).read()).contents).toBe(second);
    expect(await readFile(join(path, "company-memory.previous.md"), "utf8")).toBe(first);
  });
  it("rejects concurrent stale writes and external changes", async () => {
    const { path, store } = await fixture(); const text = renderMemory(emptyMemory);
    const results = await Promise.allSettled([store.save(null, text), store.save(null, text)]);
    expect(results.map(r => r.status)).toEqual(["fulfilled", "rejected"]);
    await writeFile(join(path, "company-memory.md"), "External edit");
    await expect(store.save(text, text)).rejects.toThrow("changed on disk");
    expect(await readFile(join(path, "company-memory.md"), "utf8")).toBe("External edit");
  });
  it("refuses symlink files and oversized documents", async () => {
    const { path, store } = await fixture();
    await expect(store.save(null, "# AgentOS company memory\n" + "x".repeat(2_000_000))).rejects.toThrow("oversized");
    await writeFile(join(path, "unrelated.txt"), "untouched");
    await symlink(join(path, "unrelated.txt"), join(path, "company-memory.md"));
    await expect(store.read()).rejects.toThrow("unsafe");
  });
});
