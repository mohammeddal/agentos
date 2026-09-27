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
  it("keeps five stable primary destinations and treats projects as sidebar directories", () => {
    expect(destinations).toHaveLength(5);
    expect(destinations.map((destination) => destination.view)).not.toContain("projects");
    expect(primaryView("agents")).toBe("map");
    expect(primaryView("engines")).toBe("memory");
  });
  it("round trips every page and encoded office/project link", () => {
    for (const view of [
      "start",
      "tasks",
      "projects",
      "map",
      "offices",
      "agents",
      "domains",
      "activity",
      "memory",
      "engines",
    ] as WorkspaceView[])
      expect(parseRoute(routeHash({ view }))).toEqual({ view });
    for (const route of [
      { view: "offices" as const, officeId: "research / east" },
      { view: "projects" as const, projectId: "a project" },
      { view: "start" as const, projectId: "a project" },
      { view: "start" as const, chatId: "a chat" },
    ])
      expect(parseRoute(routeHash(route))).toEqual(route);
  });
  it("falls back safely for malformed and unknown links", () => {
    for (const hash of ["", "#invalid", "#/company/offices/%zz", "#/projects/foo/bar"])
      expect(parseRoute(hash)).toEqual({ view: "start" });
  });
  it("finds agents by name, engine and office without reading external files", () => {
    expect(
      findWorkspace(starterCompany, "analyst claude").some(
        (r) => r.kind === "agent" && r.id === "analyst",
      ),
    ).toBe(true);
    expect(findWorkspace(starterCompany, "MCP")[0]?.route?.view).toBe("engines");
    expect(findWorkspace(starterCompany, "project details")[0]?.route?.view).toBe("projects");
    expect(findWorkspace(starterCompany, "no-such-item")).toEqual([]);
  });
  it("returns tasks, projects, offices and domains with stable identifiers", () => {
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
    expect(findWorkspace(company, "Data & Analytics").map((r) => r.kind)).toContain("domain");
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
