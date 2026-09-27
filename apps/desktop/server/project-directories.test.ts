import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectDirectoryStore, validProjectFolders } from "./project-directories";
const roots: string[] = [];
async function fixture() { const root = await mkdtemp(join(tmpdir(), "agentos-project-test-")); roots.push(root); return { root, store: createProjectDirectoryStore(root) }; }
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const project = "project-00000000-0000-0000-0000-000000000001";
describe("project directory storage", () => {
  it("reads without creating, creates on request, and preserves existing files", async () => {
    const { store, root } = await fixture();
    const folders = [project, `${project}/shared`, `${project}/domains/data/agents/analyst`];
    expect((await store.request("status", folders)).existing).toEqual([]);
    expect(await readdir(root)).toEqual([]);
    const result = await store.request("create", folders);
    expect(result.existing).toEqual(folders);
    const note = join(result.root, project, "shared", "notes.md");
    await writeFile(note, "Keep my work");
    await store.request("create", folders.slice(0, 2));
    expect(await readFile(note, "utf8")).toBe("Keep my work");
    expect((await store.request("status", folders)).existing).toEqual(folders);
  });
  it("rejects escaping, mixed project roots, and unsupported operations", async () => {
    const { store } = await fixture();
    for (const value of [[], ["/tmp/escape"], [`${project}/domains/..`], [`${project}/shared/../..`], [project, project.replace(/1$/, "2")]]) expect(validProjectFolders(value)).toBe(false);
    await expect(store.request("delete", [project])).rejects.toThrow("Invalid");
    await expect(store.request("reveal", [project, `${project}/shared`])).rejects.toThrow("Invalid");
  });
  it("does not follow symlinks, including parent directories", async () => {
    const { store, root } = await fixture();
    const external = await mkdtemp(join(tmpdir(), "agentos-project-test-")); roots.push(external);
    await symlink(external, join(root, ".agentos"));
    await expect(store.request("create", [project])).rejects.toThrow("regular directory");
    expect(await readdir(external)).toEqual([]);
  });
  it("rejects symlinked project children without changing their target", async () => {
    const { store } = await fixture();
    const { root } = await store.request("create", [project]);
    const external = await mkdtemp(join(tmpdir(), "agentos-project-test-")); roots.push(external);
    await mkdir(join(root, project, "domains"));
    await symlink(external, join(root, project, "domains", "data"));
    await expect(store.request("create", [`${project}/domains/data/agents/analyst`])).rejects.toThrow("regular directory");
    expect(await readdir(external)).toEqual([]);
  });
});
