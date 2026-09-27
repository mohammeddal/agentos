import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { parse as toml } from "smol-toml";
import { parse as yaml } from "yaml";
import type { Plugin } from "vite";
import type { Capability, CapabilityKind, Engine, Inventory } from "../src/features/engines/engine-inventory";

const record = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
// Only display metadata. Never return commands, arguments, URLs, headers, env, or credential values.
export function cleanMetadata(value: unknown, fallback = ""): string {
  return (typeof value === "string" ? value : fallback).replace(/\b(?:sk-|ghp_|github_pat_)[\w-]{12,}/gi, "[redacted]").replace(/(?:password|api[_ -]?key|access[_ -]?token|authorization)\s*[:=]\s*\S+/gi, "[redacted]").replace(/[\u0000-\u001f]/g, " ").slice(0, 600);
}
export async function inventory(engine: Engine, workspace: string | null, options: { home?: string; codexHome?: string; claudeHome?: string } = {}): Promise<Inventory> {
  const home = options.home || homedir(), codex = options.codexHome || join(home, ".codex"), claude = options.claudeHome || join(home, ".claude");
  const requestedWorkspace = workspace;
  if (workspace) { if (!isAbsolute(workspace) || !(await lstat(workspace)).isDirectory()) throw new Error("Choose an absolute workspace directory."); workspace = await realpath(workspace); }
  const result: Inventory = { engine, workspace, scannedAt: new Date().toISOString(), entries: [], sources: [], limitations: ["Read-only local inventory, not the engine's live session. Configuration does not prove installation, authentication, health, or effective permission.", "Managed policies, command-line overrides, inherited parent-folder configuration, remote hosts, and session-only tools are not resolved. Nothing is executed or enabled."] };
  if (engine === "gemini") { result.limitations = ["Gemini discovery is not implemented. No sources were scanned."]; return result; }
  let reads = 0, directories = 0;
  function source(path: string, status: "read" | "missing" | "error", note = "") { if (!result.sources.some(s => s.path === path && s.status === status)) result.sources.push({ path, status, note }); }
  async function file(path: string, format: "json" | "toml" | "md"): Promise<Record<string, any> | null> {
    try {
      if (++reads > 1500) throw new Error("Scan limit");
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_000_000) throw new Error("Unsupported file");
      const text = await readFile(path, "utf8");
      const data = format === "json" ? JSON.parse(text) : format === "toml" ? toml(text) : yaml(text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || "", { maxAliasCount: 0 });
      source(path, "read"); return record(data);
    } catch (error) { source(path, (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "error", (error as NodeJS.ErrnoException).code === "ENOENT" ? "Not present" : "Unreadable, invalid, symlinked, or scan limit reached. Contents withheld."); return null; }
  }
  async function children(path: string): Promise<string[]> {
    try { if (++directories > 700 || (await lstat(path)).isSymbolicLink()) throw new Error("Scan limit or symlink"); const names = await readdir(path); source(path, "read"); if (names.length > 500) source(path, "error", "Directory limited to 500 entries."); return names.sort().slice(0, 500); }
    catch (error) { source(path, (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "error", "Directory not available; symlinks are not followed."); return []; }
  }
  function add(kind: CapabilityKind, name: string, data: Record<string, any>, path: string, scope: string, status: Capability["status"] = "found") {
    const id = `${kind}:${path}:${scope}:${name}`;
    if (!result.entries.some(e => e.id === id)) result.entries.push({ id, kind, name: cleanMetadata(data.name, name), description: cleanMetadata(data.description), source: path, scope, status });
  }
  function servers(value: unknown, path: string, scope: string, status: Capability["status"] = "configured") {
    for (const [name, config] of Object.entries(record(value))) { const d = record(config); add("mcp", name, {}, path, scope, d.enabled === false || d.disabled === true ? "disabled" : status); }
  }
  async function skills(path: string, scope: string, status: Capability["status"] = "found", depth = 0) {
    for (const name of await children(path)) {
      let p = join(path, name);
      if (name === ".system" && depth === 0) { await skills(p, "System", status, 1); continue; }
      try { const stat = await lstat(p); if (stat.isSymbolicLink()) { const target = await realpath(p); source(p, "read", `Linked skill folder: ${target}`); p = target; } if (!(await lstat(p)).isDirectory()) continue; } catch { source(p, "error", "Skill folder unavailable."); continue; }
      const doc = join(p, "SKILL.md"), data = await file(doc, "md");
      if (data) add("skill", name, data, doc, scope, status);
    }
  }
  async function agents(path: string, scope: string, format: "toml" | "md", status: Capability["status"] = "found") {
    for (const name of await children(path)) if (name.endsWith(`.${format}`)) { const p = join(path, name), data = await file(p, format); if (data) add("agent", name.replace(/\.(md|toml)$/, ""), data, p, scope, status); }
  }
  async function config(path: string, scope: string) {
    const d = await file(path, "toml"); if (!d) return;
    servers(d.mcp_servers, path, scope);
    for (const [name, value] of Object.entries(record(d.apps))) if (name !== "_default") add("connector", name, {}, path, scope, record(value).enabled === false || record(d.apps)._default?.enabled === false && record(value).enabled !== true ? "disabled" : "configured");
    for (const [name, value] of Object.entries(record(d.agents))) if (value && typeof value === "object") add("agent", name, record(value), path, scope, "configured");
    for (const [name, value] of Object.entries(record(d.plugins))) add("plugin", name, {}, path, scope, record(value).enabled === false ? "disabled" : "configured");
  }
  async function plugin(path: string, scope: string, status: Capability["status"]) {
    try { if (!(await lstat(path)).isDirectory()) return; } catch { return; }
    let d = await file(join(path, "plugin.json"), "json");
    if (!d) d = await file(join(path, engine === "codex" ? ".codex-plugin" : ".claude-plugin", "plugin.json"), "json");
    if (!d) return;
    add("plugin", basename(path), d, path, scope, status);
    await skills(join(path, "skills"), scope, status);
    await agents(join(path, "agents"), scope, engine === "codex" ? "toml" : "md", status);
    for (const name of [".mcp.json", "mcp.json"]) { const m = await file(join(path, name), "json"); if (m) servers(m.mcpServers || m, join(path, name), scope, status); }
    if (typeof d.mcpServers === "object") servers(d.mcpServers, path, scope, status);
    const appsPath = join(path, ".app.json"), apps = await file(appsPath, "json");
    if (apps) for (const [name, value] of Object.entries(record(apps.apps))) add("connector", name, { description: record(value).description }, appsPath, scope, status);
  }
  if (engine === "codex") {
    await config(join(codex, "config.toml"), "Personal");
    await skills(join(codex, "skills"), "Personal"); await skills(join(home, ".agents/skills"), "Personal");
    await agents(join(codex, "agents"), "Personal", "toml");
    if (workspace) { await config(join(workspace, ".codex/config.toml"), "Project"); await skills(join(workspace, ".agents/skills"), "Project"); await skills(join(workspace, ".codex/skills"), "Project"); await agents(join(workspace, ".codex/agents"), "Project", "toml"); }
    // Cache presence is not proof of installation. Keep every version separately with its source.
    const cache = join(codex, "plugins/cache");
    for (const market of await children(cache)) for (const name of await children(join(cache, market))) for (const version of await children(join(cache, market, name))) await plugin(join(cache, market, name, version), "Plugin cache", "cached");
    result.limitations.push("Plugin cache entries may be inactive or old versions. Nonstandard manifest paths and admin skill directories are not scanned. Connectors show local app configuration and plugin declarations only; the cloud account catalog is not queried.");
  } else {
    await skills(join(claude, "skills"), "Personal"); await agents(join(claude, "agents"), "Personal", "md");
    const userPath = join(home, ".claude.json"), user = await file(userPath, "json");
    if (user) { servers(user.mcpServers, userPath, "Personal"); if (workspace) servers(record(record(user.projects)[requestedWorkspace || workspace] || record(user.projects)[workspace]).mcpServers, userPath, "Project local"); }
    if (workspace) { await skills(join(workspace, ".claude/skills"), "Project"); await agents(join(workspace, ".claude/agents"), "Project", "md"); const p = join(workspace, ".mcp.json"), m = await file(p, "json"); if (m) servers(m.mcpServers, p, "Project"); }
    const settings = [join(claude, "settings.json"), ...(workspace ? [join(workspace, ".claude/settings.json"), join(workspace, ".claude/settings.local.json")] : [])];
    for (const p of settings) { const d = await file(p, "json"); if (d) for (const [name, enabled] of Object.entries(record(d.enabledPlugins))) add("plugin", name, {}, p, p === settings[0] ? "Personal" : "Project", enabled === false ? "disabled" : "configured"); }
    const registryPath = join(claude, "plugins/installed_plugins.json"), registry = await file(registryPath, "json");
    for (const [name, installs] of Object.entries(record(registry?.plugins))) if (Array.isArray(installs)) for (const item of installs) {
      const d = record(item); if (d.scope !== "user" && (!workspace || d.projectPath !== workspace && d.projectPath !== requestedWorkspace)) continue;
      add("plugin", name, {}, registryPath, "Installed registry");
      if (typeof d.installPath === "string" && isAbsolute(d.installPath)) {
        try { const root = await realpath(join(claude, "plugins")), target = await realpath(d.installPath); if (target.startsWith(`${root}/`)) await plugin(target, "Installed plugin", "found"); else source(d.installPath, "error", "Plugin path outside the local plugin directory was not followed."); } catch { source(d.installPath, "error", "Installed plugin path unavailable."); }
      }
    }
    result.limitations.push("Claude cloud connectors and built-in/session agents are not exposed by this local scan. Plugin enablement remains scope-specific; an installed registry entry does not prove the plugin is active.");
  }
  result.entries.sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source)); return result;
}

export function engineInventoryPlugin(): Plugin {
  return { name: "agentos-engine-inventory", configureServer(server) {
    let active = false;
    server.middlewares.use("/api/engine-inventory", async (req, res) => {
      const host = req.headers.host;
      if (req.method !== "GET" || !["localhost:4173", "127.0.0.1:4173"].includes(host || "") || req.headers["x-agentos-inventory"] !== "1" || req.headers.origin && req.headers.origin !== `http://${host}`) { res.statusCode = 403; res.end(); return; }
      res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
      if (active) { res.statusCode = 429; res.end(); return; }
      try { active = true; const params = new URL(req.url || "/", `http://${host}`).searchParams, engine = params.get("engine"); if (engine !== "codex" && engine !== "claude" && engine !== "gemini") throw new Error("Invalid engine"); res.end(JSON.stringify(await inventory(engine, params.get("workspace") || resolve(server.config.root, "../.."), { codexHome: process.env.CODEX_HOME, claudeHome: process.env.CLAUDE_CONFIG_DIR }))); }
      catch { res.statusCode = 400; res.end(JSON.stringify({ error: "Unable to scan this workspace. No configuration was changed." })); } finally { active = false; }
    });
  } };
}
