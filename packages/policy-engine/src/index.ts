import type { RiskClass } from "@staffforge/schemas";

export interface ActionRequest {
  agentId: string; action: string; capability: string; risk: RiskClass;
  parameters: Record<string, unknown>; grantedCapabilities: string[]; allowedActions: string[];
}

export type PolicyDecision =
  | { effect: "allow"; reason: string }
  | { effect: "approval"; reason: string; strong: boolean }
  | { effect: "deny"; reason: string };

export class PolicyEngine {
  evaluate(request: ActionRequest): PolicyDecision {
    if (!request.grantedCapabilities.includes(request.capability)) {
      return { effect: "deny", reason: `Capability ${request.capability} is not granted.` };
    }
    if (!request.allowedActions.includes(request.action) && !request.allowedActions.includes("*")) {
      return { effect: "deny", reason: `Agent ${request.agentId} is not allowed to request ${request.action}.` };
    }
    if (request.risk === "SAFE_READ" || request.risk === "DRAFT") {
      return { effect: "allow", reason: "Read and draft actions are allowed by the default local policy." };
    }
    if (request.risk === "PRODUCTION_WRITE" || request.risk === "DESTRUCTIVE") {
      return { effect: "approval", strong: true, reason: "High-impact action requires explicit strong approval." };
    }
    return { effect: "approval", strong: false, reason: "Writes require human approval by default." };
  }
}
