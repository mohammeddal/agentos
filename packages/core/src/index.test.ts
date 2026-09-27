import { describe, expect, it } from "vitest";
import { MockRuntimeAdapter } from "@staffforge/runtime";
import { StaffForgeCore } from "./index.js";

const waitFor = <T>(read: () => T | undefined, timeout = 10_000) => new Promise<T>((resolve, reject) => {
  const started = Date.now();
  const timer = setInterval(() => {
    const value = read();
    if (value) { clearInterval(timer); resolve(value); }
    else if (Date.now() - started > timeout) { clearInterval(timer); reject(new Error("Timed out")); }
  }, 15);
});

describe("StaffForge vertical slice", () => {
  it("pauses for approval and completes with an event-derived report", async () => {
    const core = new StaffForgeCore(new MockRuntimeAdapter());
    const sessionId = await core.startObjective({ objective: "Investigate why revenue dropped", workspaceId: "test", workspacePath: "." });
    const pending = await waitFor(() => core.getSession(sessionId)?.approvals.find((approval) => approval.status === "pending"));
    expect(core.getSession(sessionId)?.status).toBe("waiting");
    expect(core.getSession(sessionId)?.timeline.some((event) => event.type === "evidence.recorded")).toBe(true);
    await core.decideApproval(sessionId, pending.id, true);
    const complete = await waitFor(() => core.getSession(sessionId)?.status === "completed" ? core.getSession(sessionId) : undefined);
    expect(complete?.finalSummary).toContain("Android 8.14");
    expect(complete?.timeline.at(-1)?.type).toBe("session.completed");
    expect(Object.values(complete?.tasks ?? {}).filter((task) => task.status === "DONE").length).toBeGreaterThanOrEqual(5);
  }, 15_000);
});
