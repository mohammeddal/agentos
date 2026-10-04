/** Turns raw provider approval requests into a plain question and a short, readable detail. */
export type ApprovalText = { title: string; summary: string; detail: string };

const parse = (text: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};
const str = (value: unknown) => (typeof value === "string" ? value : "");
const commandText = (value: unknown) =>
  Array.isArray(value) ? value.filter((v) => typeof v === "string").join(" ") : str(value);
const short = (text: string, max = 160) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export function describeApproval(approval: { title: string; detail: string }): ApprovalText {
  const params = parse(approval.detail);
  if (approval.title === "item/commandExecution/requestApproval") {
    const command = commandText(params?.command);
    return {
      title: command ? "Run this command?" : "Run a command?",
      summary: [command && `\`${short(command, 200)}\``, str(params?.reason)]
        .filter(Boolean)
        .join(" — "),
      detail: approval.detail,
    };
  }
  if (approval.title === "item/fileChange/requestApproval") {
    const root = str(params?.grantRoot);
    return {
      title: root ? "Allow edits outside the task folder?" : "Allow these file edits?",
      summary: [str(params?.reason), root && `Folder: ${root}`].filter(Boolean).join(" — "),
      detail: approval.detail,
    };
  }
  // Claude Code tools: "Allow Bash?", "Allow Write?" with the tool input as JSON.
  const tool = /^Allow (.+)\?$/.exec(approval.title)?.[1];
  if (tool && params) {
    const summary =
      commandText(params.command) ||
      str(params.file_path) ||
      str(params.path) ||
      str(params.url) ||
      str(params.description);
    const name = tool.startsWith("mcp__") ? `the ${tool.split("__")[1]} tool` : tool;
    return {
      title: tool === "Bash" ? "Run this command?" : `Allow ${name}?`,
      summary: short(summary || "", 220),
      detail: approval.detail,
    };
  }
  // Workflow gates and MCP tool prompts are already written for people.
  return {
    title: approval.title,
    summary: short(approval.detail.split("\n")[0] || "", 220),
    detail: approval.detail,
  };
}
