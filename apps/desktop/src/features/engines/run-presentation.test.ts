import { describe, expect, it } from "vitest";
import type { LiveRun } from "./live-runtime";
import { latestRun, matchesRunFilter, runLabel, runSummary } from "./run-presentation";

const run = (values: Partial<LiveRun> = {}): LiveRun => ({
  request: {
    id: "run",
    key: "task:a",
    title: "Test",
    mode: "task",
    folder: "",
    context: "",
    steps: [],
  },
  status: "completed",
  engine: "codex",
  createdAt: 1,
  updatedAt: 2,
  sessionId: "",
  output: "",
  error: "",
  cwd: "",
  currentAgentId: "",
  events: [],
  approvals: [],
  results: [],
  ...values,
});
describe("work status presentation", () => {
  it("uses the latest run regardless of backend array ordering without mutation", () => {
    const recent = run({ createdAt: 20, status: "running" });
    const old = run();
    const values = [recent, old];
    expect(latestRun(values, "task:a")).toBe(recent);
    expect(latestRun([...values].reverse(), "task:a")).toBe(recent);
    expect(values).toEqual([recent, old]);
    expect(latestRun(values, "task:missing")).toBeUndefined();
  });
  it("keeps waiting approval separate from running and finished", () => {
    const waiting = run({ status: "awaiting_approval" });
    expect(matchesRunFilter(waiting, "attention")).toBe(true);
    expect(matchesRunFilter(waiting, "active")).toBe(false);
    expect(matchesRunFilter(waiting, "finished")).toBe(false);
    expect(runLabel(waiting)).toBe("Needs approval");
  });
  it("surfaces errors and pending decisions even during transitions", () => {
    expect(matchesRunFilter(run({ error: "Disconnected" }), "attention")).toBe(true);
    expect(matchesRunFilter(run({ status: "failed" }), "attention")).toBe(true);
    expect(runLabel(run({ approvals: [{ id: "1", title: "Read", detail: "Confirm" }] }))).toBe(
      "Needs approval",
    );
    expect(runLabel(run({ status: "failed" }))).toBe("Needs attention");
  });
  it("distinguishes plans, active runs and finished outcomes", () => {
    expect(runLabel(undefined)).toBe("Planned");
    for (const status of ["starting", "running"])
      expect(matchesRunFilter(run({ status }), "active")).toBe(true);
    for (const status of ["completed", "canceled", "cancelled", "rejected"])
      expect(matchesRunFilter(run({ status }), "finished")).toBe(true);
    expect(matchesRunFilter(run(), "all")).toBe(true);
    expect(runLabel(run())).toBe("Completed");
  });
  it("does not treat a user stop as an error, but flags interrupted runs", () => {
    const canceled = run({ status: "canceled", error: "Canceled" });
    expect(matchesRunFilter(canceled, "attention")).toBe(false);
    expect(matchesRunFilter(canceled, "finished")).toBe(true);
    expect(runLabel(canceled)).toBe("Canceled");
    expect(matchesRunFilter(run({ status: "interrupted" }), "attention")).toBe(true);
  });
  it("creates a concise plain-text summary while preserving status fallbacks", () => {
    expect(
      runSummary(
        run({ output: "## Result\n- **First** item with [evidence](https://example.com)." }),
      ),
    ).toBe("Result First item with evidence.");
    expect(runSummary(run({ output: "123456789", status: "completed" }), 6)).toBe("12345…");
    expect(runSummary(run({ status: "running" }))).toBe("Work is in progress.");
    expect(
      runSummary(run({ approvals: [{ id: "1", title: "Allow command", detail: "ls" }] })),
    ).toBe("Waiting for approval: Allow command.");
  });
});
