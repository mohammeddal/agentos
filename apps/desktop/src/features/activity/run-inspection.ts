import {
  isRehearsalRun,
  type RehearsalAction,
  type RehearsalEvent,
  type RehearsalRun,
} from "./task-rehearsal";
export const REHEARSAL_STORAGE = "agentos:rehearsals:v1";
export function readRehearsals(): { runs: RehearsalRun[]; error: string } {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(REHEARSAL_STORAGE) || "[]");
    if (!Array.isArray(data)) throw new Error();
    const runs = data.filter(isRehearsalRun);
    return {
      runs,
      error:
        runs.length !== data.length
          ? "Some saved records are invalid and could not be displayed. They have not been changed by this inspector."
          : "",
    };
  } catch {
    return { runs: [], error: "Saved history cannot be read. This inspector has not changed it." };
  }
}
export function involvesAgent(action: RehearsalAction, agentId: string) {
  return (
    !!action.performerIds?.includes(agentId) ||
    action.gates.some((g) => g.reviewer.kind === "agent" && g.reviewer.agentId === agentId)
  );
}
export function inspectRun(run: RehearsalRun, agentId?: string, actionId?: string) {
  const actions = run.actions.filter(
    (a) => (!agentId || involvesAgent(a, agentId)) && (!actionId || a.id === actionId),
  );
  const ids = new Set(actions.map((a) => a.id));
  // Legacy events have no reliable action identity. Include them only in the unfiltered run view.
  const events = run.events.filter((e) => {
    if (!actions.length) return false;
    if (!agentId && !actionId) return true;
    return e.actionId ? ids.has(e.actionId) : !!e.level;
  });
  return { actions, events };
}
export function filterLogs(events: RehearsalEvent[], query: string, level: string) {
  return events.filter(
    (e) =>
      (level === "all" || (e.level || "info") === level) &&
      e.text.toLowerCase().includes(query.toLowerCase()),
  );
}
export function outputText(output: unknown): string {
  return typeof output === "string"
    ? output
    : (JSON.stringify(output, null, 2) ?? "No output value was recorded.");
}
export function runExport(run: RehearsalRun, agentId?: string, actionId?: string): string {
  const { actions, events } = inspectRun(run, agentId, actionId);
  return JSON.stringify(
    {
      mode: "rehearsal",
      warning: "Simulated records, not engine logs or real execution evidence.",
      runId: run.id,
      taskId: run.taskId,
      title: run.title,
      createdAt: run.createdAt,
      scope: { agentId: agentId || null, actionId: actionId || null },
      actions,
      events,
    },
    null,
    2,
  );
}
