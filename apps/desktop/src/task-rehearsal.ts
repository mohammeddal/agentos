import type { Company, CompanyTask } from "./company-model";
import { assignedAgentIds, approvalError, isApprovalRule, reviewerName, type ApprovalRule } from "./task-approvals";
import { evaluateCondition, handoffName, isHandoffStep, taskPlanError, type HandoffCondition, type SampleResult } from "./task-workflow";

export type ActionStatus = "queued" | "running" | "awaiting_approval" | "succeeded" | "failed" | "rejected" | "skipped" | "canceled";
export type ReviewGate = { id: string; reviewer: ApprovalRule; reviewerName: string; decision: "pending" | "approved" | "rejected"; note: string; decidedAt?: string };
export type RehearsalAction = { id: string; label: string; after: string | null; description: string; performers: string[]; performerIds?: string[]; gates: ReviewGate[]; condition: HandoffCondition; status: ActionStatus; result?: SampleResult };
export type RehearsalEvent = { at: string; text: string; actionId?: string; level?: "info" | "error" | "approval" };
export type RehearsalRun = { id: string; taskId: string; title: string; mode: "rehearsal"; createdAt: string; actions: RehearsalAction[]; events: RehearsalEvent[] };
export const statusLabels: Record<ActionStatus, string> = { queued: "Queued", running: "Running", awaiting_approval: "Awaiting approval", succeeded: "Completed", failed: "Failed", rejected: "Rejected", skipped: "Skipped", canceled: "Canceled" };
const activeStatuses: ActionStatus[] = ["queued", "running", "awaiting_approval"];

function log(run: RehearsalRun, text: string, actionId?: string, level: RehearsalEvent["level"] = "info") { run.events.push({ at: new Date().toISOString(), text, ...(actionId ? { actionId } : {}), level }); }
function settle(run: RehearsalRun): RehearsalRun {
  for (const action of run.actions) {
    if (action.status !== "queued" && action.status !== "awaiting_approval") continue;
    if (action.after) {
      const parent = run.actions.find(a => a.id === action.after);
      if (!parent || ["rejected", "skipped", "canceled"].includes(parent.status)) { action.status = "skipped"; log(run, `${action.label}: skipped because the source did not proceed.`, action.id); continue; }
      if (parent.status !== "succeeded" && parent.status !== "failed") continue;
      if (!parent.result || evaluateCondition(action.condition, parent.result) !== "ready") { action.status = "skipped"; log(run, `${action.label}: condition not met.`, action.id); continue; }
    }
    const next = action.gates.some(g => g.decision === "rejected") ? "rejected" : action.gates.some(g => g.decision === "pending") ? "awaiting_approval" : "running";
    if (next !== action.status) { action.status = next; log(run, `${action.label}: ${statusLabels[next].toLowerCase()} (rehearsal).`, action.id, next === "rejected" ? "error" : next === "awaiting_approval" ? "approval" : "info"); }
  }
  return run;
}

export function createRehearsal(company: Company, task: CompanyTask): RehearsalRun {
  const planError = taskPlanError(company, task);
  if (planError) throw new Error(planError);
  if (!assignedAgentIds(company, task.assignment).length) throw new Error("Add agents to the starting team before rehearsing this task.");
  function gates(rules: (ApprovalRule | undefined)[], executors: string[]): ReviewGate[] {
    const result: ReviewGate[] = [];
    for (const rule of rules) {
      if (!rule || rule.kind === "none") continue;
      const error = approvalError(company, rule, executors);
      if (error) throw new Error(error);
      const id = rule.kind === "human" ? "human" : `agent:${rule.agentId}`;
      if (!result.some(g => g.id === id)) result.push({ id, reviewer: { ...rule }, reviewerName: reviewerName(company, rule), decision: "pending", note: "" });
    }
    return result;
  }
  const names = (ids: string[]) => company.offices.flatMap(o => o.agents).filter(a => ids.includes(a.id)).map(a => a.name);
  const startIds = assignedAgentIds(company, task.assignment);
  const actions: RehearsalAction[] = [{ id: "start", label: task.title, after: null, description: task.brief || "Starting task", performers: names(startIds), performerIds: [...startIds], gates: gates([task.approval], startIds), condition: { kind: "always" }, status: "queued" }];
  for (const step of task.handoffs || []) {
    const linked = step.kind === "task" ? company.tasks?.find(t => t.id === step.targetId) : undefined;
    if (linked) { const error = taskPlanError(company, linked); if (error) throw new Error(`Linked task: ${error}`); }
    const ids = linked ? assignedAgentIds(company, linked.assignment) : [step.targetId];
    if (!ids.length) throw new Error("A linked task has no assigned agents. Add its team before rehearsing.");
    actions.push({ id: step.id, label: handoffName(company, step), after: step.after, description: step.instruction || linked?.brief || "Linked task", performers: names(ids), performerIds: [...ids], condition: step.condition.kind === "approval" ? { kind: "success" } : structuredClone(step.condition), gates: gates([step.approval, linked?.approval, step.condition.kind === "approval" ? { kind: "human" } : undefined], ids), status: "queued" });
  }
return settle({ id: crypto.randomUUID(), taskId: task.id, title: task.title, mode: "rehearsal", createdAt: new Date().toISOString(), actions, events: [{ level: "info", at: new Date().toISOString(), text: "Local rehearsal created from a frozen plan. No engines or external tools are invoked." }] });
}

export function decideRehearsal(run: RehearsalRun, actionId: string, gateId: string, actor: "human" | `agent:${string}`, approve: boolean, note: string): RehearsalRun {
  const next = structuredClone(run), action = next.actions.find(a => a.id === actionId), gate = action?.gates.find(g => g.id === gateId);
  if (!action || action.status !== "awaiting_approval" || !gate || gate.decision !== "pending" || gate.id !== actor) throw new Error("This review is no longer pending or belongs to a different reviewer.");
  if (!approve && !note.trim()) throw new Error("Give a reason for rejection.");
  gate.decision = approve ? "approved" : "rejected"; gate.note = note.trim(); gate.decidedAt = new Date().toISOString();
  log(next, `${gate.reviewerName} ${approve ? "approved" : "rejected"} ${action.label} (simulated decision).${gate.note ? ` ${gate.note}` : ""}`, action.id, "approval");
  return settle(next);
}

export function finishRehearsalAction(run: RehearsalRun, actionId: string, outcome: "success" | "failure", output: unknown): RehearsalRun {
  const next = structuredClone(run), action = next.actions.find(a => a.id === actionId);
  if (!action || action.status !== "running") throw new Error("Only a running rehearsal action can be completed.");
  action.status = outcome === "success" ? "succeeded" : "failed";
  action.result = { outcome, output, approved: false };
  log(next, `${action.label}: simulated ${outcome}.`, action.id, outcome === "failure" ? "error" : "info");
  return settle(next);
}

export function cancelRehearsal(run: RehearsalRun): RehearsalRun {
  const next = structuredClone(run);
  for (const action of next.actions) if (activeStatuses.includes(action.status)) action.status = "canceled";
  log(next, "Rehearsal canceled. Pending review requests are closed.");
  return next;
}
export function runStatus(run: RehearsalRun): ActionStatus {
  for (const status of ["awaiting_approval", "running", "queued", "canceled", "rejected", "failed"] as ActionStatus[]) if (run.actions.some(a => a.status === status)) return status;
  return "succeeded";
}
export function isRehearsalRun(value: unknown): value is RehearsalRun {
  if (!value || typeof value !== "object") return false;
  const r = value as RehearsalRun;
  if (!(r.mode === "rehearsal" && typeof r.id === "string" && typeof r.taskId === "string" && typeof r.title === "string" && typeof r.createdAt === "string"
    && Array.isArray(r.events) && r.events.every(e => !!e && typeof e.at === "string" && typeof e.text === "string")
    && Array.isArray(r.actions) && r.actions.length > 0 && r.actions.every(a => !!a && typeof a.id === "string" && typeof a.label === "string" && typeof a.description === "string" && (a.after === null || typeof a.after === "string") && Object.hasOwn(statusLabels, a.status) && isHandoffStep({ id: a.id, after: a.after || "start", kind: "agent", targetId: "sample", instruction: a.description, condition: a.condition }) && Array.isArray(a.performers) && a.performers.every(p => typeof p === "string") && Array.isArray(a.gates) && a.gates.every(g => !!g && typeof g.id === "string" && isApprovalRule(g.reviewer) && typeof g.reviewerName === "string" && ["pending", "approved", "rejected"].includes(g.decision) && typeof g.note === "string")))) return false;
  const seen = new Set<string>();
  for (const [index, action] of r.actions.entries()) {
    if (action.performerIds !== undefined && (!Array.isArray(action.performerIds) || !action.performerIds.every(id => typeof id === "string" && !!id) || new Set(action.performerIds).size !== action.performerIds.length)) return false;
    if (seen.has(action.id) || (index === 0 ? action.id !== "start" || action.after !== null : !action.after || !seen.has(action.after))) return false;
    seen.add(action.id);
    if (action.result !== undefined && (!action.result || !["success", "failure"].includes(action.result.outcome) || typeof action.result.approved !== "boolean")) return false;
    if (["succeeded", "failed"].includes(action.status) && !action.result) return false;
    if (new Set(action.gates.map(g => g.id)).size !== action.gates.length) return false;
    if (action.gates.some(g => g.reviewer.kind === "none" || g.id !== (g.reviewer.kind === "human" ? "human" : `agent:${g.reviewer.agentId}`))) return false;
    if (["running", "succeeded", "failed"].includes(action.status) && action.gates.some(g => g.decision !== "approved")) return false;
  }
  if (r.events.some(e => e.actionId !== undefined && (typeof e.actionId !== "string" || !seen.has(e.actionId)) || e.level !== undefined && !["info", "error", "approval"].includes(e.level))) return false;
  return true;
}
