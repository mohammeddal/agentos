import { describe, expect, it } from "vitest";
import {
  activeCompany,
  affectedRunKeys,
  changeLifecycle,
  directoryEntries,
} from "./company-directory";
import { isCompany, starterCompany, type Company } from "./company-model";
const projectId = "00000000-0000-0000-0000-000000000001";
const date = "2026-09-27T00:00:00Z";
const company: Company = {
  ...starterCompany,
  projects: [
    { id: projectId, name: "Research", brief: "", domains: [], agentIds: [], createdAt: date },
  ],
  chats: [
    {
      id: "chat",
      engine: "Codex",
      projectId,
      createdAt: date,
      messages: [{ id: "m", text: "A question", createdAt: date }],
    },
  ],
  tasks: [
    {
      id: "task",
      title: "Plan",
      brief: "Plan work",
      projectId,
      assignment: { kind: "agents", targets: ["data-engineer"] },
      status: "planned",
      createdAt: date,
    },
    {
      id: "parent",
      title: "Parent",
      brief: "",
      assignment: { kind: "agents", targets: ["data-engineer"] },
      status: "planned",
      createdAt: date,
      handoffs: [
        {
          id: "link",
          after: "start",
          kind: "task",
          targetId: "task",
          instruction: "",
          condition: { kind: "success" },
        },
      ],
    },
  ],
};
describe("workspace lifecycle", () => {
  it("is backwards compatible and leaves source data unchanged", () => {
    expect(isCompany(company)).toBe(true);
    expect(directoryEntries(company)).toHaveLength(4);
    expect(activeCompany(company).chats).toHaveLength(1);
    expect(company.projects?.[0]?.lifecycle).toBeUndefined();
  });
  it("archives a project and hides children without deleting them", () => {
    const next = changeLifecycle(company, { kind: "project", id: projectId }, "archived");
    expect(next.chats).toEqual(company.chats);
    expect(next.tasks).toEqual(company.tasks);
    expect(activeCompany(next).projects).toHaveLength(0);
    expect(activeCompany(next).chats).toHaveLength(0);
    expect(activeCompany(next).tasks?.map((t) => t.id)).toEqual(["parent"]);
    expect(isCompany(JSON.parse(JSON.stringify(next)))).toBe(true);
  });
  it("restores a project without unarchiving independently archived children", () => {
    let next = changeLifecycle(company, { kind: "chat", id: "chat" }, "archived");
    next = changeLifecycle(next, { kind: "project", id: projectId }, "removed");
    next = changeLifecycle(next, { kind: "project", id: projectId }, "active");
    expect(activeCompany(next).chats).toHaveLength(0);
    expect(activeCompany(next).tasks).toHaveLength(2);
  });
  it("soft removal is recoverable and keeps relationships and content", () => {
    const next = changeLifecycle(company, { kind: "task", id: "task" }, "removed");
    expect(next.tasks?.[0]?.brief).toBe("Plan work");
    expect(next.tasks?.[0]?.projectId).toBe(projectId);
    expect(activeCompany(next).tasks).toHaveLength(1);
    expect(
      activeCompany(changeLifecycle(next, { kind: "task", id: "task" }, "active")).tasks,
    ).toHaveLength(2);
  });
  it("blocks active chats, tasks, project children, and linked dependent runs", () => {
    for (const entry of [
      { kind: "project" as const, id: projectId },
      { kind: "task" as const, id: "task" },
    ])
      expect(() => changeLifecycle(company, entry, "removed", ["task:parent"])).toThrow(
        /active run/,
      );
    expect(() =>
      changeLifecycle(company, { kind: "chat", id: "chat" }, "archived", ["chat:chat"]),
    ).toThrow(/active run/);
    expect(affectedRunKeys(company, { kind: "project", id: projectId })).toEqual(
      expect.arrayContaining(["chat:chat", "task:task", "task:parent"]),
    );
  });
  it("rejects missing records and malformed lifecycle states", () => {
    expect(() => changeLifecycle(company, { kind: "task", id: "missing" }, "removed")).toThrow(
      /no longer/,
    );
    expect(
      isCompany({ ...company, projects: [{ ...company.projects![0], lifecycle: "deleted" }] }),
    ).toBe(false);
    expect(isCompany({ ...company, chats: [{ ...company.chats![0], lifecycle: false }] })).toBe(
      false,
    );
  });
});
