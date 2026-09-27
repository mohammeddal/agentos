import { describe, expect, it } from "vitest";
import { isCompany, starterCompany, type CompanyTask } from "../company/company-model";
import { approvalError } from "../tasks/task-approvals";
import {
  cancelRehearsal,
  createRehearsal,
  decideRehearsal,
  finishRehearsalAction,
  isRehearsalRun,
} from "./task-rehearsal";
import { previewHandoffs, workflowError } from "../tasks/task-workflow";

const task: CompanyTask = {
  id: "review",
  title: "Review data",
  brief: "Check the evidence",
  assignment: { kind: "agents", targets: ["analyst"] },
  approval: { kind: "human" },
  status: "planned",
  createdAt: new Date().toISOString(),
  handoffs: [
    {
      id: "handoff",
      after: "start",
      kind: "agent",
      targetId: "developer",
      instruction: "Implement the fix",
      condition: { kind: "success" },
      approval: { kind: "agent", agentId: "reviewer" },
    },
    {
      id: "after",
      after: "handoff",
      kind: "agent",
      targetId: "analyst",
      instruction: "Verify the result",
      condition: { kind: "success" },
    },
  ],
};
const company = { ...starterCompany, tasks: [task] };

describe("action approval restrictions", () => {
  it("accepts existing tasks and approval rules while rejecting malformed rules", () => {
    expect(isCompany(company)).toBe(true);
    expect(isCompany({ ...company, tasks: [{ ...task, approval: { kind: "everyone" } }] })).toBe(
      false,
    );
  });
  it("prevents self-review and missing reviewers", () => {
    expect(approvalError(company, { kind: "agent", agentId: "analyst" }, ["analyst"])).toContain(
      "different agent",
    );
    expect(approvalError(company, { kind: "agent", agentId: "missing" }, [])).toContain(
      "available",
    );
    expect(
      workflowError(company, task.id, [
        { ...task.handoffs![0]!, approval: { kind: "agent", agentId: "developer" } },
      ]),
    ).toContain("different agent");
  });
  it("starts behind a human gate, then waits for the designated agent at the next action", () => {
    let run = createRehearsal(company, task);
    expect(run.actions.map((a) => a.status)).toEqual(["awaiting_approval", "queued", "queued"]);
    run = decideRehearsal(run, "start", "human", "human", true, "Reviewed");
    expect(run.actions[0]?.status).toBe("running");
    run = finishRehearsalAction(run, "start", "success", {});
    expect(run.actions[1]?.status).toBe("awaiting_approval");
    expect(() => decideRehearsal(run, "handoff", "agent:reviewer", "human", true, "")).toThrow(
      "different reviewer",
    );
    run = decideRehearsal(run, "handoff", "agent:reviewer", "agent:reviewer", true, "Looks good");
    expect(run.actions[1]?.status).toBe("running");
    expect(run.events.some((e) => e.text.includes("PR Reviewer approved"))).toBe(true);
  });
  it("does not complete actions before approval or approve them twice", () => {
    const run = createRehearsal(company, task);
    expect(() => finishRehearsalAction(run, "start", "success", {})).toThrow("running");
    const approved = decideRehearsal(run, "start", "human", "human", true, "");
    expect(() => decideRehearsal(approved, "start", "human", "human", true, "")).toThrow(
      "no longer pending",
    );
  });
  it("requires a rejection reason and skips dependent actions", () => {
    const run = createRehearsal(company, task);
    expect(() => decideRehearsal(run, "start", "human", "human", false, "")).toThrow("reason");
    const rejected = decideRehearsal(run, "start", "human", "human", false, "Needs evidence");
    expect(rejected.actions.map((a) => a.status)).toEqual(["rejected", "skipped", "skipped"]);
    expect(run.actions[0]?.status).toBe("awaiting_approval");
  });
  it("cancellation closes pending gates and prevents stale approval", () => {
    const canceled = cancelRehearsal(createRehearsal(company, task));
    expect(canceled.actions.every((a) => a.status === "canceled")).toBe(true);
    expect(() => decideRehearsal(canceled, "start", "human", "human", true, "")).toThrow();
  });
  it("approvals apply to one action and one run only", () => {
    const first = decideRehearsal(
      createRehearsal(company, task),
      "start",
      "human",
      "human",
      true,
      "",
    );
    const second = createRehearsal(company, task);
    expect(second.id).not.toBe(first.id);
    expect(second.actions[0]?.status).toBe("awaiting_approval");
    expect(first.actions[1]?.gates[0]?.decision).toBe("pending");
  });
  it("keeps frozen descriptions and reviewer names when the original plan changes", () => {
    const original = structuredClone(company);
    const run = createRehearsal(original, original.tasks[0]!);
    original.tasks[0]!.brief = "Changed";
    original.offices[1]!.agents[1]!.name = "Renamed";
    expect(run.actions[0]?.description).toBe("Check the evidence");
    expect(run.actions[1]?.gates[0]?.reviewerName).toBe("PR Reviewer");
    expect(isRehearsalRun(JSON.parse(JSON.stringify(run)))).toBe(true);
  });
  it("honors both a linked task start gate and the handoff gate", () => {
    const target = { ...task, id: "target", handoffs: [] };
    const source: CompanyTask = {
      ...task,
      approval: { kind: "none" },
      handoffs: [
        {
          id: "linked",
          after: "start",
          kind: "task",
          targetId: target.id,
          instruction: "",
          condition: { kind: "success" },
          approval: { kind: "agent", agentId: "reviewer" },
        },
      ],
    };
    const run = finishRehearsalAction(
      createRehearsal({ ...company, tasks: [source, target] }, source),
      "start",
      "success",
      {},
    );
    expect(run.actions[1]?.gates).toHaveLength(2);
    const partial = decideRehearsal(run, "linked", "human", "human", true, "");
    expect(partial.actions[1]?.status).toBe("awaiting_approval");
  });
  it("keeps legacy After approval conditions gated per action", () => {
    const legacy: CompanyTask = {
      ...task,
      approval: { kind: "none" },
      handoffs: [
        { ...task.handoffs![0]!, approval: { kind: "none" }, condition: { kind: "approval" } },
      ],
    };
    const run = finishRehearsalAction(createRehearsal(company, legacy), "start", "success", {});
    expect(run.actions[1]?.status).toBe("awaiting_approval");
    expect(run.actions[1]?.gates[0]?.id).toBe("human");
  });
  it("does not treat condition-preview sample approval as an action permission", () => {
    const states = previewHandoffs(task.handoffs!, {
      start: { outcome: "success", approved: true, output: {} },
    });
    expect(states.handoff).toBe("waiting");
    expect(states.after).toBe("waiting");
  });
  it("rejects malformed persisted rehearsals and inconsistent running gates", () => {
    const run = createRehearsal(company, task);
    const inconsistent = structuredClone(run);
    inconsistent.actions[0]!.status = "running";
    expect(isRehearsalRun(inconsistent)).toBe(false);
    const duplicate = structuredClone(run);
    duplicate.actions[1]!.id = "start";
    expect(isRehearsalRun(duplicate)).toBe(false);
    expect(isRehearsalRun({ ...run, mode: "live" })).toBe(false);
  });
});
