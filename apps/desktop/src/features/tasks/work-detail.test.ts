import { describe, expect, it } from "vitest";
import { starterCompany, type CompanyChat, type CompanyTask } from "../company/company-model";
import { chatSteps, plannedSteps, relatedRehearsals } from "./work-detail";
import { createRehearsal } from "../activity/task-rehearsal";
import { newCanvasNode } from "./task-canvas-model";
const task: CompanyTask = {
  id: "task-1",
  title: "Investigate",
  brief: "Find evidence",
  createdAt: "2026-09-27T12:00:00Z",
  status: "planned",
  assignment: { kind: "agents", targets: ["analyst"] },
  approval: { kind: "human" },
  handoffs: [
    {
      id: "review",
      after: "start",
      kind: "agent",
      targetId: "reviewer",
      instruction: "Review findings",
      condition: { kind: "success" },
    },
    {
      id: "fix",
      after: "start",
      kind: "agent",
      targetId: "developer",
      instruction: "Investigate failure",
      condition: { kind: "failure" },
      approval: { kind: "human" },
    },
    {
      id: "report",
      after: "review",
      kind: "agent",
      targetId: "data-engineer",
      instruction: "Write a report",
      condition: { kind: "match", field: "score", operator: "gt", value: "80" },
    },
  ],
};
describe("work inspection", () => {
  it("shows the configured DAG without inventing executed steps or timestamps", () => {
    const steps = plannedSteps(starterCompany, task);
    expect(steps.map((s) => s.after)).toEqual([
      "Task start",
      "Investigate",
      "Investigate",
      "PR Reviewer",
    ]);
    expect(steps.map((s) => s.condition)).toEqual([
      "Assigned to Data Analyst",
      "On success",
      "On failure",
      "If score gt 80",
    ]);
    expect(steps.every((s) => s.state === "Planned" && !s.at)).toBe(true);
    expect(steps[0]?.approval).toContain("You");
  });
  it("retains additional linked-task approval and source approval conditions", () => {
    const linked = {
      ...task,
      id: "linked",
      title: "Linked",
      approval: { kind: "agent" as const, agentId: "reviewer" },
    };
    const parent: CompanyTask = {
      ...task,
      handoffs: [
        {
          id: "linked-step",
          after: "start",
          kind: "task",
          targetId: "linked",
          instruction: "",
          condition: { kind: "approval" },
          approval: { kind: "human" },
        },
      ],
    };
    const step = plannedSteps({ ...starterCompany, tasks: [linked] }, parent)[1]!;
    expect(step.approval).toContain("You");
    expect(step.approval).toContain("PR Reviewer");
    expect(step.approval).toContain("source output must also be approved");
    expect(step.description).toBe(linked.brief);
  });
  it("shows the compiled visual plan and visible configuration failures", () => {
    const root = newCanvasNode("task", 0, 0, "root");
    const agent = {
      ...newCanvasNode("agent", 300, 0, "agent"),
      reference: "data-engineer",
      prompt: "Verify evidence",
    };
    const canvasTask: CompanyTask = {
      ...task,
      handoffs: [],
      canvas: {
        version: 1,
        nodes: [root, agent],
        edges: [{ id: "flow", from: "root", to: "agent", kind: "flow", condition: "success" }],
      },
    };
    expect(plannedSteps(starterCompany, canvasTask)[0]).toMatchObject({
      title: "Data Engineer",
      condition: "On success",
      after: "Task start",
      description: "Verify evidence",
    });
    expect(
      plannedSteps(starterCompany, {
        ...canvasTask,
        canvas: {
          ...canvasTask.canvas!,
          nodes: canvasTask.canvas!.nodes.map((node) =>
            node.id === "agent" ? { ...node, reference: "missing" } : node,
          ),
        },
      })[0]?.condition,
    ).toBe("Workflow needs configuration");
  });
  it("uses recorded prompt text and time, never generated thinking", () => {
    const chat: CompanyChat = {
      id: "c",
      engine: "Codex",
      createdAt: task.createdAt,
      messages: [{ id: "m", text: "<script>not executable</script>", createdAt: task.createdAt }],
    };
    const steps = chatSteps(chat);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      state: "Saved locally",
      at: task.createdAt,
      description: chat.messages[0]!.text,
      condition: "Not sent to an engine",
    });
  });
  it("matches exact task IDs and preserves frozen rehearsal records", () => {
    const run = createRehearsal(starterCompany, task);
    const older = { ...run, id: "older", createdAt: "2020-01-01T00:00:00Z" };
    const unrelated = { ...run, id: "unrelated", taskId: "task-2" };
    expect(relatedRehearsals([older, unrelated, run], task.id)).toEqual([run, older]);
    expect(relatedRehearsals([run], undefined)).toEqual([]);
    expect(relatedRehearsals([run], "task-2")).toEqual([]);
    expect(run.title).toBe("Investigate");
  });
});
