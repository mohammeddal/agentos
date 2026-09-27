import {
  taskParticipants,
  type Company,
  type CompanyChat,
  type CompanyTask,
} from "../company/company-model";
import { reviewerName } from "./task-approvals";
import { conditionLabels, handoffName, type HandoffCondition } from "./task-workflow";
import type { RehearsalRun } from "../activity/task-rehearsal";

export type DetailStep = {
  id: string;
  title: string;
  description: string;
  state: "Planned" | "Saved locally";
  after: string;
  condition: string;
  approval: string;
  at?: string;
};
function conditionText(condition: HandoffCondition) {
  return condition.kind === "match"
    ? `If ${condition.field} ${condition.operator} ${condition.value}`
    : conditionLabels[condition.kind];
}
function approvalText(company: Company, task: Pick<CompanyTask, "approval">) {
  return task.approval && task.approval.kind !== "none"
    ? `Approval required: ${reviewerName(company, task.approval)}`
    : "No additional approval configured";
}
export function plannedSteps(company: Company, task: CompanyTask): DetailStep[] {
  const team = taskParticipants(company, task.assignment);
  return [
    {
      id: "start",
      title: task.title,
      description: task.brief || "No brief provided.",
      state: "Planned",
      after: "Task start",
      condition: team.length
        ? `Assigned to ${team.map((a) => a.name).join(", ")}`
        : "No available agents assigned",
      approval: approvalText(company, task),
    },
    ...(task.handoffs || []).map((step) => {
      const parent = task.handoffs?.find((s) => s.id === step.after);
      const linked =
        step.kind === "task" ? company.tasks?.find((t) => t.id === step.targetId) : undefined;
      return {
        id: step.id,
        title: handoffName(company, step),
        description: step.instruction || linked?.brief || "No instruction provided.",
        state: "Planned" as const,
        after:
          step.after === "start"
            ? task.title
            : parent
              ? handoffName(company, parent)
              : "Unavailable parent step",
        condition: conditionText(step.condition),
        approval: `${approvalText(company, step)}${linked?.approval && linked.approval.kind !== "none" ? ` · Linked task also requires ${reviewerName(company, linked.approval)}` : ""}${step.condition.kind === "approval" ? " · Successful source output must also be approved" : ""}`,
      };
    }),
  ];
}
export function chatSteps(chat: CompanyChat): DetailStep[] {
  return chat.messages.map((m, index) => ({
    id: m.id,
    title: `Prompt ${index + 1}`,
    description: m.text,
    state: "Saved locally",
    after: "Local draft",
    condition: "Not sent to an engine",
    approval: "No execution requested",
    at: m.createdAt,
  }));
}
export function relatedRehearsals(runs: RehearsalRun[], taskId?: string): RehearsalRun[] {
  return taskId
    ? runs
        .filter((run) => run.taskId === taskId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    : [];
}
