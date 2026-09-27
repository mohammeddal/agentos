import { describe, expect, it } from "vitest";
import { isCompany, isCompanyTask, starterCompany, taskParticipants, type Company, type CompanyTask } from "./company-model";

const task: CompanyTask = { id: "task-1", title: "Investigate an incident", brief: "Gather evidence", assignment: { kind: "domains", targets: ["Data & Analytics", "Software Engineering"] }, status: "planned", createdAt: "2026-09-27T00:00:00.000Z" };

describe("company task assignments", () => {
  it("keeps existing company storage compatible", () => {
    expect(isCompany(starterCompany)).toBe(true);
    expect(isCompany(JSON.parse(JSON.stringify({ ...starterCompany, tasks: [task] })))).toBe(true);
  });
  it("includes all agents in one or several selected domains without duplication", () => {
    expect(taskParticipants(starterCompany, { kind: "domains", targets: ["Data & Analytics"] })).toHaveLength(3);
    expect(taskParticipants(starterCompany, task.assignment)).toHaveLength(5);
    expect(taskParticipants(starterCompany, { ...task.assignment, targets: [...task.assignment.targets, "Data & Analytics"] })).toHaveLength(5);
  });
  it("assigns only specified agents across offices", () => {
    expect(taskParticipants(starterCompany, { kind: "agents", targets: ["analyst"] }).map(a => a.id)).toEqual(["analyst"]);
    expect(taskParticipants(starterCompany, { kind: "agents", targets: ["analyst", "reviewer"] }).map(a => a.id)).toEqual(["analyst", "reviewer"]);
  });
  it("includes multiple offices in a domain and updates membership with new agents", () => {
    const expanded: Company = { ...starterCompany, offices: [...starterCompany.offices, { id: "data-2", name: "Data lab", domain: "Data & Analytics", color: "sage", agents: [{ id: "new-analyst", name: "New analyst", role: "Analysis", engine: "Codex" }] }] };
    expect(taskParticipants(expanded, task.assignment)).toHaveLength(6);
  });
  it("keeps direct assignments when agents move offices", () => {
    const moved = structuredClone(starterCompany);
    const agent = moved.offices[0]!.agents.shift()!;
    moved.offices[1]!.agents.push(agent);
    expect(taskParticipants(moved, { kind: "agents", targets: [agent.id] })[0]?.office.id).toBe("engineering");
    expect(taskParticipants(moved, { kind: "domains", targets: ["Data & Analytics"] })).toHaveLength(2);
  });
  it("supports planning for an empty domain and safely resolves missing agents", () => {
    expect(taskParticipants(starterCompany, { kind: "domains", targets: ["Marketing"] })).toEqual([]);
    expect(taskParticipants(starterCompany, { kind: "agents", targets: ["unknown"] })).toEqual([]);
  });
  it("rejects invalid persisted tasks", () => {
    for (const bad of [null, {}, { ...task, title: " " }, { ...task, status: "running" }, { ...task, createdAt: "bad date" }, { ...task, assignment: null }, { ...task, assignment: { kind: "offices", targets: ["data"] } }, { ...task, assignment: { kind: "agents", targets: [] } }, { ...task, assignment: { kind: "agents", targets: [null] } }]) {
      expect(isCompanyTask(bad)).toBe(false);
      expect(isCompany({ ...starterCompany, tasks: [bad] })).toBe(false);
    }
  });
});
