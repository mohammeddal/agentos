import { describe, expect, it } from "vitest";
import type { LiveRun, LiveStep } from "../engines/live-runtime";
import type { CanvasNode, TaskCanvasGraph } from "../tasks/task-canvas-model";
import { canvasRunStatuses, stoppedStep } from "./run-state";

const node = (id: string, kind: CanvasNode["kind"] = "agent") => ({ id, kind }) as CanvasNode;
const step = (id: string, after: string[] = []) => ({ id, after }) as LiveStep;
const graph: TaskCanvasGraph = {
  version: 1,
  nodes: [node("a"), node("gate", "approval"), node("b"), node("ctx", "context")],
  edges: [
    { id: "1", from: "a", to: "gate", kind: "flow", condition: "success" },
    { id: "2", from: "gate", to: "b", kind: "flow", condition: "approved" },
    { id: "3", from: "ctx", to: "a", kind: "attachment", condition: "success" },
  ],
};
const run = (values: Partial<LiveRun>) =>
  ({
    status: "running",
    results: [],
    approvals: [],
    request: { steps: [step("canvas-a-x"), step("canvas-b-y", ["canvas-a-x"])] },
    ...values,
  }) as unknown as LiveRun;

describe("canvas run statuses", () => {
  it("shows nothing before a run exists", () => {
    expect(canvasRunStatuses(graph, undefined)).toEqual({});
  });
  it("marks the running step, queues the rest, and leaves resources alone", () => {
    const statuses = canvasRunStatuses(
      graph,
      run({ results: [{ id: "canvas-a-x", label: "", status: "running", output: "" }] }),
    );
    expect(statuses).toEqual({ a: "working", gate: "waiting", b: "waiting" });
  });
  it("puts the approval on the gate and the step waiting behind it", () => {
    const statuses = canvasRunStatuses(
      graph,
      run({
        status: "awaiting_approval",
        results: [{ id: "canvas-a-x", label: "", status: "completed", output: "ok" }],
      }),
    );
    expect(statuses).toMatchObject({ a: "done", gate: "approval", b: "approval" });
  });
  it("reports failures and steps that never ran", () => {
    const statuses = canvasRunStatuses(
      graph,
      run({
        status: "failed",
        results: [{ id: "canvas-a-x", label: "", status: "failed", output: "" }],
      }),
    );
    expect(statuses).toMatchObject({ a: "failed", b: "skipped", gate: "skipped" });
  });
  it("shows a step as working the moment the runtime marks it running", () => {
    const statuses = canvasRunStatuses(
      graph,
      run({ results: [{ id: "canvas-a-x", label: "A", status: "running", output: "" }] }),
    );
    expect(statuses.a).toBe("working");
    expect(statuses.b).toBe("waiting");
  });
  it("does not show a stopped run's leftover running step as working", () => {
    const leftover = [{ id: "canvas-a-x", label: "A", status: "running", output: "" }];
    expect(canvasRunStatuses(graph, run({ status: "canceled", results: leftover })).a).toBe(
      "skipped",
    );
    expect(canvasRunStatuses(graph, run({ status: "failed", results: leftover })).a).toBe("failed");
  });
  it("finds the step to retry or resume from", () => {
    const results = [
      { id: "canvas-a-x", label: "A", status: "completed", output: "ok" },
      { id: "canvas-b-y", label: "B", status: "failed", output: "boom" },
    ];
    expect(stoppedStep(run({ status: "failed", results }))?.id).toBe("canvas-b-y");
    expect(
      stoppedStep(
        run({
          status: "canceled",
          results: [{ id: "canvas-a-x", label: "A", status: "running", output: "" }],
        }),
      )?.id,
    ).toBe("canvas-a-x");
    expect(stoppedStep(run({ status: "completed", results }))).toBeUndefined();
    expect(stoppedStep(run({ status: "running", results }))).toBeUndefined();
  });
});
