import { describe, expect, it } from "vitest";
import { isCompany, isCompanyChat, isCompanyTask, starterCompany } from "../company/company-model";
import { emptyPrompt, parsePromptDraft, quickTaskError, taskFromPrompt } from "./prompt-composer";
describe("prompt-first start", () => {
  it("keeps old companies compatible and accepts local chat drafts", () => {
    const chat = {
      id: "c",
      engine: "Codex",
      createdAt: "2026-09-27T12:00:00Z",
      messages: [{ id: "m", text: "Help me think", createdAt: "2026-09-27T12:00:00Z" }],
    };
    expect(isCompany(starterCompany)).toBe(true);
    expect(isCompany({ ...starterCompany, chats: [chat] })).toBe(true);
    expect(isCompanyChat({ ...chat, messages: [] })).toBe(false);
    expect(isCompanyChat({ ...chat, messages: [null] })).toBe(false);
    expect(isCompanyChat({ ...chat, messages: [{ ...chat.messages[0], text: "" }] })).toBe(false);
  });
  it("restores composer text and rejects malformed drafts", () => {
    expect(parsePromptDraft(null)).toEqual(emptyPrompt);
    const draft = { ...emptyPrompt, text: "Unsaved idea", makeTask: true, target: "a:analyst" };
    expect(parsePromptDraft(JSON.stringify(draft))).toEqual(draft);
    for (const raw of ["null", "{", "{}", JSON.stringify({ ...draft, makeTask: "true" })])
      expect(() => parsePromptDraft(raw)).toThrow();
  });
  it("creates a planned manual task with approval and the full prompt", () => {
    const draft = {
      ...emptyPrompt,
      text: "Investigate revenue\nInclude evidence and next steps.",
      target: "a:analyst",
      makeTask: true,
    };
    const task = taskFromPrompt(starterCompany, draft, "id", "2026-09-27T12:00:00Z");
    expect(isCompanyTask(task)).toBe(true);
    expect(task).toMatchObject({
      title: "Investigate revenue",
      brief: draft.text,
      approval: { kind: "human" },
      schedule: { kind: "manual" },
      status: "planned",
      assignment: { kind: "agents", targets: ["analyst"] },
    });
    expect(task.projectId).toBeUndefined();
  });
  it("validates assignees and projects instead of silently assigning", () => {
    const draft = { ...emptyPrompt, text: "Help", target: "d:Research" };
    expect(quickTaskError(starterCompany, draft)).toBeNull();
    for (const changed of [
      { target: "" },
      { target: "a:missing" },
      { target: "d:missing" },
      { projectId: "missing" },
      { text: "   " },
    ])
      expect(() =>
        taskFromPrompt(starterCompany, { ...draft, ...changed }, "id", "2026-09-27T12:00:00Z"),
      ).toThrow();
  });
  it("retains project context and limits the title without losing the brief", () => {
    const project = {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Project",
      brief: "",
      domains: [],
      agentIds: [],
      createdAt: "2026-09-27T12:00:00Z",
    };
    const task = taskFromPrompt(
      { ...starterCompany, projects: [project] },
      { ...emptyPrompt, text: "x".repeat(3000), target: "d:Research", projectId: project.id },
      "id",
      project.createdAt,
    );
    expect(task.title).toHaveLength(120);
    expect(task.brief).toHaveLength(3000);
    expect(task.projectId).toBe(project.id);
  });
});
