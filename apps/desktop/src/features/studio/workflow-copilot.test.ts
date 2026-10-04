import { describe, expect, it } from "vitest";
import { starterCompany } from "../company/company-model";
import { isTaskCanvas, newCanvasNode, type TaskCanvasGraph } from "../tasks/task-canvas-model";
import {
  applyPlan,
  describeWorkflow,
  mergePatch,
  parsePlan,
  replyText,
  type InstalledTool,
} from "./workflow-copilot";

const agent = starterCompany.offices[0]!.agents[0]!;
const tools: InstalledTool[] = [
  {
    id: "mcp:notebooklm",
    kind: "mcp",
    name: "notebooklm",
    description: "",
    source: "~/.codex/config.toml",
    scope: "user",
    status: "configured",
    engine: "codex",
  },
];
const empty = (): TaskCanvasGraph => ({
  version: 1,
  nodes: [{ ...newCanvasNode("task", 0, 0, "root"), title: "Untitled" }],
  edges: [],
  decor: [],
});

describe("workflow copilot", () => {
  it("reads the plan block and keeps the prose", () => {
    const reply =
      'Added two steps.\n```agentos-workflow\n{"name":"News","steps":[{"id":"a","title":"Collect"}]}\n```';
    expect(parsePlan(reply)?.steps).toHaveLength(1);
    expect(replyText(reply)).toBe("Added two steps.");
    expect(parsePlan("What should it publish to?")).toBeNull();
  });

  it("builds a connected workflow with tools, context, and an approval", () => {
    const result = applyPlan(
      starterCompany,
      empty(),
      {
        name: "AI news",
        outcome: "Three verified stories",
        steps: [
          {
            id: "collect",
            kind: "agent",
            agent: agent.name,
            instructions: "Collect today's AI news.",
            tools: ["notebooklm"],
            context: [{ title: "Sources", notes: "Official blogs only" }],
          },
          { id: "check", kind: "approval", reviewer: "me", after: ["collect"] },
          { id: "write", kind: "prompt", title: "Write posts", after: ["check"] },
        ],
      },
      tools,
    );
    const g = result.graph;
    expect(isTaskCanvas(g)).toBe(true);
    expect(g.nodes.find((n) => n.kind === "task")!.title).toBe("AI news");
    expect(g.nodes.filter((n) => ["agent", "approval", "prompt"].includes(n.kind))).toHaveLength(3);
    expect(g.edges.filter((e) => e.kind === "attachment")).toHaveLength(2);
    expect(g.edges.find((e) => e.condition === "approved")).toBeTruthy();
    expect(result.changes).toContain("Attached notebooklm to " + agent.name);
  });

  it("edits existing steps in place and removes dropped ones", () => {
    const first = applyPlan(
      starterCompany,
      empty(),
      {
        steps: [
          { id: "a", kind: "prompt", title: "Draft" },
          { id: "b", kind: "prompt", title: "Polish", after: ["a"] },
        ],
      },
      tools,
    ).graph;
    const plan = describeWorkflow(starterCompany, first);
    const draft = plan.steps.find((s) => s.title === "Draft")!;
    const moved = {
      ...first,
      nodes: first.nodes.map((n) => (n.title === "Draft" ? { ...n, x: 999 } : n)),
    };
    const result = applyPlan(
      starterCompany,
      moved,
      { steps: [{ ...draft, instructions: "Write a tighter draft." }] },
      tools,
    );
    const kept = result.graph.nodes.find((n) => n.id === draft.id)!;
    expect(kept.prompt).toBe("Write a tighter draft.");
    expect(kept.x).toBe(999);
    expect(result.graph.nodes.some((n) => n.title === "Polish")).toBe(false);
    expect(result.changes).toEqual(["Updated Draft", "Removed Polish"]);
  });

  it("reports tools that aren't installed instead of inventing them", () => {
    const result = applyPlan(
      starterCompany,
      empty(),
      { steps: [{ id: "a", kind: "prompt", tools: ["made-up-mcp"] }] },
      tools,
    );
    expect(result.problems[0]).toContain("isn't installed");
    expect(result.graph.edges.some((e) => e.kind === "attachment")).toBe(false);
  });
  it("applies a patch: changes only listed steps and reconnects around removed ones", () => {
    const base = applyPlan(
      starterCompany,
      empty(),
      {
        steps: [
          { id: "a", kind: "prompt", title: "Collect", instructions: "Collect news" },
          { id: "b", kind: "prompt", title: "Verify", after: ["a"] },
          { id: "c", kind: "prompt", title: "Write", after: ["b"] },
        ],
      },
      tools,
    ).graph;
    const ids = Object.fromEntries(
      describeWorkflow(starterCompany, base).steps.map((s) => [s.title, s.id]),
    );
    const patch = parsePlan(
      "Done.\n```agentos-workflow\n" +
        JSON.stringify({
          steps: [{ id: ids.Write, instructions: "Write 3 Arabic posts" }],
          remove: [ids.Verify],
        }) +
        "\n```",
    )!;
    const merged = mergePatch(starterCompany, base, patch);
    const result = applyPlan(starterCompany, base, merged, tools);
    const g = result.graph;
    expect(g.nodes.find((n) => n.title === "Collect")!.prompt).toBe("Collect news");
    expect(g.nodes.find((n) => n.title === "Write")!.prompt).toBe("Write 3 Arabic posts");
    expect(g.nodes.some((n) => n.title === "Verify")).toBe(false);
    // Write now follows Collect directly.
    expect(
      g.edges.some((e) => e.from === ids.Collect && e.to === ids.Write && e.kind === "flow"),
    ).toBe(true);
    expect(result.changes).toEqual(["Updated Write", "Removed Verify"]);
  });
  it("treats a reply without a block as an answer, not a change", () => {
    expect(parsePlan("Files are saved in the project folder under reports/.")).toBeNull();
  });
});
