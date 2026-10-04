/** One choice for how independently engines work during tasks and chats that can make changes. */
export type Autonomy = "ask" | "risky" | "auto";

export type ProviderPermissions = {
  codex: "untrusted" | "on-request" | "never";
  claude: "default" | "acceptEdits" | "auto";
  /** Allow Codex network access inside the workspace sandbox, e.g. to install packages. */
  codexNetwork: boolean;
  /** Approval scopes always allowed without asking, such as `mcp:notebooklm`. */
  alwaysAllow: string[];
};

export const PROVIDER_PERMISSIONS_STORAGE = "agentos:provider-permissions:v1";
export const AUTONOMY_STORAGE = "agentos:autonomy:v1";

export const autonomyOptions: Record<Autonomy, { label: string; detail: string }> = {
  ask: {
    label: "Ask me",
    detail: "Pause before commands, edits, and tool calls. No internet access.",
  },
  risky: {
    label: "Ask for risky actions",
    detail:
      "Work freely in the task folder and install packages; ask before anything outside it, and before tool calls.",
  },
  auto: {
    label: "Run on its own",
    detail:
      "Never pause for provider prompts. Approval blocks you add to a workflow still stop the run.",
  },
};

export function permissionsFor(
  autonomy: Autonomy,
  alwaysAllow: string[] = [],
): ProviderPermissions {
  if (autonomy === "ask")
    return { codex: "untrusted", claude: "default", codexNetwork: false, alwaysAllow };
  if (autonomy === "auto")
    return { codex: "never", claude: "auto", codexNetwork: true, alwaysAllow };
  return { codex: "on-request", claude: "acceptEdits", codexNetwork: true, alwaysAllow };
}

export const ALWAYS_ALLOW_STORAGE = "agentos:always-allow:v1";

export function readAlwaysAllow(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(ALWAYS_ALLOW_STORAGE) || "[]");
    return Array.isArray(saved)
      ? saved.filter((item): item is string => typeof item === "string" && item.length <= 200)
      : [];
  } catch {
    return [];
  }
}

export function saveAlwaysAllow(scopes: string[]) {
  localStorage.setItem(ALWAYS_ALLOW_STORAGE, JSON.stringify([...new Set(scopes)].sort()));
}

/** A readable label for an approval scope. */
export function scopeLabel(scope: string): string {
  const [kind, ...rest] = scope.split(":");
  const name = rest.join(":");
  if (kind === "mcp") return `${name} tools (MCP)`;
  if (kind === "command") return `${name} commands`;
  if (kind === "claude") return `Claude Code ${name} tool`;
  if (scope === "codex:file-edits") return "Codex file edits";
  return scope;
}

export const DEFAULT_AUTONOMY: Autonomy = "risky";

export function readAutonomy(): Autonomy {
  try {
    const saved = localStorage.getItem(AUTONOMY_STORAGE);
    if (saved === "ask" || saved === "risky" || saved === "auto") return saved;
    // Carry over the older per-engine settings once.
    const legacy = JSON.parse(localStorage.getItem(PROVIDER_PERMISSIONS_STORAGE) || "null");
    if (legacy?.codex === "never") return "auto";
    if (legacy) return "risky";
  } catch {
    /* Fall back to the default. */
  }
  return DEFAULT_AUTONOMY;
}

export function saveAutonomy(value: Autonomy) {
  localStorage.setItem(AUTONOMY_STORAGE, value);
}

export function readProviderPermissions(): ProviderPermissions {
  return permissionsFor(readAutonomy(), readAlwaysAllow());
}
