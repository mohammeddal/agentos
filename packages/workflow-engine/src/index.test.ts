import { describe, expect, it } from "vitest";
import { WorkflowEngine, type WorkflowDefinition } from "./index.js";

const definition: WorkflowDefinition = { schemaVersion: "1", version: "1.0.0", id: "test", name: "Test", root: { id: "root", type: "sequence", name: "root", children: [
  { id: "parallel", type: "parallel", name: "parallel", children: [
    { id: "a", type: "action", name: "A", agentId: "a", taskId: "a" },
    { id: "b", type: "action", name: "B", agentId: "b", taskId: "b" }
  ]},
  { id: "approval", type: "approval", name: "Approval", taskId: "approval", action: "write", capability: "filesystem.write", risk: "LOCAL_WRITE" }
]}};

describe("WorkflowEngine", () => {
  it("runs parallel actions before approval", async () => {
    const trace: string[] = [];
    const engine = new WorkflowEngine({
      started: async (node) => { trace.push(`start:${node.id}`); }, completed: async (node) => { trace.push(`done:${node.id}`); }, failed: async () => {},
      execute: async (node) => { await new Promise((resolve) => setTimeout(resolve, node.id === "a" ? 10 : 1)); trace.push(`exec:${node.id}`); },
      approval: async () => { trace.push("approved"); return true; }
    });
    await engine.run(definition, { sessionId: "s", workspaceId: "w", objective: "o", values: {} });
    expect(trace.indexOf("exec:a")).toBeLessThan(trace.indexOf("approved"));
    expect(trace.indexOf("exec:b")).toBeLessThan(trace.indexOf("approved"));
  });
});
