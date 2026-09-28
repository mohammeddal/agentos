import { describe, expect, it } from "vitest";
import { chatEngineOptions, defaultChatEngines, normalizeChatEngines } from "./chat-engines";

describe("chat engine preferences", () => {
  it("falls back to every engine when nothing valid is saved", () => {
    expect(normalizeChatEngines(null)).toEqual(defaultChatEngines);
    expect(normalizeChatEngines({ enabled: [], default: "Codex" })).toEqual(defaultChatEngines);
  });
  it("keeps the default inside the enabled engines", () => {
    expect(normalizeChatEngines({ enabled: ["Claude Code"], default: "Codex" })).toEqual({
      enabled: ["Claude Code"],
      default: "Claude Code",
    });
    expect(
      normalizeChatEngines({ enabled: ["Codex", "Claude Code", "Nope"], default: "Claude Code" }),
    ).toEqual({ enabled: ["Codex", "Claude Code"], default: "Claude Code" });
  });
  it("offers only enabled engines, plus an existing chat's engine", () => {
    const prefs = { enabled: ["Claude Code" as const], default: "Claude Code" as const };
    expect(chatEngineOptions(prefs)).toEqual(["Claude Code"]);
    expect(chatEngineOptions(prefs, "Codex")).toEqual(["Claude Code", "Codex"]);
  });
});
