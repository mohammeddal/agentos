import { EventBus } from "@staffforge/event-bus";
import { PolicyEngine } from "@staffforge/policy-engine";
import { createEvent, type ApprovalRequest, type SessionView, type StaffForgeEvent } from "@staffforge/schemas";
import type { RuntimeAdapter, RuntimeSession } from "@staffforge/runtime";
import { WorkflowEngine, type WorkflowContext, type WorkflowNode } from "@staffforge/workflow-engine";
import { builtInAgents, builtInSkills, builtInTools, incidentWorkflow, instructions } from "./definitions.js";
import { createSessionView, reduceSession } from "./projection.js";

export { builtInAgents, builtInSkills, builtInTools, incidentWorkflow } from "./definitions.js";
export { createSessionView, reduceSession } from "./projection.js";

type ViewListener = (view: SessionView, event: StaffForgeEvent) => void;
type ApprovalWaiter = (approved: boolean) => void;

export interface StartObjectiveInput { objective: string; workspaceId?: string; workspacePath?: string }

export class StaffForgeCore {
  private readonly bus: EventBus;
  private readonly policy = new PolicyEngine();
  private views = new Map<string, SessionView>();
  private listeners = new Set<ViewListener>();
  private approvalWaiters = new Map<string, ApprovalWaiter>();
  private activeRuntimeSessions = new Map<string, RuntimeSession>();

  constructor(private readonly runtime: RuntimeAdapter, bus?: EventBus) {
    this.bus = bus ?? new EventBus();
    this.bus.subscribe((event) => {
      const view = this.views.get(event.sessionId);
      if (!view) return;
      const next = reduceSession(view, event);
      this.views.set(event.sessionId, next);
      for (const listener of this.listeners) listener(next, event);
    });
  }

  subscribe(listener: ViewListener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  getSession(id: string) { return this.views.get(id); }
  definitions() { return { agents: builtInAgents, skills: builtInSkills, tools: builtInTools, workflows: [incidentWorkflow] }; }
  runtimeHealth() { return this.runtime.health(); }

  async startObjective(input: StartObjectiveInput) {
    const sessionId = crypto.randomUUID();
    const workspaceId = input.workspaceId ?? "local-workspace";
    const workspacePath = input.workspacePath ?? ".";
    this.views.set(sessionId, createSessionView(sessionId, workspaceId, input.objective, builtInAgents));
    await this.emit(sessionId, workspaceId, "session.created", { objective: input.objective });
    await this.emit(sessionId, workspaceId, "session.started", { objective: input.objective });
    const health = await this.runtime.health();
    await this.emit(sessionId, workspaceId, "runtime.connected", { runtime: this.runtime.id, health });
    const runtimeSession = await this.runtime.startSession({ sessionId, workspaceId, workspacePath, objective: input.objective });
    this.activeRuntimeSessions.set(sessionId, runtimeSession);
    void this.runWorkflow(sessionId, workspaceId, input.objective, runtimeSession);
    return sessionId;
  }

  async decideApproval(sessionId: string, approvalId: string, approved: boolean) {
    const view = this.views.get(sessionId);
    if (!view) throw new Error(`Unknown session ${sessionId}`);
    const request = view.approvals.find((approval) => approval.id === approvalId);
    if (!request || request.status !== "pending") throw new Error(`Approval ${approvalId} is not pending.`);
    await this.emit(sessionId, view.workspaceId, approved ? "approval.approved" : "approval.rejected", { approvalId }, { kind: "human", id: "local-user" }, { kind: "approval", id: approvalId });
    this.approvalWaiters.get(approvalId)?.(approved);
    this.approvalWaiters.delete(approvalId);
  }

  async cancel(sessionId: string) {
    await this.activeRuntimeSessions.get(sessionId)?.cancel();
    const view = this.views.get(sessionId);
    if (view) await this.emit(sessionId, view.workspaceId, "session.failed", { summary: "Cancelled by user" });
  }

  private async runWorkflow(sessionId: string, workspaceId: string, objective: string, runtimeSession: RuntimeSession) {
    const context: WorkflowContext = { sessionId, workspaceId, objective, values: {} };
    await this.emit(sessionId, workspaceId, "workflow.started", { workflowId: incidentWorkflow.id, name: incidentWorkflow.name });
    const engine = new WorkflowEngine({
      started: async (node) => {
        await this.emit(sessionId, workspaceId, "workflow.step.started", { stepId: node.id, name: node.name, nodeType: node.type }, { kind: "system", id: "workflow-engine" }, { kind: "workflow-step", id: node.id });
        if (node.type === "action") {
          await this.emit(sessionId, workspaceId, "task.created", { title: node.name, agentId: node.agentId, summary: "Ready" }, { kind: "system", id: "commander" }, { kind: "task", id: node.taskId });
          await this.emit(sessionId, workspaceId, "task.started", { summary: node.name }, { kind: "agent", id: node.agentId }, { kind: "task", id: node.taskId });
          await this.emit(sessionId, workspaceId, "agent.started", { action: node.name, taskId: node.taskId }, { kind: "agent", id: node.agentId }, { kind: "agent", id: node.agentId });
        }
      },
      execute: async (node) => {
        for await (const event of runtimeSession.submit({ agentId: node.agentId, taskId: node.taskId, instruction: instructions[node.id] ?? node.name })) await this.bus.publish(event);
        await this.emit(sessionId, workspaceId, "agent.completed", { summary: `${node.name} completed` }, { kind: "agent", id: node.agentId }, { kind: "agent", id: node.agentId });
        await this.emit(sessionId, workspaceId, "task.completed", { summary: "Completed" }, { kind: "agent", id: node.agentId }, { kind: "task", id: node.taskId });
      },
      approval: async (node) => this.requestApproval(node, context),
      completed: async (node) => {
        if (node.type === "approval") await this.emit(sessionId, workspaceId, "task.completed", { summary: "Approved" }, { kind: "human", id: "local-user" }, { kind: "task", id: node.taskId });
        await this.emit(sessionId, workspaceId, "workflow.step.completed", { stepId: node.id, name: node.name }, { kind: "system", id: "workflow-engine" }, { kind: "workflow-step", id: node.id });
      },
      failed: async (node, error) => {
        if (node.type === "action") {
          await this.emit(sessionId, workspaceId, "agent.failed", { summary: error.message }, { kind: "agent", id: node.agentId }, { kind: "agent", id: node.agentId });
          await this.emit(sessionId, workspaceId, "task.failed", { summary: error.message }, { kind: "agent", id: node.agentId }, { kind: "task", id: node.taskId });
        }
      }
    });
    try {
      await engine.run(incidentWorkflow, context);
      await this.emit(sessionId, workspaceId, "workflow.completed", { workflowId: incidentWorkflow.id });
      await this.emit(sessionId, workspaceId, "session.completed", { summary: "Objective completed" });
    } catch (error) {
      const summary = error instanceof Error ? error.message : String(error);
      await this.emit(sessionId, workspaceId, "workflow.failed", { summary });
      await this.emit(sessionId, workspaceId, "session.failed", { summary });
    } finally { this.activeRuntimeSessions.delete(sessionId); }
  }

  private async requestApproval(node: Extract<WorkflowNode, { type: "approval" }>, context: WorkflowContext) {
    const builder = builtInAgents.find((agent) => agent.id === "builder")!;
    const decision = this.policy.evaluate({ agentId: builder.id, action: node.action, capability: node.capability, risk: node.risk, parameters: { workspaceId: context.workspaceId, patch: "Restore Android purchase_completed compatibility mapping" }, grantedCapabilities: ["filesystem.write"], allowedActions: builder.allowedActions });
    if (decision.effect === "deny") throw new Error(decision.reason);
    if (decision.effect === "allow") return true;
    const request: ApprovalRequest = {
      id: crypto.randomUUID(), sessionId: context.sessionId, taskId: node.taskId, action: node.action,
      capability: node.capability, risk: node.risk, reason: decision.reason, provider: this.runtime.id,
      parameters: { target: "analytics/android/checkout-events.ts", change: "Apply compatibility mapping and regression test" },
      status: "pending", createdAt: new Date().toISOString(), strong: decision.strong
    };
    await this.emit(context.sessionId, context.workspaceId, "task.created", { title: node.name, agentId: "builder", summary: "Approval required" }, { kind: "system", id: "policy-engine" }, { kind: "task", id: node.taskId });
    await this.emit(context.sessionId, context.workspaceId, "task.waiting", { summary: "Waiting for approval" }, { kind: "agent", id: "builder" }, { kind: "task", id: node.taskId });
    await this.emit(context.sessionId, context.workspaceId, "approval.requested", { request }, { kind: "system", id: "approval-engine" }, { kind: "approval", id: request.id });
    return new Promise<boolean>((resolve) => this.approvalWaiters.set(request.id, resolve));
  }

  private emit(sessionId: string, workspaceId: string, type: StaffForgeEvent["type"], payload: Record<string, unknown>, actor: StaffForgeEvent["actor"] = { kind: "system", id: "staffforge" }, subject?: StaffForgeEvent["subject"]) {
    return this.bus.publish(createEvent({ type, sessionId, workspaceId, correlationId: sessionId, actor, ...(subject ? { subject } : {}), payload }));
  }
}
