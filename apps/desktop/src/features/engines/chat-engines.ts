export const CHAT_ENGINES = ["Codex", "Claude Code"] as const;
export type ChatEngine = (typeof CHAT_ENGINES)[number];
export type ChatEnginePreferences = { enabled: ChatEngine[]; default: ChatEngine };

export const CHAT_ENGINES_STORAGE = "agentos:chat-engines:v1";

export const defaultChatEngines: ChatEnginePreferences = {
  enabled: [...CHAT_ENGINES],
  default: "Codex",
};

const isChatEngine = (value: unknown): value is ChatEngine =>
  CHAT_ENGINES.includes(value as ChatEngine);

/** At least one engine stays on, and the default is always one of the enabled engines. */
export function normalizeChatEngines(value: unknown): ChatEnginePreferences {
  const saved = value as Partial<ChatEnginePreferences> | null;
  const enabled = CHAT_ENGINES.filter(
    (engine) => Array.isArray(saved?.enabled) && saved.enabled.includes(engine),
  );
  if (!enabled.length) return defaultChatEngines;
  return {
    enabled,
    default:
      isChatEngine(saved?.default) && enabled.includes(saved.default) ? saved.default : enabled[0]!,
  };
}

export function readChatEngines(): ChatEnginePreferences {
  try {
    return normalizeChatEngines(JSON.parse(localStorage.getItem(CHAT_ENGINES_STORAGE) || "null"));
  } catch {
    return defaultChatEngines;
  }
}

export function saveChatEngines(value: ChatEnginePreferences) {
  localStorage.setItem(CHAT_ENGINES_STORAGE, JSON.stringify(normalizeChatEngines(value)));
}

/** Engines to offer in a composer; an existing chat keeps its engine even if it was turned off. */
export function chatEngineOptions(prefs: ChatEnginePreferences, current?: string): string[] {
  return [...new Set([...prefs.enabled, ...(current ? [current] : [])])];
}
