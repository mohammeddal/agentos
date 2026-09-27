import { describe, expect, it } from "vitest";
import { isCompanyTask, starterCompany, type CompanyTask } from "../company/company-model";
import {
  canvasWarnings,
  connectCanvas,
  connectionError,
  fitCanvas,
  initialTaskCanvas,
  isTaskCanvas,
  newCanvasNode,
  removeCanvasNode,
  type TaskCanvasGraph,
} from "./task-canvas-model";

const task: CompanyTask = {
  id: "task",
  title: "Investigate",
  brief: "Use evidence",
  assignment: { kind: "agents", targets: ["analyst"] },
  status: "planned",
  createdAt: "2026-09-27T12:00:00Z",
};
function sample(): TaskCanvasGraph {
  return {
    ...initialTaskCanvas(task),
    nodes: [
      ...initialTaskCanvas(task).nodes,
      { ...newCanvasNode("agent", 350, 100, "agent"), reference: "analyst" },
      newCanvasNode("approval", 650, 100, "review"),
      { ...newCanvasNode("prompt", 950, 100, "prompt"), prompt: "Summarize" },
      { ...newCanvasNode("context", 350, 350, "context"), prompt: "Facts" },
    ],
  };
}
describe("visual task blueprints", () => {
  it("fits the complete blueprint without changing node positions", () => {
    const graph = sample();
    const before = JSON.stringify(graph);
    const fit = fitCanvas(graph, 600, 400);
    expect(fit.zoom).toBeGreaterThan(0);
    expect(fit.zoom).toBeLessThanOrEqual(1);
    for (const node of graph.nodes) {
      expect((node.x + 210) * fit.zoom - fit.left).toBeLessThanOrEqual(600);
      expect((node.y + 130) * fit.zoom - fit.top).toBeLessThanOrEqual(400);
    }
    expect(JSON.stringify(graph)).toBe(before);
  });
  it("starts with the task brief and does not rewrite existing settings", () => {
    const graph = initialTaskCanvas(task);
    expect(graph.nodes[0]?.prompt).toBe("Use evidence");
    expect(isTaskCanvas(graph)).toBe(true);
    expect(initialTaskCanvas({ ...task, canvas: graph })).toBe(graph);
    expect(task.assignment.targets).toEqual(["analyst"]);
  });
  it("connects flow, resources and approval checkpoints with correct defaults", () => {
    let g = connectCanvas(sample(), "task-root", "agent");
    g = connectCanvas(g, "agent", "review");
    g = connectCanvas(g, "review", "prompt");
    g = connectCanvas(g, "context", "agent");
    expect(g.edges.map((e) => e.condition)).toEqual(["success", "success", "approved", "always"]);
    expect(g.edges.at(-1)?.kind).toBe("attachment");
    expect(isTaskCanvas(g)).toBe(true);
    expect(canvasWarnings(starterCompany, g)).toEqual([]);
  });
  it("rejects self edges, duplicate edges, missing blocks and cycles", () => {
    let g = connectCanvas(sample(), "agent", "review");
    g = connectCanvas(g, "review", "prompt");
    for (const [from, to] of [
      ["agent", "agent"],
      ["agent", "review"],
      ["missing", "agent"],
      ["prompt", "agent"],
    ])
      expect(() => connectCanvas(g, from!, to!)).toThrow();
  });
  it("keeps the task as flow entry and resources as outward attachments", () => {
    expect(connectionError(sample(), "agent", "task-root")).toMatch(/entry/);
    expect(connectionError(sample(), "agent", "context")).toMatch(/resources/);
    expect(isTaskCanvas(connectCanvas(sample(), "context", "task-root"))).toBe(true);
  });
  it("removes incident edges but protects the task root", () => {
    const g = connectCanvas(sample(), "task-root", "agent");
    expect(removeCanvasNode(g, "agent").edges).toEqual([]);
    expect(removeCanvasNode(g, "task-root")).toBe(g);
  });
  it("accepts incomplete drafts and reports missing references and disconnected blocks", () => {
    const g = sample();
    g.nodes[1]!.reference = "missing";
    expect(isCompanyTask({ ...task, canvas: g })).toBe(true);
    expect(canvasWarnings(starterCompany, g).join(" ")).toContain("choose an available agent");
    expect(canvasWarnings(starterCompany, g).join(" ")).toContain("not connected");
  });
  it("validates office references and offices without agents", () => {
    const available = {
      ...initialTaskCanvas(task),
      nodes: [
        ...initialTaskCanvas(task).nodes,
        { ...newCanvasNode("office", 350, 100, "office"), reference: "data" },
      ],
    };
    const empty = {
      ...available,
      nodes: available.nodes.map((node) =>
        node.id === "office" ? { ...node, reference: "marketing" } : node,
      ),
    };
    expect(canvasWarnings(starterCompany, available).join(" ")).not.toContain(
      "choose an available office",
    );
    expect(canvasWarnings(starterCompany, empty).join(" ")).toContain("has no agents");
  });
  it("round trips the canvas through company task validation", () => {
    const saved = JSON.parse(JSON.stringify({ ...task, canvas: sample() }));
    expect(isCompanyTask(saved)).toBe(true);
    saved.canvas.nodes[1].maxSteps = 0;
    expect(isCompanyTask(saved)).toBe(false);
  });
  it("rejects malformed graphs and unsafe sizes", () => {
    const g = sample();
    for (const value of [
      null,
      {},
      { ...g, version: 2 },
      { ...g, nodes: [] },
      { ...g, nodes: [g.nodes[0], g.nodes[0]] },
      { ...g, nodes: g.nodes.map((n) => ({ ...n, x: -1 })) },
      { ...g, nodes: g.nodes.map((n) => ({ ...n, prompt: "x".repeat(6001) })) },
      {
        ...g,
        edges: [{ id: "bad", from: "missing", to: "agent", condition: "success", kind: "flow" }],
      },
    ])
      expect(isTaskCanvas(value)).toBe(false);
  });
  it("rejects persisted invalid edge types, duplicates and cycles", () => {
    const g = connectCanvas(connectCanvas(sample(), "agent", "review"), "review", "prompt");
    expect(
      isTaskCanvas({
        ...g,
        edges: [
          ...g.edges,
          { id: "loop", from: "prompt", to: "agent", kind: "flow", condition: "always" },
        ],
      }),
    ).toBe(false);
    expect(isTaskCanvas({ ...g, edges: [...g.edges, { ...g.edges[0], id: "duplicate" }] })).toBe(
      false,
    );
    const a = connectCanvas(sample(), "context", "agent");
    expect(
      isTaskCanvas({ ...a, edges: a.edges.map((e) => ({ ...e, condition: "success" })) }),
    ).toBe(false);
  });
});
