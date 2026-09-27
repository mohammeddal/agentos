import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cleanMetadata, inventory } from "./engine-inventory";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() { const home = await mkdtemp(join(tmpdir(), "agentos-inventory-")); roots.push(home); const project = join(home, "project"); await mkdir(project); const put = async (path: string, text: string) => { await mkdir(dirname(join(home, path)), { recursive: true }); await writeFile(join(home, path), text); }; return { home, project, put }; }
describe("read-only engine inventory", () => {
  it("discovers Codex metadata across scopes without serializing credentials or instructions", async () => {
    const { home, project, put } = await fixture();
    const config = '[mcp_servers."docs.with.dots"]\ncommand="do-not-run"\nargs=["sensitive-arg"]\nenabled=false\n[mcp_servers."docs.with.dots".env]\nAPI_KEY="sensitive-token"\n[apps.demo]\nenabled=true\n';
    await put(".codex/config.toml", config);
    await put(".codex/skills/review/SKILL.md", "---\nname: review\ndescription: >-\n  Review evidence\n  before acting.\n---\nPRIVATE INSTRUCTIONS");
    await put("project/.agents/skills/review/SKILL.md", "---\nname: review\ndescription: Project review\n---\nprivate");
    await put("project/.codex/agents/a.toml", 'name="Local reviewer"\ndescription="Checks changes"\ndeveloper_instructions="SECRET BODY"');
    const result = await inventory("codex", project, { home }); const serialized = JSON.stringify(result);
    for (const secret of ["do-not-run", "sensitive-arg", "sensitive-token", "PRIVATE INSTRUCTIONS", "SECRET BODY"]) expect(serialized).not.toContain(secret);
    expect(result.entries.filter(e => e.kind === "skill")).toHaveLength(2);
    expect(result.entries.find(e => e.kind === "mcp")).toMatchObject({ name: "docs.with.dots", status: "disabled" });
    expect(result.entries.some(e => e.kind === "connector")).toBe(true);
    expect(await readFile(join(home, ".codex/config.toml"), "utf8")).toBe(config);
  });
  it("labels plugin cache contents as cached, never connected or installed", async () => {
    const { home, put } = await fixture();
    await put(".codex/plugins/cache/store/plugin/1/.codex-plugin/plugin.json", '{"name":"Test plugin"}');
    await put(".codex/plugins/cache/store/plugin/1/skills/test/SKILL.md", "---\nname: test\n---\n");
    await put(".codex/plugins/cache/store/plugin/1/.mcp.json", '{"mcpServers":{"cache-mcp":{"url":"https://secret.example/?token=secret"}}}');
    await put(".codex/plugins/cache/store/plugin/1/.app.json", '{"apps":{"figma":{"id":"internal","token":"private-token"}}}');
    const result = await inventory("codex", null, { home });
    expect(result.entries).toHaveLength(4); expect(result.entries.every(e => e.status === "cached")).toBe(true); expect(JSON.stringify(result)).not.toContain("secret.example"); expect(JSON.stringify(result)).not.toContain("private-token"); expect(result.entries.some(e => e.kind === "connector" && e.name === "figma")).toBe(true);
  });
  it("reads Claude user and current-project MCPs, skills, agents and plugin settings", async () => {
    const { home, project, put } = await fixture();
    await put(".claude.json", JSON.stringify({ mcpServers: { personal: { command: "never-run" } }, projects: { [project]: { mcpServers: { local: {} } }, unrelated: { mcpServers: { hidden: {} } } } }));
    await put("project/.mcp.json", '{"mcpServers":{"project":{"disabled":true}}}');
    await put(".claude/agents/reviewer.md", "---\nname: reviewer\ndescription: Checks work\n---\nInstructions");
    await put(".claude/settings.json", '{"enabledPlugins":{"sample@store":false}}');
    const result = await inventory("claude", project, { home });
    expect(result.entries.filter(e => e.kind === "mcp")).toHaveLength(3);
    expect(result.entries.some(e => e.name === "hidden")).toBe(false);
    expect(result.entries.find(e => e.kind === "plugin")?.status).toBe("disabled");
    expect(result.entries.some(e => e.kind === "agent")).toBe(true);
  });
  it("reports invalid sources safely and does not follow symlink files", async () => {
    const { home, put } = await fixture();
    await put(".codex/config.toml", "INVALID secret-value [");
    await put("private.md", "---\nname: Should not appear\n---\n");
    await mkdir(join(home, ".codex/skills/link"), { recursive: true });
    await symlink(join(home, "private.md"), join(home, ".codex/skills/link/SKILL.md"));
    const result = await inventory("codex", null, { home });
    expect(result.sources.filter(s => s.status === "error")).toHaveLength(2); expect(result.entries).toHaveLength(0); expect(JSON.stringify(result)).not.toContain("secret-value");
  });
  it("does not follow installed-plugin paths outside the plugin root", async () => {
    const { home, put } = await fixture();
    await put("outside/.claude-plugin/plugin.json", '{"name":"Outside"}');
    await put(".claude/plugins/installed_plugins.json", JSON.stringify({ plugins: { external: [{ scope: "user", installPath: join(home, "outside") }] } }));
    const result = await inventory("claude", null, { home }); expect(result.entries.some(e => e.name === "Outside")).toBe(false); expect(result.sources.some(s => s.status === "error")).toBe(true);
  });
  it("discovers explicitly linked skill folders without executing their bodies", async () => {
    const { home, put } = await fixture();
    await put("shared/review/SKILL.md", "---\nname: shared-review\ndescription: Shared skill\n---\nNEVER EXECUTE THIS BODY");
    await mkdir(join(home, ".codex/skills"), { recursive: true });
    await symlink(join(home, "shared/review"), join(home, ".codex/skills/review"));
    const result = await inventory("codex", null, { home });
    expect(result.entries.some(e => e.name === "shared-review" && e.scope === "Personal")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("NEVER EXECUTE"); expect(result.sources.some(s => s.note.startsWith("Linked skill"))).toBe(true);
  });
  it("explicitly marks unsupported engines and redacts obvious metadata credentials", async () => {
    const { home } = await fixture(); const result = await inventory("gemini", null, { home }); expect(result.sources).toHaveLength(0); expect(result.limitations[0]).toContain("not implemented");
    expect(cleanMetadata("api_key=secret sk-123456789012345678901234")).toBe("[redacted] [redacted]");
  });
});
