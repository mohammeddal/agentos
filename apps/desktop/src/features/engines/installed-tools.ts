import { useEffect, useSyncExternalStore } from "react";
import { discoverEngine, type Capability, type Engine } from "./engine-inventory";

/** Tools (MCP servers, skills, connectors) installed for each engine, discovered once per session. */
type ToolEngine = Exclude<Engine, "gemini">;
const cache = new Map<ToolEngine, Capability[]>();
const loading = new Set<ToolEngine>();
const listeners = new Set<() => void>();
const empty: Capability[] = [];

function load(engine: ToolEngine) {
  if (cache.has(engine) || loading.has(engine)) return;
  loading.add(engine);
  discoverEngine(engine)
    .then((inventory) =>
      cache.set(
        engine,
        inventory.entries.filter(
          (entry) =>
            ["mcp", "skill", "connector"].includes(entry.kind) && entry.status !== "disabled",
        ),
      ),
    )
    .catch(() => cache.set(engine, []))
    .finally(() => {
      loading.delete(engine);
      listeners.forEach((fn) => fn());
    });
}

export function useInstalledTools(engine: ToolEngine): Capability[] {
  useEffect(() => load(engine), [engine]);
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => cache.get(engine) || empty,
  );
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Tools the text explicitly asks for: "use notebooklm", "using notebooklm", "with notebooklm",
 * or "@notebooklm". A bare mention is ignored so ordinary words don't attach tools.
 */
export function mentionedTools(text: string, tools: Capability[]): Capability[] {
  if (!text.trim()) return [];
  const seen = new Set<string>();
  return tools.filter((tool) => {
    const name = tool.name.trim();
    if (!name || seen.has(name.toLowerCase())) return false;
    const pattern = new RegExp(
      `(?:\\b(?:use|using|with|via)\\s+(?:the\\s+)?|@)${escape(name)}(?![\\w-])`,
      "i",
    );
    if (!pattern.test(text)) return false;
    seen.add(name.toLowerCase());
    return true;
  });
}
