import { describe, expect, it } from "vitest";
import type { LiveRun } from "../engines/live-runtime";
import { agentMapRuns, agentMapState, workflowOfficeId } from "./company-map-state";
import { starterCompany, type Company, type CompanyTask } from "./company-model";

function run(change: Partial<LiveRun> = {}): LiveRun {
  return {
    request: {
      id: "run-1",
      key: "run-1",
      title: "Review release",
      mode: "task",
      folder: "/tmp/project",
      context: "",
      steps: [
        {
          id: "step-1",
          label: "Review",
          engine: "codex",
          prompt: "Review the release",
          agentId: "reviewer",
          after: [],
          condition: "success",
          approval: false,
        },
      ],
    },
    status: "running",
    engine: "codex",
    createdAt: 1,
    updatedAt: 2,
    sessionId: "session",
    output: "",
    error: "",
    cwd: "/tmp/project",
    currentAgentId: "reviewer",
    events: [],
    approvals: [],
    results: [],
    ...change,
  };
}

describe("company map state", () => {
  it("makes approval more important than generic active work", () => {
    expect(agentMapState([run({ status: "awaiting_approval" })], "reviewer")).toBe("approval");
    expect(agentMapState([run()], "reviewer")).toBe("working");
  });

  it("shows completed participants as idle and unknown agents as offline", () => {
    const complete = run({
      status: "completed",
      currentAgentId: "",
      results: [{ id: "step-1", label: "Review", status: "completed", output: "Done" }],
    });
    expect(agentMapState([complete], "reviewer")).toBe("idle");
    expect(agentMapState([complete], "writer")).toBe("offline");
  });

  it("returns an agent's relevant runs newest first", () => {
    const older = run({ updatedAt: 10 });
    const newer = run({ request: { ...run().request, id: "run-2" }, updatedAt: 20 });
    expect(agentMapRuns([older, newer], "reviewer").map((item) => item.request.id)).toEqual([
      "run-2",
      "run-1",
    ]);
  });
});

describe("workflow placement on the company map", () => {
  const company = {
    ...starterCompany,
    offices: [
      {
        id: "o1",
        name: "One",
        domain: "One",
        color: "sage",
        agents: [{ id: "a1", name: "A1", role: "", engine: "Codex" }],
      },
      {
        id: "o2",
        name: "Two",
        domain: "Two",
        color: "blue",
        agents: [{ id: "a2", name: "A2", role: "", engine: "Codex" }],
      },
    ],
  } as Company;
  const task = (targets: string[], officeId?: string) =>
    ({
      id: "t",
      title: "T",
      brief: "",
      assignment: { kind: "agents", targets },
      status: "planned",
      createdAt: new Date(0).toISOString(),
      ...(officeId ? { officeId } : {}),
    }) as CompanyTask;
  it("uses the office a workflow was created in", () => {
    expect(workflowOfficeId(company, task(["a1", "a2"], "o2"))).toBe("o2");
    expect(workflowOfficeId(company, task([], "o1"))).toBe("o1");
  });
  it("falls back to the single office of its agents, and skips cross-office work", () => {
    expect(workflowOfficeId(company, task(["a1"]))).toBe("o1");
    expect(workflowOfficeId(company, task(["a1", "a2"]))).toBeUndefined();
    expect(workflowOfficeId(company, task(["a1"], "gone"))).toBe("o1");
  });
});
