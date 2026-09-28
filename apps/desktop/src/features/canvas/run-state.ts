import { isActiveRun, type LiveRun } from "../engines/live-runtime";
import type { TaskCanvasGraph } from "../tasks/task-canvas-model";
import type { CanvasStatus } from "./CanvasKit";

/** Steps compiled from a canvas block are named `canvas-<nodeId>-<agentId>`. */
export const nodeSteps = (run: LiveRun, nodeId: string) =>
  run.request.steps.filter((step) => step.id.startsWith(`canvas-${nodeId}-`));

/** Steps that have not started but whose prerequisites have all finished. */
function readySteps(run: LiveRun) {
  const done = new Set(run.results.filter((r) => r.status !== "running").map((r) => r.id));
  const started = new Set(run.results.map((r) => r.id));
  return run.request.steps.filter(
    (step) => !started.has(step.id) && step.after.every((id) => done.has(id)),
  );
}

function stepsStatus(run: LiveRun, stepIds: string[]): CanvasStatus {
  const results = run.results.filter((r) => stepIds.includes(r.id));
  const active = isActiveRun(run);
  if (results.some((r) => r.status === "failed")) return "failed";
  if (results.some((r) => r.status === "running"))
    return run.status === "awaiting_approval" ? "approval" : "working";
  if (results.length === stepIds.length)
    return results.every((r) => r.status === "skipped") ? "skipped" : "done";
  if (results.length) return active ? "working" : "done";
  if (!active) return "skipped";
  const ready = readySteps(run).some((step) => stepIds.includes(step.id));
  return ready && run.status === "awaiting_approval" ? "approval" : "waiting";
}

/** Live status for every block that takes part in execution; resources get no status. */
export function canvasRunStatuses(
  graph: TaskCanvasGraph,
  run: LiveRun | undefined,
): Record<string, CanvasStatus> {
  if (!run) return {};
  const statuses: Record<string, CanvasStatus> = {};
  for (const node of graph.nodes) {
    const steps = nodeSteps(run, node.id);
    if (steps.length)
      statuses[node.id] = stepsStatus(
        run,
        steps.map((s) => s.id),
      );
  }
  // Approval blocks compile into gates on the next step, so they mirror what follows them.
  for (const node of graph.nodes.filter((n) => n.kind === "approval")) {
    const next = graph.edges
      .filter((e) => e.kind === "flow" && e.from === node.id)
      .map((e) => statuses[e.to])
      .filter((s): s is CanvasStatus => !!s);
    statuses[node.id] = next.includes("approval")
      ? "approval"
      : next.some((s) => ["working", "done", "failed"].includes(s))
        ? "done"
        : next.length && next.every((s) => s === "skipped")
          ? "skipped"
          : "waiting";
  }
  return statuses;
}
