export const eventTypes = [
  "session.created", "session.started", "session.completed", "session.failed",
  "runtime.connected", "runtime.disconnected", "runtime.error",
  "agent.started", "agent.updated", "agent.completed", "agent.failed",
  "task.created", "task.started", "task.waiting", "task.completed", "task.failed",
  "workflow.started", "workflow.step.started", "workflow.step.completed", "workflow.completed", "workflow.failed",
  "tool.started", "tool.output", "tool.completed", "tool.failed", "mcp.called", "mcp.returned",
  "evidence.recorded", "hypothesis.created", "hypothesis.rejected", "artifact.created", "file.read", "file.changed",
  "command.started", "command.output", "command.completed", "test.started", "test.passed", "test.failed",
  "approval.requested", "approval.approved", "approval.rejected", "approval.expired",
  "diagnostic.recorded", "plugin.loaded", "plugin.failed", "memory.recorded"
] as const;

export type EventType = (typeof eventTypes)[number];
export type RiskClass = "SAFE_READ" | "DRAFT" | "LOCAL_WRITE" | "EXTERNAL_WRITE" | "PRODUCTION_WRITE" | "DESTRUCTIVE";
export type TaskStatus = "BACKLOG" | "READY" | "WORKING" | "WAITING" | "REVIEW" | "APPROVAL" | "DONE" | "FAILED";
export type AgentStatus = "idle" | "working" | "waiting" | "completed" | "failed";

export interface EventActor { kind: "system" | "human" | "agent" | "runtime" | "plugin"; id: string }
export interface EventSubject { kind: string; id: string }

export interface StaffForgeEvent<T = Record<string, unknown>> {
  schemaVersion: "1";
  id: string;
  type: EventType;
  timestamp: string;
  sessionId: string;
  workspaceId: string;
  correlationId: string;
  causationId?: string;
  actor: EventActor;
  subject?: EventSubject;
  visibility: "user" | "developer" | "audit";
  payload: T;
  metadata?: { provider?: string; pluginId?: string; durationMs?: number };
}

export interface AgentDefinition {
  schemaVersion: "1";
  version: string;
  id: string;
  name: string;
  description: string;
  role: string;
  icon: string;
  systemInstructions: string;
  skills: string[];
  requiredCapabilities: string[];
  optionalCapabilities: string[];
  allowedActions: string[];
  approvalPolicy: string;
  maxConcurrency: number;
  timeoutMs: number;
  metadata?: Record<string, unknown>;
}

export interface SkillDefinition {
  schemaVersion: "1"; version: string; id: string; name: string; instructions: string;
  requiredCapabilities: string[]; optionalCapabilities: string[];
  expectedOutputs: string[]; evaluationCriteria: string[];
}

export interface ToolDefinition {
  schemaVersion: "1"; version: string; id: string; name: string; description: string;
  requiredCapability: string; risk: RiskClass; classification: "read" | "draft" | "write";
  provider: string; timeoutMs: number; audit: boolean;
}

export interface ApprovalRequest {
  id: string; sessionId: string; taskId: string; action: string; capability: string;
  risk: RiskClass; reason: string; provider: string; parameters: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "expired"; createdAt: string; strong: boolean;
}

export interface AgentView {
  id: string; name: string; icon: string; status: AgentStatus; objective: string;
  currentAction: string; latestFinding: string; confidence: "Low" | "Moderate" | "High" | "—";
  startedAt?: string; taskId?: string;
}

export interface TaskView {
  id: string; title: string; agentId: string; status: TaskStatus; summary: string;
}

export interface SessionView {
  id: string; workspaceId: string; objective: string; status: "idle" | "running" | "waiting" | "completed" | "failed";
  agents: Record<string, AgentView>; tasks: Record<string, TaskView>; approvals: ApprovalRequest[];
  timeline: StaffForgeEvent[]; finalSummary?: string;
}

export interface RuntimeHealth {
  installed: boolean; authenticated: boolean; version?: string; mode: "codex" | "mock";
  details: string; capabilities: string[];
}

export function createEvent<T extends Record<string, unknown>>(
  input: Omit<StaffForgeEvent<T>, "schemaVersion" | "id" | "timestamp" | "visibility"> &
    Partial<Pick<StaffForgeEvent<T>, "id" | "timestamp" | "visibility">>
): StaffForgeEvent<T> {
  return {
    schemaVersion: "1",
    id: input.id ?? crypto.randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    visibility: input.visibility ?? "user",
    ...input
  };
}
