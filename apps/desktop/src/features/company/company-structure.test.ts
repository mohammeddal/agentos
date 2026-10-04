import { describe, expect, it } from "vitest";
import { starterCompany, type Company, type CompanyTask } from "./company-model";
import { deleteStructure, structureDeletion } from "./company-structure";

const planned = (assignment: CompanyTask["assignment"]): CompanyTask => ({
  id: crypto.randomUUID(),
  title: "Important task",
  brief: "Keep its owner intact",
  assignment,
  status: "planned",
  createdAt: "2026-09-27T00:00:00.000Z",
});

describe("company structure deletion", () => {
  it("deletes an unused agent and removes project membership", () => {
    const company: Company = {
      ...structuredClone(starterCompany),
      projects: [
        {
          id: crypto.randomUUID(),
          name: "Reporting",
          brief: "",
          domains: [],
          agentIds: ["analyst"],
          createdAt: "2026-09-27T00:00:00.000Z",
        },
      ],
    };
    const next = deleteStructure(company, { kind: "agent", id: "analyst", officeId: "data" });
    expect(next.offices.flatMap((office) => office.agents).some((a) => a.id === "analyst")).toBe(
      false,
    );
    expect(next.projects![0]!.agentIds).toEqual([]);
  });

  it("deletes an office and every agent inside it", () => {
    const next = deleteStructure(structuredClone(starterCompany), {
      kind: "office",
      id: "engineering",
    });
    expect(next.offices.some((office) => office.id === "engineering")).toBe(false);
  });

  it("hides built-in domains and removes their offices", () => {
    const next = deleteStructure(structuredClone(starterCompany), {
      kind: "domain",
      id: "Marketing",
    });
    expect(next.offices.some((office) => office.domain === "Marketing")).toBe(false);
    expect(next.hiddenDomains).toContain("Marketing");
  });

  it("blocks deletion when a task references the agent, domain, reviewer, handoff, or canvas", () => {
    const variants: CompanyTask[] = [
      planned({ kind: "agents", targets: ["analyst"] }),
      planned({ kind: "domains", targets: ["Data & Analytics"] }),
      {
        ...planned({ kind: "agents", targets: ["developer"] }),
        approval: { kind: "agent", agentId: "analyst" },
      },
      {
        ...planned({ kind: "agents", targets: ["developer"] }),
        handoffs: [
          {
            id: "handoff",
            after: "start",
            kind: "agent",
            targetId: "analyst",
            instruction: "Review",
            condition: { kind: "success" },
          },
        ],
      },
      {
        ...planned({ kind: "agents", targets: ["developer"] }),
        canvas: {
          version: 1,
          nodes: [
            {
              id: "root",
              kind: "task",
              title: "Task",
              x: 0,
              y: 0,
              prompt: "",
              reference: "",
              source: "",
              engine: "",
              reviewer: "human",
              readOnly: true,
              network: false,
              maxSteps: 20,
            },
            {
              id: "agent",
              kind: "agent",
              title: "Analyst",
              x: 300,
              y: 0,
              prompt: "",
              reference: "analyst",
              source: "",
              engine: "Codex",
              reviewer: "human",
              readOnly: true,
              network: false,
              maxSteps: 20,
            },
          ],
          edges: [{ id: "edge", from: "root", to: "agent", kind: "flow", condition: "success" }],
        },
      },
    ];
    const company = { ...structuredClone(starterCompany), tasks: variants };
    expect(
      structureDeletion(company, { kind: "agent", id: "analyst", officeId: "data" }).blockingTasks,
    ).toHaveLength(4);
    expect(
      structureDeletion(company, { kind: "domain", id: "Data & Analytics" }).blockingTasks,
    ).toHaveLength(5);
    expect(() =>
      deleteStructure(company, { kind: "agent", id: "analyst", officeId: "data" }),
    ).toThrow(/Reassign/);
  });
  it("deletes dependent workflows only when asked", () => {
    const company = structuredClone(starterCompany);
    const agent = company.offices[0]!.agents[0]!;
    company.tasks = [
      {
        id: "uses-agent",
        title: "Uses agent",
        brief: "",
        assignment: { kind: "agents", targets: [agent.id] },
        status: "planned",
        createdAt: new Date(0).toISOString(),
      },
    ];
    const target = { kind: "office" as const, id: company.offices[0]!.id };
    expect(() => deleteStructure(company, target)).toThrow();
    const next = deleteStructure(company, target, { removeTasks: true });
    expect(next.offices.some((office) => office.id === target.id)).toBe(false);
    expect(next.tasks).toEqual([]);
  });
});
