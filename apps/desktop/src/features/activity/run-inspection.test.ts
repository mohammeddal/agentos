import { describe, expect, it } from "vitest";
import { starterCompany, type CompanyTask } from "../company/company-model";
import {
  createRehearsal,
  decideRehearsal,
  finishRehearsalAction,
  isRehearsalRun,
} from "./task-rehearsal";
import { filterLogs, inspectRun, involvesAgent, outputText, runExport } from "./run-inspection";
const task: CompanyTask = {
  id: "inspect",
  title: "Inspect output",
  brief: "Read evidence",
  assignment: { kind: "agents", targets: ["analyst"] },
  status: "planned",
  createdAt: "2026-09-27T00:00:00Z",
  handoffs: [
    {
      id: "next",
      after: "start",
      kind: "agent",
      targetId: "developer",
      instruction: "Implement",
      condition: { kind: "always" },
      approval: { kind: "agent", agentId: "reviewer" },
    },
  ],
};
describe("run inspection", () => {
  it("freezes performer identities and attributes reviewers without matching display names", () => {
    const company = structuredClone(starterCompany),
      run = createRehearsal(company, task);
    expect(run.actions[0]?.performerIds).toEqual(["analyst"]);
    company.offices[0]!.agents[1]!.name = "Renamed analyst";
    expect(involvesAgent(run.actions[0]!, "analyst")).toBe(true);
    expect(involvesAgent(run.actions[0]!, "Data Analyst")).toBe(false);
    expect(involvesAgent(run.actions[1]!, "reviewer")).toBe(true);
    expect(inspectRun(run, "reviewer").actions.map((a) => a.id)).toEqual(["next"]);
  });
  it("scopes outputs and events by action id even with duplicate labels", () => {
    let run = createRehearsal(starterCompany, task);
    run.actions[1]!.label = run.actions[0]!.label;
    run = finishRehearsalAction(run, "start", "failure", {
      error: "sample-error",
      html: "<script>not executable</script>",
    });
    run = decideRehearsal(run, "next", "agent:reviewer", "agent:reviewer", true, "Checked");
    const selected = inspectRun(run, "analyst");
    expect(selected.actions.map((a) => a.id)).toEqual(["start"]);
    expect(selected.events.filter((e) => e.actionId).every((e) => e.actionId === "start")).toBe(
      true,
    );
    expect(filterLogs(selected.events, "sample", "error")).toHaveLength(0);
    expect(filterLogs(selected.events, "failure", "error")).toHaveLength(1);
    expect(inspectRun(run, "unrelated")).toEqual({ actions: [], events: [] });
  });
  it("retains failed outputs and exports only the selected inspection scope", () => {
    const run = finishRehearsalAction(createRehearsal(starterCompany, task), "start", "failure", {
      error: "sample-error",
      trace: [1, 2],
    });
    const exported = JSON.parse(runExport(run, "analyst"));
    expect(exported.mode).toBe("rehearsal");
    expect(exported.actions).toHaveLength(1);
    expect(exported.actions[0].result.output).toEqual({ error: "sample-error", trace: [1, 2] });
    expect(outputText(null)).toBe("null");
    expect(outputText(false)).toBe("false");
    expect(outputText("plain output")).toBe("plain output");
  });
  it("keeps legacy records readable but never guesses missing performer identities", () => {
    const run = createRehearsal(starterCompany, task);
    run.actions.forEach((a) => delete a.performerIds);
    run.events = [{ at: run.createdAt, text: "Data Analyst completed something" }];
    expect(isRehearsalRun(run)).toBe(true);
    expect(inspectRun(run).events).toHaveLength(1);
    expect(inspectRun(run, "analyst").actions).toHaveLength(0);
    expect(inspectRun(run, undefined, "start").events).toHaveLength(0);
  });
  it("rejects malformed identity and log metadata without breaking old schemas", () => {
    const run = createRehearsal(starterCompany, task);
    run.actions[0]!.performerIds = ["analyst", "analyst"];
    expect(isRehearsalRun(run)).toBe(false);
    run.actions[0]!.performerIds = ["analyst"];
    run.events.push({ at: run.createdAt, text: "unknown action", actionId: "missing" });
    expect(isRehearsalRun(run)).toBe(false);
  });
});
