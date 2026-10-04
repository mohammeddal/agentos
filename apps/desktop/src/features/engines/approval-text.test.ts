import { describe, expect, it } from "vitest";
import { describeApproval } from "./approval-text";

describe("describeApproval", () => {
  it("explains Codex commands and file edits", () => {
    expect(
      describeApproval({
        title: "item/commandExecution/requestApproval",
        detail: JSON.stringify({ command: ["npm", "install"], reason: "Install dependencies" }),
      }),
    ).toMatchObject({
      title: "Run this command?",
      summary: "`npm install` — Install dependencies",
    });
    expect(
      describeApproval({
        title: "item/fileChange/requestApproval",
        detail: JSON.stringify({ grantRoot: "/Users/me/.codex" }),
      }).title,
    ).toBe("Allow edits outside the task folder?");
  });
  it("explains Claude tools, including MCP tools", () => {
    expect(
      describeApproval({ title: "Allow Write?", detail: JSON.stringify({ file_path: "a.md" }) }),
    ).toMatchObject({ title: "Allow Write?", summary: "a.md" });
    expect(describeApproval({ title: "Allow mcp__notebooklm__query?", detail: "{}" }).title).toBe(
      "Allow the notebooklm tool?",
    );
  });
  it("keeps workflow gates as written", () => {
    expect(describeApproval({ title: "Approve Review assets?", detail: "Final sign-off" })).toEqual(
      {
        title: "Approve Review assets?",
        summary: "Final sign-off",
        detail: "Final sign-off",
      },
    );
  });
});
