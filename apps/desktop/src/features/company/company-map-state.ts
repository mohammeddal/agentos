import { taskParticipants, type Company, type CompanyTask } from "./company-model";
import { engineId, isActiveRun, type LiveEngine, type LiveRun } from "../engines/live-runtime";

/**
 * Map states, from most to least urgent:
 * - approval: a run on this agent is paused for your decision ("Needs you")
 * - working: a run is on this agent's step right now
 * - ready: the agent's engine is available and it has nothing to do
 * - offline: the agent's engine is missing or unavailable, so it cannot take work
 */
export type AgentMapState = "approval" | "working" | "ready" | "offline";
/** A short-lived marker for the latest finished work, shown alongside the state. */
export type AgentOutcome = "failed" | "done";

export const agentStateLabels: Record<AgentMapState, string> = {
  approval: "Needs you",
  working: "Working",
  ready: "Ready",
  offline: "Offline",
};

/** Whether an agent's engine can take work. Assumed ready while the Mac app is still checking. */
export function engineReady(
  runtime: { native: boolean; engines: LiveEngine[] },
  agentEngine: string,
): boolean {
  if (!runtime.native) return false;
  if (!runtime.engines.length) return true;
  try {
    const id = engineId(agentEngine);
    return runtime.engines.some((engine) => engine.engine === id && engine.installed);
  } catch {
    return false;
  }
}

export function agentMapState(runs: LiveRun[], agentId: string, ready: boolean): AgentMapState {
  if (runs.some((run) => run.currentAgentId === agentId && run.status === "awaiting_approval"))
    return "approval";
  if (runs.some((run) => isActiveRun(run) && run.currentAgentId === agentId)) return "working";
  return ready ? "ready" : "offline";
}

export const RECENT_OUTCOME_MS = 10 * 60 * 1000;

/** "done" or "failed" when the agent's latest run finished within the last few minutes. */
export function agentRecentOutcome(
  runs: LiveRun[],
  agentId: string,
  now: number,
): AgentOutcome | null {
  const latest = agentMapRuns(runs, agentId)[0];
  if (!latest || isActiveRun(latest) || now - latest.updatedAt > RECENT_OUTCOME_MS) return null;
  const mine = latest.results.filter((result) =>
    latest.request.steps.some((step) => step.id === result.id && step.agentId === agentId),
  );
  if (mine.some((result) => result.status === "failed") || latest.status === "failed")
    return "failed";
  return mine.some((result) => result.status === "completed") ? "done" : null;
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
 * The office whose room shows a workflow: the office it was created in, otherwise the office that
 * holds most of its agents (the earliest such office on a tie).
 */
export function workflowOfficeId(company: Company, task: CompanyTask): string | undefined {
  if (task.officeId && company.offices.some((office) => office.id === task.officeId))
    return task.officeId;
  const team = new Set(taskParticipants(company, task.assignment).map((agent) => agent.id));
  let best: { id: string; count: number } | undefined;
  for (const office of company.offices) {
    const count = office.agents.filter((agent) => team.has(agent.id)).length;
    if (count && (!best || count > best.count)) best = { id: office.id, count };
  }
  return best?.id;
}
