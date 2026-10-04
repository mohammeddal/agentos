import { describe, expect, it } from "vitest";
import { isTaskCanvas, newCanvasNode, type TaskCanvasGraph } from "../tasks/task-canvas-model";
import {
  alignItems,
  deleteItems,
  distributeItems,
  duplicateItems,
  marqueeHits,
  moveItems,
  newDecor,
  resizeBox,
  withSectionChildren,
} from "./studio-model";

const node = (id: string, x: number, y: number) => ({ ...newCanvasNode("prompt", x, y, id) });
const graph = (): TaskCanvasGraph => ({
  version: 1,
  nodes: [{ ...newCanvasNode("task", 0, 0, "root") }, node("a", 300, 0), node("b", 600, 40)],
  edges: [{ id: "e1", from: "root", to: "a", kind: "flow", condition: "success" }],
  decor: [],
});

describe("studio model", () => {
  it("moves with snapping from the drag origin", () => {
    const g = graph();
    const moved = moveItems(g, g, ["a"], 13, 21);
    expect(moved.nodes.find((n) => n.id === "a")).toMatchObject({ x: 312, y: 24 });
  });
  it("resizes from any handle and keeps a minimum size", () => {
    expect(resizeBox({ x: 0, y: 0, w: 100, h: 100 }, "se", 20, 40)).toEqual({
      x: 0,
      y: 0,
      w: 120,
      h: 144,
    });
    expect(resizeBox({ x: 0, y: 0, w: 100, h: 100 }, "nw", 200, 0).w).toBe(24);
  });
  it("aligns and distributes selections", () => {
    const aligned = alignItems(graph(), ["a", "b"], "top");
    expect(aligned.nodes.find((n) => n.id === "b")!.y).toBe(0);
    const spread = distributeItems(
      { ...graph(), nodes: [node("x", 0, 0), node("y", 100, 0), node("z", 1000, 0)] },
      ["x", "y", "z"],
      "horizontal",
    );
    expect(spread.nodes.find((n) => n.id === "y")!.x).toBe(504);
  });
  it("selects by marquee and carries a section's contents", () => {
    const g = {
      ...graph(),
      decor: [{ ...newDecor("section", -40, -40), id: "s", w: 600, h: 300 }],
    };
    expect(marqueeHits(g, { x: 250, y: -10, w: 100, h: 50 })).toEqual(["a", "s"]);
    expect(withSectionChildren(g, ["s"]).sort()).toEqual(["a", "root", "s"]);
  });
  it("duplicates blocks with their internal connections but never the start block", () => {
    const g = graph();
    const { graph: next, ids } = duplicateItems(g, g, ["root", "a"]);
    expect(ids).toHaveLength(1);
    expect(next.nodes).toHaveLength(4);
    expect(next.edges).toHaveLength(1);
  });
  it("deletes blocks and their connections but keeps the start block", () => {
    const next = deleteItems(graph(), ["root", "a"]);
    expect(next.nodes.map((n) => n.id)).toEqual(["root", "b"]);
    expect(next.edges).toEqual([]);
  });
  it("keeps studio graphs valid for saving", () => {
    const g = { ...graph(), decor: [newDecor("sticky", 10, 10)] };
    g.nodes[1] = { ...g.nodes[1]!, x: 5000, style: { fill: "#4a72a6", w: 300 } };
    expect(isTaskCanvas(g)).toBe(true);
  });
});
