import { isActiveRun, type LiveRun } from "../engines/live-runtime";

export type AgentMapState = "working" | "idle" | "offline" | "approval";

export function agentMapState(runs: LiveRun[], agentId: string): AgentMapState {
  if (runs.some((run) => run.currentAgentId === agentId && run.status === "awaiting_approval"))
    return "approval";
  if (runs.some((run) => isActiveRun(run) && run.currentAgentId === agentId)) return "working";
  if (
    runs.some((run) =>
      run.results.some(
        (result) =>
          result.status === "completed" &&
          run.request.steps.some((step) => step.id === result.id && step.agentId === agentId),
      ),
    )
  )
    return "idle";
  return "offline";
}

export function agentMapRuns(runs: LiveRun[], agentId: string): LiveRun[] {
  return runs
    .filter(
      (run) =>
        run.currentAgentId === agentId ||
        run.request.steps.some((step) => step.agentId === agentId),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
