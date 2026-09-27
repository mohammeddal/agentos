# StaffForge Event Protocol

The protocol is the stable boundary between execution providers and StaffForge consumers. It is append-only, versioned, serializable, and independent of Codex.

## Envelope

```ts
interface StaffForgeEvent<T = unknown> {
  schemaVersion: "1";
  id: string;
  type: EventType;
  timestamp: string;
  sessionId: string;
  workspaceId: string;
  correlationId: string;
  causationId?: string;
  actor: { kind: "system" | "human" | "agent" | "runtime" | "plugin"; id: string };
  subject?: { kind: string; id: string };
  visibility: "user" | "developer" | "audit";
  payload: T;
  metadata?: { provider?: string; pluginId?: string; durationMs?: number };
}
```

## Event families

- Session: `session.created`, `session.started`, `session.completed`, `session.failed`.
- Agent: `agent.started`, `agent.updated`, `agent.completed`, `agent.failed`.
- Task: `task.created`, `task.started`, `task.waiting`, `task.completed`, `task.failed`.
- Runtime: `runtime.connected`, `runtime.disconnected`, `runtime.error`.
- Tool and MCP: `tool.started`, `tool.output`, `tool.completed`, `tool.failed`, `mcp.called`, `mcp.returned`.
- Evidence: `evidence.recorded`, `hypothesis.created`, `hypothesis.rejected`, `artifact.created`, `file.read`, `file.changed`.
- Commands and tests: `command.started`, `command.output`, `command.completed`, `test.started`, `test.passed`, `test.failed`.
- Approval: `approval.requested`, `approval.approved`, `approval.rejected`, `approval.expired`.
- Workflow: `workflow.started`, `workflow.step.started`, `workflow.step.completed`, `workflow.completed`, `workflow.failed`.
- System: `diagnostic.recorded`, `plugin.loaded`, `plugin.failed`, `memory.recorded`.

## Rules

1. An event describes something that happened; commands remain separate.
2. IDs are globally unique and timestamps are ISO-8601 UTC.
3. Payloads contain user-visible summaries, not hidden chain-of-thought or secrets.
4. Provider-native payloads may be retained only in redacted developer metadata and never become a UI contract.
5. Consumers tolerate unknown event types from newer producers.
6. Corrections append a new event; persisted events are not mutated.
7. Every work item shares a `correlationId`; `causationId` links the immediate predecessor.

## Runtime translation example

```text
Codex notification: item/started(commandExecution)
        -> tool.started { toolId: "shell.execute", risk: "SAFE_READ" }
Codex notification: item/completed(commandExecution)
        -> command.completed { exitCode, summary, redactedOutput }
```

Projection code derives current task status, agent state, timeline rows, approval counts, and diagnostics from these events.
