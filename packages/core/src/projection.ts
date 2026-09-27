import type { AgentDefinition, ApprovalRequest, SessionView, StaffForgeEvent, TaskStatus } from "@staffforge/schemas";

export function createSessionView(sessionId: string, workspaceId: string, objective: string, agents: AgentDefinition[]): SessionView {
  return {
    id: sessionId, workspaceId, objective, status: "idle", tasks: {}, approvals: [], timeline: [],
    agents: Object.fromEntries(agents.map((agent) => [agent.id, {
      id: agent.id, name: agent.name, icon: agent.icon, status: "idle", objective,
      currentAction: "Standing by", latestFinding: "No findings yet", confidence: "—"
    }]))
  };
}

const taskStatus: Partial<Record<StaffForgeEvent["type"], TaskStatus>> = {
  "task.created": "READY", "task.started": "WORKING", "task.waiting": "WAITING", "task.completed": "DONE", "task.failed": "FAILED"
};

export function reduceSession(view: SessionView, event: StaffForgeEvent): SessionView {
  const next = structuredClone(view);
  next.timeline.push(event);
  const payload = event.payload as Record<string, any>;
  const agentId = event.actor.kind === "agent" ? event.actor.id : String(payload.agentId ?? "");
  const agent = next.agents[agentId];
  const subjectId = event.subject?.kind === "task" ? event.subject.id : undefined;

  if (event.type === "session.started") next.status = "running";
  if (event.type === "session.completed" || event.type === "workflow.completed") next.status = "completed";
  if (event.type === "session.failed" || event.type === "workflow.failed") next.status = "failed";

  if (event.type === "task.created" && subjectId) {
    next.tasks[subjectId] = { id: subjectId, title: String(payload.title), agentId: String(payload.agentId), status: "READY", summary: String(payload.summary ?? "Queued") };
  }
  const status = taskStatus[event.type];
  if (status && subjectId && next.tasks[subjectId]) {
    next.tasks[subjectId].status = status;
    if (payload.summary) next.tasks[subjectId].summary = String(payload.summary);
  }

  if (event.type === "agent.started" && agent) {
    agent.status = "working"; agent.currentAction = String(payload.action ?? "Working"); agent.taskId = String(payload.taskId ?? ""); agent.startedAt = event.timestamp;
  }
  if (event.type === "agent.completed" && agent) { agent.status = "completed"; agent.currentAction = "Task complete"; }
  if (event.type === "agent.failed" && agent) { agent.status = "failed"; agent.currentAction = String(payload.summary ?? "Failed"); }
  if ((event.type === "evidence.recorded" || event.type === "hypothesis.created" || event.type === "tool.completed" || event.type === "test.passed" || event.type === "artifact.created") && agent) {
    agent.latestFinding = String(payload.summary ?? agent.latestFinding);
    if (payload.confidence === "Low" || payload.confidence === "Moderate" || payload.confidence === "High") agent.confidence = payload.confidence;
  }
  if (event.type === "approval.requested") {
    next.approvals.push(payload.request as ApprovalRequest); next.status = "waiting";
    const builder = next.agents.builder; if (builder) { builder.status = "waiting"; builder.currentAction = "Awaiting approval"; }
  }
  if (event.type === "approval.approved" || event.type === "approval.rejected") {
    const approval = next.approvals.find((item) => item.id === payload.approvalId);
    if (approval) approval.status = event.type === "approval.approved" ? "approved" : "rejected";
    next.status = event.type === "approval.approved" ? "running" : "failed";
    const builder = next.agents.builder;
    if (builder && event.type === "approval.approved") { builder.status = "completed"; builder.currentAction = "Change approved"; }
    if (builder && event.type === "approval.rejected") { builder.status = "failed"; builder.currentAction = "Change rejected"; }
  }
  if (event.type === "artifact.created" && payload.artifactType === "report") next.finalSummary = String(payload.summary);
  return next;
}
