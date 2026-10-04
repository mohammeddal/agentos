import { describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
import { mentionedTools } from "./installed-tools";
import type { Capability } from "./engine-inventory";

const tool = (name: string): Capability => ({
  id: `mcp:${name}`,
  kind: "mcp",
  name,
  description: "",
  source: "~/.codex/config.toml",
  scope: "user",
  status: "configured",
});
const tools = [tool("notebooklm"), tool("github"), tool("notebooklm-pro")];

describe("mentionedTools", () => {
  it("matches explicit requests", () => {
    expect(mentionedTools("Please use notebooklm to summarize", tools).map((t) => t.name)).toEqual([
      "notebooklm",
    ]);
    expect(mentionedTools("summarize with @GitHub issues", tools).map((t) => t.name)).toEqual([
      "github",
    ]);
  });
  it("ignores bare mentions and longer names", () => {
    expect(mentionedTools("the github repo is down", tools)).toEqual([]);
    expect(mentionedTools("use notebooklm-pro", tools).map((t) => t.name)).toEqual([
      "notebooklm-pro",
    ]);
  });
});
