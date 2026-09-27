import type { Company } from "../company/company-model";

export type ApprovalRule =
  | { kind: "none" }
  | { kind: "human" }
  | { kind: "agent"; agentId: string };
export const noApproval: ApprovalRule = { kind: "none" };
export function isApprovalRule(value: unknown): value is ApprovalRule {
  if (!value || typeof value !== "object") return false;
  const rule = value as ApprovalRule;
  return (
    rule.kind === "none" ||
    rule.kind === "human" ||
    (rule.kind === "agent" && typeof rule.agentId === "string")
  );
}
export function approvalError(
  company: Company,
  rule: ApprovalRule | undefined,
  executorIds: string[],
): string | null {
  if (!rule || rule.kind !== "agent") return null;
  if (!company.offices.some((o) => o.agents.some((a) => a.id === rule.agentId)))
    return "Choose an available reviewer agent.";
  if (executorIds.includes(rule.agentId))
    return "The reviewer must be a different agent from the team performing this action.";
  return null;
}
export function assignedAgentIds(
  company: Company,
  assignment: { kind: "agents" | "domains"; targets: string[] },
): string[] {
  return company.offices.flatMap((o) =>
    o.agents
      .filter((a) => assignment.targets.includes(assignment.kind === "agents" ? a.id : o.domain))
      .map((a) => a.id),
  );
}
export function reviewerName(company: Company, rule: ApprovalRule): string {
  return rule.kind === "human"
    ? "You"
    : rule.kind === "none"
      ? "No approval required"
      : company.offices.flatMap((o) => o.agents).find((a) => a.id === rule.agentId)?.name ||
        "Unavailable reviewer";
}
