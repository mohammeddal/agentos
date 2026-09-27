export type TerminalEntry = {
  at: number;
  stream: "input" | "stdout" | "stderr" | "system";
  text: string;
};

export type TerminalSession = {
  id: string;
  title: string;
  cwd: string;
  status: "idle" | "running" | "completed" | "failed" | "canceled";
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  entries: TerminalEntry[];
};

export function visibleTerminalText(text: string) {
  return text
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

export function simpleCd(command: string): string | null {
  const match = command.trim().match(/^cd(?:\s+((?:"[^"]*"|'[^']*'|[^;&|]+)))?$/);
  if (!match) return null;
  const value = (match[1] || "~").trim();
  return value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2");
}
