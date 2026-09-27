import { createEvent, type RuntimeHealth, type StaffForgeEvent } from "@staffforge/schemas";
import type { RuntimeAdapter, RuntimeInstruction, RuntimeSession, RuntimeSessionOptions } from "./index.js";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const scripts: Record<string, Array<{ type: StaffForgeEvent["type"]; payload: Record<string, unknown>; delay: number }>> = {
  commander: [
    { type: "evidence.recorded", payload: { summary: "Objective decomposed into investigation, history search, change proposal, review, and reporting." }, delay: 180 }
  ],
  detective: [
    { type: "hypothesis.created", payload: { summary: "Revenue decline may be isolated to mobile checkout telemetry.", confidence: "Moderate" }, delay: 260 },
    { type: "tool.started", payload: { toolId: "warehouse.query", summary: "Comparing revenue by platform and release cohort" }, delay: 220 },
    { type: "tool.completed", payload: { toolId: "warehouse.query", summary: "Android conversion fell 18.4% after release 8.14; other platforms are stable.", rows: 24 }, delay: 520 },
    { type: "evidence.recorded", payload: { summary: "Drop is isolated to Android 8.14 checkout events.", confidence: "High" }, delay: 180 }
  ],
  historian: [
    { type: "tool.started", payload: { toolId: "docs.read", summary: "Searching prior incidents and release notes" }, delay: 180 },
    { type: "tool.completed", payload: { toolId: "docs.read", summary: "Found incident DATA-918 with the same missing `purchase_completed` event signature." }, delay: 490 },
    { type: "evidence.recorded", payload: { summary: "DATA-918 links this signature to a renamed Android analytics property.", confidence: "High" }, delay: 160 }
  ],
  builder: [
    { type: "file.read", payload: { path: "analytics/android/checkout-events.ts", summary: "Inspected checkout event mapping." }, delay: 220 },
    { type: "artifact.created", payload: { artifactType: "patch", title: "Restore Android purchase_completed mapping", summary: "Prepared a one-line compatibility mapping and regression test." }, delay: 440 }
  ],
  reviewer: [
    { type: "test.started", payload: { summary: "Running analytics contract and replay tests" }, delay: 220 },
    { type: "test.passed", payload: { summary: "12 contract tests and 3 event-replay fixtures passed." }, delay: 600 },
    { type: "evidence.recorded", payload: { summary: "Change is limited to Android checkout telemetry; no warehouse schema impact.", confidence: "High" }, delay: 160 }
  ],
  reporter: [
    { type: "artifact.created", payload: { artifactType: "report", title: "Revenue decline investigation", summary: "Android 8.14 stopped emitting the canonical purchase event after a property rename. The proposed compatibility mapping restores attribution; regression coverage passes." }, delay: 480 }
  ]
};

class MockSession implements RuntimeSession {
  private cancelled = false;
  constructor(public readonly id: string, private readonly options: RuntimeSessionOptions) {}
  async *submit(input: RuntimeInstruction): AsyncIterable<StaffForgeEvent> {
    for (const item of scripts[input.agentId] ?? []) {
      if (this.cancelled) return;
      await pause(item.delay);
      yield createEvent({
        type: item.type, sessionId: this.options.sessionId, workspaceId: this.options.workspaceId,
        correlationId: this.options.sessionId, actor: { kind: "agent", id: input.agentId },
        subject: { kind: "task", id: input.taskId }, payload: item.payload,
        metadata: { provider: "mock-runtime", durationMs: item.delay }
      });
    }
  }
  async cancel() { this.cancelled = true; }
}

export class MockRuntimeAdapter implements RuntimeAdapter {
  readonly id = "mock";
  private sessions = new Map<string, MockSession>();
  async health(): Promise<RuntimeHealth> {
    return { installed: true, authenticated: true, version: "0.1.0", mode: "mock", details: "Deterministic local development runtime", capabilities: ["warehouse.query", "docs.read", "filesystem.read", "filesystem.write", "shell.execute"] };
  }
  async startSession(options: RuntimeSessionOptions) {
    const session = new MockSession(options.sessionId, options);
    this.sessions.set(session.id, session);
    return session;
  }
  async resumeSession(id: string) {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown mock session ${id}`);
    return session;
  }
}
