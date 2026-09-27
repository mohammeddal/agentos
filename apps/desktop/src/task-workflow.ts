import { CronExpressionParser } from "cron-parser";
import type { Company, CompanyTask } from "./company-model";
import { approvalError, assignedAgentIds, isApprovalRule, type ApprovalRule } from "./task-approvals";

export type TaskSchedule = { kind: "manual" } | { kind: "cron"; expression: string; timeZone: string };
export type HandoffCondition =
  | { kind: "success" | "failure" | "always" | "approval" }
  | { kind: "match"; field: string; operator: "equals" | "contains" | "gt" | "lt"; value: string };
export type HandoffStep = { id: string; after: string; kind: "agent" | "task"; targetId: string; instruction: string; condition: HandoffCondition; approval?: ApprovalRule };
export type SampleResult = { outcome: "success" | "failure"; approved: boolean; output: unknown };
export type RouteState = "ready" | "skipped" | "waiting";
export const conditionLabels = { success: "On success", failure: "On failure", always: "On completion", approval: "After approval", match: "If output matches" };

export function schedulePreview(schedule: TaskSchedule, currentDate = new Date()): { dates: string[]; error: string | null } {
  if (schedule.kind === "manual") return { dates: [], error: null };
  const fields = schedule.expression.trim().split(/\s+/);
  if (fields.length !== 5 || fields.some(field => !/^[\d*,/\-]+$/.test(field))) {
    return { dates: [], error: "Use five numeric cron fields: minute, hour, day of month, month, day of week. Supports *, ranges, lists, and / steps." };
  }
  try {
    if (!schedule.timeZone.trim()) throw new Error("Missing time zone");
    new Intl.DateTimeFormat("en-US", { timeZone: schedule.timeZone }).format(currentDate);
  } catch { return { dates: [], error: "Choose a valid IANA time zone, such as America/Los_Angeles or UTC." }; }
  try {
    const expression = CronExpressionParser.parse(schedule.expression.trim(), { currentDate, tz: schedule.timeZone });
    return { dates: expression.take(3).map(date => date.toDate().toISOString()), error: null };
  } catch { return { dates: [], error: "This cron expression has an invalid range or no upcoming occurrence. Check each field." }; }
}

export function isTaskSchedule(value: unknown): value is TaskSchedule {
  if (!value || typeof value !== "object") return false;
  const s = value as TaskSchedule;
  return s.kind === "manual" || (s.kind === "cron" && typeof s.expression === "string" && typeof s.timeZone === "string");
}

export function isHandoffStep(value: unknown): value is HandoffStep {
  if (!value || typeof value !== "object") return false;
  const step = value as HandoffStep;
  if (step.approval !== undefined && !isApprovalRule(step.approval)) return false;
  if (typeof step.id !== "string" || !step.id || typeof step.after !== "string" || !step.after || !["agent", "task"].includes(step.kind) || typeof step.targetId !== "string" || typeof step.instruction !== "string" || !step.condition) return false;
  const c = step.condition;
  return ["success", "failure", "always", "approval"].includes(c.kind) || (c.kind === "match" && typeof c.field === "string" && ["equals", "contains", "gt", "lt"].includes(c.operator) && typeof c.value === "string");
}

/** Validate both the local ordered DAG and references between saved task workflows. */
export function workflowError(company: Company, taskId: string, steps: HandoffStep[]): string | null {
  const seen = new Set(["start"]);
  const agentIds = new Set(company.offices.flatMap(o => o.agents.map(a => a.id)));
  for (const [index, step] of steps.entries()) {
    const prefix = `Step ${index + 1}: `;
    if (seen.has(step.id) || !seen.has(step.after)) return prefix + "connect to the starting task or an earlier step. Loops are not allowed.";
    seen.add(step.id);
    if (step.kind === "agent" ? !agentIds.has(step.targetId) : !(company.tasks || []).some(t => t.id === step.targetId)) return prefix + `choose an available ${step.kind}.`;
    if (step.kind === "task" && step.targetId === taskId) return prefix + "a task cannot hand off to itself.";
    if (step.kind === "agent" && !step.instruction.trim()) return prefix + "give this agent an instruction.";
    const linked = company.tasks?.find(t => t.id === step.targetId);
    const reviewerError = approvalError(company, step.approval, step.kind === "agent" ? [step.targetId] : linked ? assignedAgentIds(company, linked.assignment) : []);
    if (reviewerError) return prefix + reviewerError;
    if (step.condition.kind === "match") {
      const c = step.condition;
      if (!/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/.test(c.field) || c.field.split(".").some(key => ["__proto__", "prototype", "constructor"].includes(key))) return prefix + "use an output field such as score or review.approved.";
      if (!c.value.trim()) return prefix + "enter a comparison value.";
      if (["gt", "lt"].includes(c.operator) && !Number.isFinite(Number(c.value))) return prefix + "enter a numeric threshold.";
    }
  }
  const tasks = new Map((company.tasks || []).map(t => [t.id, t.handoffs || []]));
  tasks.set(taskId, steps);
  const visiting = new Set<string>(), visited = new Set<string>();
  function hasCycle(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const step of tasks.get(id) || []) if (step.kind === "task" && hasCycle(step.targetId)) return true;
    visiting.delete(id); visited.add(id);
    return false;
  }
  return hasCycle(taskId) ? "This handoff creates a loop between tasks. Choose a different task." : null;
}

export function evaluateCondition(condition: HandoffCondition, result: SampleResult): RouteState {
  if (condition.kind === "always") return "ready";
  if (condition.kind === "failure") return result.outcome === "failure" ? "ready" : "skipped";
  if (result.outcome !== "success") return "skipped";
  if (condition.kind === "success") return "ready";
  if (condition.kind === "approval") return result.approved ? "ready" : "waiting";
  if (condition.kind !== "match") return "skipped";
  let value: unknown = result.output;
  for (const key of condition.field.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key) || ["__proto__", "prototype", "constructor"].includes(key)) return "skipped";
    value = (value as Record<string, unknown>)[key];
  }
  const scalar = ["string", "number", "boolean"].includes(typeof value);
  const matches = condition.operator === "equals" ? scalar && String(value) === condition.value
    : condition.operator === "contains" ? typeof value === "string" && value.includes(condition.value)
    : typeof value === "number" && Number.isFinite(value) && Number.isFinite(Number(condition.value)) && (condition.operator === "gt" ? value > Number(condition.value) : value < Number(condition.value));
  return matches ? "ready" : "skipped";
}

export function previewHandoffs(steps: HandoffStep[], samples: Record<string, SampleResult>): Record<string, RouteState> {
  const states: Record<string, RouteState> = { start: "ready" };
  for (const step of steps) {
    const parent = states[step.after];
    const result = samples[step.after];
    states[step.id] = parent === "waiting" ? "waiting" : parent !== "ready" ? "skipped" : !result ? "waiting" : evaluateCondition(step.condition, result);
    // This condition-only preview cannot grant action-scoped approvals.
    if (states[step.id] === "ready" && step.approval && step.approval.kind !== "none") states[step.id] = "waiting";
  }
  return states;
}

export function handoffName(company: Company, step: HandoffStep): string {
  return (step.kind === "agent" ? company.offices.flatMap(o => o.agents).find(a => a.id === step.targetId)?.name : company.tasks?.find(t => t.id === step.targetId)?.title) || `Choose ${step.kind}`;
}

export function taskPlanError(company: Company, task: CompanyTask): string | null {
  return schedulePreview(task.schedule || { kind: "manual" }).error || approvalError(company, task.approval, assignedAgentIds(company, task.assignment)) || workflowError(company, task.id, task.handoffs || []);
}
