import {
  newCanvasNode,
  STUDIO_LIMIT,
  type BlockKind,
  type CanvasNode,
  type DecorItem,
  type DecorKind,
  type TaskCanvasGraph,
} from "../tasks/task-canvas-model";

/** Default block size in the Studio; nodes may override it with `style.w`/`style.h`. */
export const NODE_W = 224;
export const NODE_H = 116;
export const GRID = 8;

export type Box = { x: number; y: number; w: number; h: number };
export type ItemRef = { id: string; kind: "node" | "decor" };

/** Accent colour per block kind, used when a block has no custom colour. */
export const kindColors: Record<BlockKind, string> = {
  task: "#18181b",
  agent: "#4a72a6",
  office: "#4f8a68",
  domain: "#7a68a6",
  prompt: "#a8862f",
  approval: "#c47f2c",
  context: "#64748b",
  mcp: "#0e7490",
  skill: "#0f766e",
  connector: "#0369a1",
  restriction: "#b42318",
};

/** The Studio palette: a small, consistent set of fills that work in light and dark mode. */
export const swatches = [
  "#18181b",
  "#64748b",
  "#4a72a6",
  "#0e7490",
  "#4f8a68",
  "#a8862f",
  "#c47f2c",
  "#c0684f",
  "#b42318",
  "#7a68a6",
  "#fef3c7",
  "#ffffff",
];

export const snap = (value: number, on = true) => (on ? Math.round(value / GRID) * GRID : value);
const clampCoord = (value: number) => Math.max(-STUDIO_LIMIT, Math.min(STUDIO_LIMIT, value));

export function nodeBox(node: CanvasNode): Box {
  return { x: node.x, y: node.y, w: node.style?.w || NODE_W, h: node.style?.h || NODE_H };
}
export function decorBox(item: DecorItem): Box {
  return { x: item.x, y: item.y, w: item.w, h: item.h };
}
export function itemBox(graph: TaskCanvasGraph, id: string): Box | null {
  const node = graph.nodes.find((n) => n.id === id);
  if (node) return nodeBox(node);
  const item = graph.decor?.find((d) => d.id === id);
  return item ? decorBox(item) : null;
}
export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}
export const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

/** Every selectable id whose box touches the marquee. Hidden and locked decor is skipped. */
export function marqueeHits(graph: TaskCanvasGraph, area: Box): string[] {
  return [
    ...graph.nodes.filter((n) => intersects(area, nodeBox(n))).map((n) => n.id),
    ...(graph.decor || [])
      .filter((d) => !d.hidden && !d.locked && intersects(area, decorBox(d)))
      .map((d) => d.id),
  ];
}

/** Sections carry what sits inside them, like Figma frames. */
export function withSectionChildren(graph: TaskCanvasGraph, ids: string[]): string[] {
  const result = new Set(ids);
  for (const section of (graph.decor || []).filter(
    (d) => d.type === "section" && ids.includes(d.id),
  )) {
    const box = decorBox(section);
    graph.nodes.filter((n) => contains(box, nodeBox(n))).forEach((n) => result.add(n.id));
    (graph.decor || [])
      .filter((d) => d.id !== section.id && contains(box, decorBox(d)))
      .forEach((d) => result.add(d.id));
  }
  return [...result];
}

/** Moves items by a delta, using their positions in `origin` so drags don't accumulate error. */
export function moveItems(
  graph: TaskCanvasGraph,
  origin: TaskCanvasGraph,
  ids: string[],
  dx: number,
  dy: number,
  snapping = true,
): TaskCanvasGraph {
  const set = new Set(ids);
  const place = (x: number, y: number) => ({
    x: clampCoord(snap(x + dx, snapping)),
    y: clampCoord(snap(y + dy, snapping)),
  });
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const start = origin.nodes.find((n) => n.id === node.id);
      return set.has(node.id) && start ? { ...node, ...place(start.x, start.y) } : node;
    }),
    decor: (graph.decor || []).map((item) => {
      const start = origin.decor?.find((d) => d.id === item.id);
      return set.has(item.id) && start ? { ...item, ...place(start.x, start.y) } : item;
    }),
  };
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
/** Resizes one item from a handle, keeping a sensible minimum size. */
export function resizeBox(start: Box, handle: Handle, dx: number, dy: number, min = 24): Box {
  let { x, y, w, h } = start;
  if (handle.includes("e")) w = Math.max(min, start.w + dx);
  if (handle.includes("s")) h = Math.max(min, start.h + dy);
  if (handle.includes("w")) {
    w = Math.max(min, start.w - dx);
    x = start.x + start.w - w;
  }
  if (handle.includes("n")) {
    h = Math.max(min, start.h - dy);
    y = start.y + start.h - h;
  }
  return { x: snap(x), y: snap(y), w: snap(w), h: snap(h) };
}
export function applyBox(graph: TaskCanvasGraph, id: string, box: Box): TaskCanvasGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === id
        ? {
            ...n,
            x: clampCoord(box.x),
            y: clampCoord(box.y),
            style: {
              ...n.style,
              w: Math.max(160, Math.min(1200, box.w)),
              h: Math.max(80, Math.min(1200, box.h)),
            },
          }
        : n,
    ),
    decor: (graph.decor || []).map((d) =>
      d.id === id ? { ...d, x: box.x, y: box.y, w: Math.max(1, box.w), h: Math.max(1, box.h) } : d,
    ),
  };
}

export type Alignment = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export function alignItems(graph: TaskCanvasGraph, ids: string[], how: Alignment): TaskCanvasGraph {
  const boxes = ids.map((id) => [id, itemBox(graph, id)] as const).filter(([, b]) => b);
  const bounds = unionBox(boxes.map(([, b]) => b!));
  if (!bounds || boxes.length < 2) return graph;
  let next = graph;
  for (const [id, box] of boxes) {
    const b = box!;
    const x =
      how === "left"
        ? bounds.x
        : how === "right"
          ? bounds.x + bounds.w - b.w
          : how === "hcenter"
            ? bounds.x + (bounds.w - b.w) / 2
            : b.x;
    const y =
      how === "top"
        ? bounds.y
        : how === "bottom"
          ? bounds.y + bounds.h - b.h
          : how === "vcenter"
            ? bounds.y + (bounds.h - b.h) / 2
            : b.y;
    next = applyPosition(next, id, snap(x), snap(y));
  }
  return next;
}
export function distributeItems(
  graph: TaskCanvasGraph,
  ids: string[],
  axis: "horizontal" | "vertical",
): TaskCanvasGraph {
  const boxes = ids
    .map((id) => ({ id, box: itemBox(graph, id) }))
    .filter((entry): entry is { id: string; box: Box } => !!entry.box)
    .sort((a, b) => (axis === "horizontal" ? a.box.x - b.box.x : a.box.y - b.box.y));
  if (boxes.length < 3) return graph;
  const first = boxes[0]!.box;
  const last = boxes.at(-1)!.box;
  const total = boxes.reduce((sum, { box }) => sum + (axis === "horizontal" ? box.w : box.h), 0);
  const span = axis === "horizontal" ? last.x + last.w - first.x : last.y + last.h - first.y;
  const gap = (span - total) / (boxes.length - 1);
  let cursor = axis === "horizontal" ? first.x : first.y;
  let next = graph;
  for (const { id, box } of boxes) {
    next =
      axis === "horizontal"
        ? applyPosition(next, id, snap(cursor), box.y)
        : applyPosition(next, id, box.x, snap(cursor));
    cursor += (axis === "horizontal" ? box.w : box.h) + gap;
  }
  return next;
}
function applyPosition(graph: TaskCanvasGraph, id: string, x: number, y: number) {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, x: clampCoord(x), y: clampCoord(y) } : n)),
    decor: (graph.decor || []).map((d) => (d.id === id ? { ...d, x, y } : d)),
  };
}

const decorDefaults: Record<DecorKind, Omit<DecorItem, "id" | "x" | "y">> = {
  rect: {
    type: "rect",
    name: "Rectangle",
    w: 160,
    h: 96,
    fill: "#e7e5e4",
    stroke: "#00000000",
    text: "",
    fontSize: 14,
    radius: 6,
  },
  ellipse: {
    type: "ellipse",
    name: "Ellipse",
    w: 120,
    h: 120,
    fill: "#dbeafe",
    stroke: "#00000000",
    text: "",
    fontSize: 14,
    radius: 0,
  },
  text: {
    type: "text",
    name: "Text",
    w: 220,
    h: 32,
    fill: "#18181b",
    stroke: "#00000000",
    text: "Text",
    fontSize: 18,
    radius: 0,
  },
  sticky: {
    type: "sticky",
    name: "Sticky note",
    w: 200,
    h: 160,
    fill: "#fef3c7",
    stroke: "#00000000",
    text: "",
    fontSize: 14,
    radius: 4,
  },
  section: {
    type: "section",
    name: "Section",
    w: 640,
    h: 400,
    fill: "#f4f4f5",
    stroke: "#d4d4d8",
    text: "",
    fontSize: 13,
    radius: 10,
  },
};
export function newDecor(type: DecorKind, x: number, y: number, box?: Partial<Box>): DecorItem {
  const base = decorDefaults[type];
  return {
    ...base,
    id: crypto.randomUUID(),
    x: snap(x),
    y: snap(y),
    w: Math.max(8, snap(box?.w ?? base.w)),
    h: Math.max(8, snap(box?.h ?? base.h)),
  };
}

export function newStudioNode(kind: BlockKind, x: number, y: number): CanvasNode {
  return newCanvasNode(kind, clampCoord(snap(x)), clampCoord(snap(y)));
}

/** Copies items with fresh ids, offset so the copy is visible. Edges between copied nodes follow. */
export function duplicateItems(
  graph: TaskCanvasGraph,
  source: TaskCanvasGraph,
  ids: string[],
  offset = 24,
): { graph: TaskCanvasGraph; ids: string[] } {
  const set = new Set(ids);
  const map = new Map<string, string>();
  const nodes = source.nodes
    .filter((n) => set.has(n.id) && n.kind !== "task")
    .map((n) => {
      const id = crypto.randomUUID();
      map.set(n.id, id);
      return { ...n, id, x: clampCoord(n.x + offset), y: clampCoord(n.y + offset) };
    });
  const decor = (source.decor || [])
    .filter((d) => set.has(d.id))
    .map((d) => {
      const id = crypto.randomUUID();
      map.set(d.id, id);
      return { ...d, id, x: d.x + offset, y: d.y + offset };
    });
  const edges = source.edges
    .filter((e) => map.has(e.from) && map.has(e.to))
    .map((e) => ({ ...e, id: crypto.randomUUID(), from: map.get(e.from)!, to: map.get(e.to)! }));
  if (graph.nodes.length + nodes.length > 80)
    throw new Error("A workflow supports up to 80 blocks.");
  return {
    graph: {
      ...graph,
      nodes: [...graph.nodes, ...nodes],
      edges: [...graph.edges, ...edges],
      decor: [...(graph.decor || []), ...decor],
    },
    ids: [...map.values()],
  };
}

/** Deletes items and any connections touching deleted blocks. The workflow start block stays. */
export function deleteItems(graph: TaskCanvasGraph, ids: string[]): TaskCanvasGraph {
  const set = new Set(ids);
  const keep = graph.nodes.filter((n) => !set.has(n.id) || n.kind === "task");
  const kept = new Set(keep.map((n) => n.id));
  return {
    ...graph,
    nodes: keep,
    edges: graph.edges.filter((e) => !set.has(e.id) && kept.has(e.from) && kept.has(e.to)),
    decor: (graph.decor || []).filter((d) => !set.has(d.id)),
  };
}

/** Pan and zoom that fit a box inside a viewport, with padding. */
export function fitView(box: Box | null, width: number, height: number, padding = 80) {
  if (!box) return { zoom: 1, x: padding, y: padding };
  const zoom = Math.max(
    0.1,
    Math.min(1.5, (width - padding * 2) / box.w, (height - padding * 2) / box.h),
  );
  return {
    zoom,
    x: (width - box.w * zoom) / 2 - box.x * zoom,
    y: (height - box.h * zoom) / 2 - box.y * zoom,
  };
}

/** Bezier path between a block's output (right edge) and another block's input (left edge). */
export function edgePath(from: Box, to: Box): string {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const bend = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M${x1} ${y1}C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`;
}

/**
 * Tidy up: lays steps out left to right by flow depth and stacks each step's resources
 * (context, tools) under it. Only blocks in `ids` move (all blocks when empty); annotations stay.
 */
export function autoArrange(graph: TaskCanvasGraph, ids: string[] = []): TaskCanvasGraph {
  const targets = graph.nodes.filter((n) => !ids.length || ids.includes(n.id));
  if (!targets.length) return graph;
  const moving = new Set(targets.map((n) => n.id));
  const isResource = (n: CanvasNode) =>
    graph.edges.some((e) => e.from === n.id && e.kind === "attachment") ||
    ["context", "mcp", "skill", "connector", "restriction"].includes(n.kind);
  const steps = targets.filter((n) => !isResource(n));
  const flow = graph.edges.filter(
    (e) => e.kind === "flow" && moving.has(e.from) && moving.has(e.to),
  );
  // Longest-path depth so every step sits to the right of everything that feeds it.
  const depth = new Map<string, number>();
  const visit = (id: string, seen = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = flow.filter((e) => e.to === id).map((e) => e.from);
    const value = parents.length ? Math.max(...parents.map((p) => visit(p, seen) + 1)) : 0;
    depth.set(id, value);
    return value;
  };
  steps.forEach((n) => visit(n.id));
  const columns = new Map<number, CanvasNode[]>();
  for (const step of [...steps].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const column = depth.get(step.id) || 0;
    columns.set(column, [...(columns.get(column) || []), step]);
  }
  const origin = {
    x: Math.min(...targets.map((n) => n.x)),
    y: Math.min(...targets.map((n) => n.y)),
  };
  const colGap = 96;
  const rowGap = 48;
  const width = Math.max(...targets.map((n) => nodeBox(n).w));
  const placed = new Map<string, { x: number; y: number }>();
  let tallest = 0;
  for (const [column, members] of columns) {
    let y = origin.y;
    for (const member of members) {
      placed.set(member.id, { x: origin.x + column * (width + colGap), y });
      y += nodeBox(member).h + rowGap;
    }
    tallest = Math.max(tallest, y - origin.y);
  }
  // Resources go in a band under the steps, beneath the step they serve.
  const band = origin.y + Math.max(tallest, NODE_H + rowGap) + rowGap;
  const stackHeight = new Map<number, number>();
  const loose: CanvasNode[] = [];
  for (const resource of targets.filter(isResource)) {
    const target = graph.edges.find((e) => e.from === resource.id && e.kind === "attachment")?.to;
    const anchor = target
      ? placed.get(target) || graph.nodes.find((n) => n.id === target)
      : undefined;
    if (!anchor) {
      loose.push(resource);
      continue;
    }
    const column = Math.round((anchor.x - origin.x) / (width + colGap));
    const offset = stackHeight.get(column) || 0;
    placed.set(resource.id, { x: anchor.x, y: band + offset });
    stackHeight.set(column, offset + nodeBox(resource).h + rowGap / 2);
  }
  const lastColumn = Math.max(0, ...columns.keys());
  loose.forEach((resource, index) =>
    placed.set(resource.id, {
      x: origin.x + (lastColumn + 1) * (width + colGap),
      y: band + index * (NODE_H + rowGap / 2),
    }),
  );
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const at = placed.get(n.id);
      return at ? { ...n, x: snap(at.x), y: snap(at.y) } : n;
    }),
  };
}
