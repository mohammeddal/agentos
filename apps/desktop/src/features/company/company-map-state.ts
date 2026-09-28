import { taskParticipants, type Company, type CompanyTask } from "./company-model";
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

/**
 * The office whose room shows a workflow: the office it was created in, otherwise the one office
 * all of its agents belong to. Workflows spanning several offices stay off the map.
 */
export function workflowOfficeId(company: Company, task: CompanyTask): string | undefined {
  if (task.officeId && company.offices.some((office) => office.id === task.officeId))
    return task.officeId;
  const offices = new Set(
    taskParticipants(company, task.assignment).map(
      (agent) => company.offices.find((office) => office.agents.some((a) => a.id === agent.id))?.id,
    ),
  );
  return offices.size === 1 ? [...offices][0] : undefined;
}
