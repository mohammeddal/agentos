import { describe, expect, it } from "vitest";
import type { LiveRun } from "../engines/live-runtime";
import {
  activityAcknowledgementTokens,
  activityBadgeTokens,
  unreadActivityCount,
} from "./activity-badge";

function run(patch: Partial<LiveRun> = {}): LiveRun {
  return {
    request: {
      id: "run-1",
      key: "task:one",
      title: "One",
      mode: "task",
      folder: "",
      context: "",
      steps: [],
    },
    status: "running",
    engine: "codex",
    createdAt: 1,
    updatedAt: 1,
    sessionId: "",
    output: "",
    error: "",
    cwd: "",
    currentAgentId: "",
    events: [],
    approvals: [],
    results: [],
    ...patch,
  };
}

describe("activity navigation badge", () => {
  it("clears active and current approval tokens when Activity is opened", () => {
    const waiting = run({
      status: "awaiting_approval",
      approvals: [{ id: "approval-1", title: "Allow?", detail: "command" }],
    });
    expect(activityBadgeTokens([waiting])).toEqual(["approval:run-1:approval-1"]);
    const seen = new Set(activityAcknowledgementTokens([waiting]));
    expect(unreadActivityCount([waiting], seen)).toBe(0);
    expect(seen).toContain("run:run-1");
  });

  it("shows a new approval from an already viewed run", () => {
    const running = run();
    const seen = new Set(activityAcknowledgementTokens([running]));
    const waiting = run({
      status: "awaiting_approval",
      approvals: [{ id: "approval-2", title: "Allow?", detail: "command" }],
    });
    expect(unreadActivityCount([waiting], seen)).toBe(1);
  });

  it("does not count completed runs", () => {
    expect(unreadActivityCount([run({ status: "completed" })], new Set())).toBe(0);
  });
});
