import { describe, expect, it } from "vitest";
import { starterCompany, type Company } from "../features/company/company-model";
import {
  destinations,
  findWorkspace,
  parseRoute,
  primaryView,
  routeHash,
  type WorkspaceView,
} from "./navigation";
describe("workspace navigation", () => {
  it("keeps focused primary destinations and places workflows inside the company hub", () => {
    expect(destinations.map((destination) => destination.view)).toEqual([
      "map",
      "start",
      "inbox",
      "activity",
      "memory",
    ]);
    expect(destinations.map((destination) => destination.view)).not.toContain("projects");
    expect(destinations.map((destination) => destination.view)).not.toContain("tasks");
    expect(primaryView("tasks")).toBe("map");
    expect(primaryView("engines")).toBe("memory");
    expect(primaryView("settings")).toBe("settings");
  });
  it("round trips every current page and redirects legacy domain links", () => {
    for (const view of [
      "start",
      "map",
      "activity",
      "memory",
      "engines",
      "settings",
    ] as WorkspaceView[])
      expect(parseRoute(routeHash({ view }))).toEqual({ view });
    for (const legacy of ["#/tasks", "#/company/domains", "#/company/offices", "#/company/agents"])
      expect(parseRoute(legacy)).toEqual({ view: "map" });
    expect(parseRoute("#/company/offices/research")).toEqual({ view: "map" });
    expect(parseRoute("#/projects/a%20project")).toEqual({ view: "start", projectId: "a project" });
    for (const route of [
      { view: "start" as const, projectId: "a project" },
      { view: "start" as const, chatId: "a chat" },
      { view: "tasks" as const, taskId: "a workflow" },
    ])
      expect(parseRoute(routeHash(route))).toEqual(route);
  });
  it("falls back safely for malformed and unknown links", () => {
    for (const hash of ["", "#invalid", "#/projects/%zz", "#/projects/foo/bar"])
      expect(parseRoute(hash)).toEqual({ view: "map" });
  });
  it("finds agents by name, engine and office without reading external files", () => {
    expect(
      findWorkspace(starterCompany, "analyst claude").some(
        (r) => r.kind === "agent" && r.id === "analyst",
      ),
    ).toBe(true);
    expect(findWorkspace(starterCompany, "MCP")[0]?.route?.view).toBe("engines");
    expect(findWorkspace(starterCompany, "notifications")[0]?.route?.view).toBe("settings");
    expect(findWorkspace(starterCompany, "workflows")[0]?.route?.view).toBe("map");
    expect(findWorkspace(starterCompany, "no-such-item")).toEqual([]);
  });
  it("returns tasks, projects and offices with stable identifiers", () => {
    const company: Company = {
      ...starterCompany,
      tasks: [
        {
          id: "t1",
          title: "Revenue report",
          brief: "Check anomalies",
          assignment: { kind: "agents", targets: ["analyst"] },
          status: "planned",
          createdAt: "2026-09-27T00:00:00Z",
        },
      ],
      projects: [
        {
          id: "p1",
          name: "Revenue",
          brief: "Monthly reporting",
          domains: [],
          agentIds: [],
          createdAt: "2026-09-27T00:00:00Z",
        },
      ],
    };
    expect(findWorkspace(company, "revenue").map((r) => r.kind)).toEqual(["task", "project"]);
    expect(findWorkspace(company, "Data & Analytics").map((r) => r.kind)).toContain("office");
    expect(findWorkspace(company, "Data & Analytics").map((r) => r.kind)).not.toContain("domain");
  });
  it("keeps default results short and caps large searches", () => {
    expect(findWorkspace(starterCompany, "")).toHaveLength(6);
    const company = {
      ...starterCompany,
      offices: [
        {
          ...starterCompany.offices[0]!,
          agents: Array.from({ length: 100 }, (_, i) => ({
            id: String(i),
            name: `Specialist ${i}`,
            role: "Review",
            engine: "Codex",
          })),
        },
      ],
    };
    expect(findWorkspace(company, "specialist")).toHaveLength(40);
  });
  it("finds active chats and excludes archived or removed records", () => {
    const chat = {
      id: "chat",
      engine: "Codex",
      createdAt: "2026-09-27T00:00:00Z",
      messages: [{ id: "m", text: "Unique chat question", createdAt: "2026-09-27T00:00:00Z" }],
    };
    expect(findWorkspace({ ...starterCompany, chats: [chat] }, "unique")[0]?.route).toEqual({
      view: "start",
      chatId: "chat",
    });
    expect(
      findWorkspace({ ...starterCompany, chats: [{ ...chat, lifecycle: "archived" }] }, "unique"),
    ).toEqual([]);
  });
});
