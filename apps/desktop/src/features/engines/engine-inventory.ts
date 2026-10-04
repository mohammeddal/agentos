import { invoke, isTauri } from "@tauri-apps/api/core";

export type Engine = "codex" | "claude" | "gemini";
export type CapabilityKind = "mcp" | "skill" | "agent" | "connector" | "plugin";
export type Capability = {
  id: string;
  kind: CapabilityKind;
  name: string;
  description: string;
  source: string;
  scope: string;
  status: "found" | "configured" | "disabled" | "cached";
};
export type Inventory = {
  engine: Engine;
  workspace: string | null;
  scannedAt: string | number;
  entries: Capability[];
  sources: { path: string; status: "read" | "missing" | "error"; note: string }[];
  limitations: string[];
};
export const engineNames: Record<Engine, string> = {
  codex: "Codex",
  claude: "Claude Code",
  gemini: "Gemini",
};
export const capabilityNames: Record<CapabilityKind, string> = {
  mcp: "MCP servers",
  skill: "Skills",
  agent: "Agents",
  connector: "Connectors",
  plugin: "Plugins",
};
export async function discoverEngine(engine: Engine, workspace?: string): Promise<Inventory> {
  if (isTauri()) return invoke("engine_inventory", { engine, workspace: workspace || null });
  const params = new URLSearchParams({ engine });
  if (workspace) params.set("workspace", workspace);
  const response = await fetch(`/api/engine-inventory?${params}`, {
    headers: { "X-AgentOS-Inventory": "1" },
  });
  if (!response.ok)
    throw new Error("Discovery failed. Check the local server and workspace folder, then retry.");
  return response.json();
}

/** The SKILL.md behind a skill, for previewing what it does. Read-only. */
export async function readSkillDocument(path: string): Promise<string> {
  if (isTauri()) return invoke<string>("skill_document", { path });
  const response = await fetch(`/api/skill-document?path=${encodeURIComponent(path)}`, {
    headers: { "X-AgentOS-Inventory": "1" },
  });
  if (!response.ok) throw new Error("This skill's instructions can't be previewed.");
  return response.text();
}
