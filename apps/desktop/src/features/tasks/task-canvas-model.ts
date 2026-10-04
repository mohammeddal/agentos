import { validAttachments, type Attachment } from "../attachments/attachment-model";
import {
  companyDomains,
  type Company,
  type CompanyTask,
  type TaskAssignment,
} from "../company/company-model";

export const blockNames = {
  task: "Task",
  office: "Office",
  agent: "Agent",
  domain: "Domain",
  mcp: "MCP",
  context: "Context",
  skill: "Skill",
  connector: "Connector",
  approval: "Approval",
  restriction: "Restrictions",
  prompt: "Custom prompt",
} as const;
export type BlockKind = keyof typeof blockNames;
export const contextTypeNames = {
  notes: "Notes",
  files: "Files",
  folder: "Local folder",
  github: "GitHub",
  jira: "Jira",
  url: "Web page",
  memory: "Memory",
} as const;
export type ContextType = keyof typeof contextTypeNames;
export type CanvasNode = {
  id: string;
  kind: BlockKind;
  title: string;
  x: number;
  y: number;
  prompt: string;
  reference: string;
  source: string;
  engine: string;
  reviewer: string;
  readOnly: boolean;
  network: boolean;
  maxSteps: number;
  /** Task attachment IDs selected for this context block. Optional for older saved canvases. */
  attachmentIds?: string[];
  /** Names and types of those attachments, so the Studio can show and preview them. */
  files?: Attachment[];
  /** Primary context source. Missing on older canvases and treated as notes. */
  contextType?: ContextType;
  /** Discovery state captured when a local capability was selected. */
  capabilityStatus?: "" | "found" | "configured" | "disabled" | "cached";
  /** Studio appearance: accent colour and custom size. Never affects execution. */
  style?: NodeStyle;
};
export type NodeStyle = { fill?: string; w?: number; h?: number };
/** Visual-only objects drawn in the Studio: they annotate a workflow but never run. */
export type DecorKind = "rect" | "ellipse" | "text" | "sticky" | "section";
export type DecorItem = {
  id: string;
  type: DecorKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  text: string;
  fontSize: number;
  radius: number;
  hidden?: boolean;
  locked?: boolean;
};
export const decorKinds: DecorKind[] = ["rect", "ellipse", "text", "sticky", "section"];
const hexColor = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
/** Studio coordinates are unbounded in practice; keep a generous sanity limit. */
export const STUDIO_LIMIT = 20000;
export function isDecorItem(value: unknown): value is DecorItem {
  if (!value || typeof value !== "object") return false;
  const d = value as DecorItem;
  return (
    typeof d.id === "string" &&
    !!d.id &&
    decorKinds.includes(d.type) &&
    typeof d.name === "string" &&
    d.name.length <= 200 &&
    [d.x, d.y].every((n) => Number.isFinite(n) && Math.abs(n) <= STUDIO_LIMIT) &&
    [d.w, d.h].every((n) => Number.isFinite(n) && n >= 1 && n <= STUDIO_LIMIT) &&
    hexColor.test(d.fill) &&
    hexColor.test(d.stroke) &&
    typeof d.text === "string" &&
    d.text.length <= 4000 &&
    Number.isFinite(d.fontSize) &&
    d.fontSize >= 6 &&
    d.fontSize <= 200 &&
    Number.isFinite(d.radius) &&
    d.radius >= 0 &&
    d.radius <= 500 &&
    (d.hidden === undefined || typeof d.hidden === "boolean") &&
    (d.locked === undefined || typeof d.locked === "boolean")
  );
}
function isNodeStyle(value: unknown): value is NodeStyle {
  if (!value || typeof value !== "object") return false;
  const s = value as NodeStyle;
  return (
    (s.fill === undefined || hexColor.test(s.fill)) &&
    [s.w, s.h].every((n) => n === undefined || (Number.isFinite(n) && n >= 80 && n <= 1200))
  );
}
export type CanvasEdge = {
  id: string;
  from: string;
  to: string;
  kind: "flow" | "attachment";
  condition: "success" | "failure" | "always" | "approved";
};
export type TaskCanvasGraph = {
  version: 1;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** Studio-only annotations (shapes, text, stickies, sections). */
  decor?: DecorItem[];
};
export const attachmentKinds: BlockKind[] = ["context", "mcp", "skill", "connector", "restriction"];
export const canvasSize = { width: 2400, height: 1600, nodeWidth: 210, nodeHeight: 130 };
export function fitCanvas(graph: TaskCanvasGraph, width: number, height: number) {
  if (!graph.nodes.length) return { zoom: 1, left: 0, top: 0 };
  const left = Math.max(0, Math.min(...graph.nodes.map((n) => n.x)) - 35);
  const top = Math.max(0, Math.min(...graph.nodes.map((n) => n.y)) - 35);
  const right = Math.max(...graph.nodes.map((n) => n.x + canvasSize.nodeWidth)) + 35;
  const bottom = Math.max(...graph.nodes.map((n) => n.y + canvasSize.nodeHeight)) + 35;
  const zoom = Math.max(0.1, Math.min(1, width / (right - left), height / (bottom - top)));
  return { zoom, left: left * zoom, top: top * zoom };
}
export function newCanvasNode(
  kind: BlockKind,
  x: number,
  y: number,
  id: string = crypto.randomUUID(),
): CanvasNode {
  return {
    id,
    kind,
    title: blockNames[kind],
    x,
    y,
    prompt: "",
    reference: "",
    source: "",
    engine: "",
    reviewer: "human",
    readOnly: true,
    network: false,
    maxSteps: 20,
    attachmentIds: [],
    ...(kind === "context" ? { contextType: "notes" as const } : {}),
    capabilityStatus: "",
  };
}

/**
 * A legacy Task block remains the single explicit entry when present. Without one,
 * every flow block with no incoming handoff is an entry and starts in parallel.
 */
export function canvasEntryNodes(graph: TaskCanvasGraph): CanvasNode[] {
  const task = graph.nodes.find((node) => node.kind === "task");
  if (task) return [task];
  const incoming = new Set(
    graph.edges.filter((edge) => edge.kind === "flow").map((edge) => edge.to),
  );
  return graph.nodes.filter(
    (node) => !attachmentKinds.includes(node.kind) && !incoming.has(node.id),
  );
}

/**
 * Give lightweight workflows a useful directory name without forcing a separate
 * metadata step. An explicit task name still wins in the task form.
 */
export function inferredTaskTitle(graph: TaskCanvasGraph): string {
  const work = graph.nodes.filter((node) => !attachmentKinds.includes(node.kind));
  const task = work.find((node) => node.kind === "task");
  const source =
    task?.prompt.trim() ||
    work.find((node) => node.prompt.trim())?.prompt.trim() ||
    work
      .find((node) => node.title.trim() && node.title.trim() !== blockNames[node.kind])
      ?.title.trim() ||
    "";
  const firstLine = source.split(/\r?\n/).find((line) => line.trim()) || "";
  const plain = firstLine
    .replace(/^\s*(?:#{1,6}|[-+])\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[\*`_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  const title = plain[0]!.toUpperCase() + plain.slice(1);
  return title.length > 120 ? `${title.slice(0, 119).trimEnd()}…` : title;
}

function reachableCanvasNodes(graph: TaskCanvasGraph): Set<string> {
  const reachable = new Set(canvasEntryNodes(graph).map((node) => node.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      if (edge.kind === "flow" && reachable.has(edge.from) && !reachable.has(edge.to)) {
        reachable.add(edge.to);
        changed = true;
      }
    }
  }
  return reachable;
}

export function initialTaskCanvas(task: CompanyTask): TaskCanvasGraph {
  return (
    task.canvas || {
      version: 1,
      nodes: [
        { ...newCanvasNode("task", 60, 180, "task-root"), title: task.title, prompt: task.brief },
      ],
      edges: [],
    }
  );
}

/** Convert the older task-level team into visible, connected workflow blocks. */
export function taskCanvasFromAssignment(company: Company, task: CompanyTask): TaskCanvasGraph {
  if (task.canvas) return task.canvas;
  const graph = initialTaskCanvas(task);
  const nodes = task.assignment.targets.map((reference, index) => {
    const kind = task.assignment.kind === "domains" ? "domain" : "agent";
    const title =
      kind === "domain"
        ? reference
        : company.offices.flatMap((office) => office.agents).find((agent) => agent.id === reference)
            ?.name || "Unavailable agent";
    return {
      ...newCanvasNode(kind, 360 + index * 270, 180, `assignment-${index + 1}`),
      title,
      reference,
    };
  });
  return {
    ...graph,
    nodes: [...graph.nodes, ...nodes],
    edges: nodes.map((node, index) => ({
      id: `assignment-edge-${index + 1}`,
      from: index ? nodes[index - 1]!.id : graph.nodes[0]!.id,
      to: node.id,
      kind: "flow" as const,
      condition: "success" as const,
    })),
  };
}

/** Canvas work blocks are the source of truth for the saved task team. */
export function taskCanvasAssignment(company: Company, graph: TaskCanvasGraph): TaskAssignment {
  const ids = new Set<string>();
  const reachable = reachableCanvasNodes(graph);
  for (const node of graph.nodes.filter((candidate) => reachable.has(candidate.id))) {
    if (node.kind === "agent") {
      if (
        company.offices.some((office) => office.agents.some((agent) => agent.id === node.reference))
      )
        ids.add(node.reference);
    } else if (node.kind === "office") {
      company.offices
        .find((office) => office.id === node.reference)
        ?.agents.forEach((agent) => ids.add(agent.id));
    } else if (node.kind === "domain") {
      company.offices
        .filter((office) => office.domain === node.reference)
        .flatMap((office) => office.agents)
        .forEach((agent) => ids.add(agent.id));
    }
  }
  return { kind: "agents", targets: [...ids] };
}
export function connectionError(
  graph: TaskCanvasGraph,
  from: string,
  to: string,
  allowLegacyApprovalAttachment = false,
): string | null {
  const source = graph.nodes.find((n) => n.id === from),
    target = graph.nodes.find((n) => n.id === to);
  if (!source || !target) return "Choose two available blocks.";
  if (from === to) return "A block cannot connect to itself.";
  if (graph.edges.length >= 160) return "This draft supports up to 160 connections.";
  if (graph.edges.some((e) => e.from === from && e.to === to))
    return "These blocks are already connected.";
  if (attachmentKinds.includes(target.kind))
    return "Connect resources and restrictions out to a task, agent, domain, or prompt—not into another resource.";
  if (
    target.kind === "approval" &&
    attachmentKinds.includes(source.kind) &&
    !allowLegacyApprovalAttachment
  )
    return "Attach resources to the work step before or after an approval, not to the approval itself.";
  const workflowRoot = graph.nodes.find((node) => node.kind === "task");
  if (target.id === workflowRoot?.id && !attachmentKinds.includes(source.kind))
    return "The workflow is the flow entry. Connect later task steps after it.";
  const seen = new Set<string>();
  function reaches(id: string): boolean {
    if (id === from) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return graph.edges.filter((e) => e.from === id).some((e) => reaches(e.to));
  }
  return reaches(to) ? "This connection would create a loop." : null;
}
export function connectCanvas(
  graph: TaskCanvasGraph,
  from: string,
  to: string,
  id: string = crypto.randomUUID(),
): TaskCanvasGraph {
  const error = connectionError(graph, from, to);
  if (error) throw new Error(error);
  const attachment = attachmentKinds.includes(graph.nodes.find((n) => n.id === from)!.kind);
  return {
    ...graph,
    edges: [
      ...graph.edges,
      {
        id,
        from,
        to,
        kind: attachment ? "attachment" : "flow",
        condition: attachment
          ? "always"
          : graph.nodes.find((n) => n.id === from)?.kind === "approval"
            ? "approved"
            : "success",
      },
    ],
  };
}
export function removeCanvasNode(graph: TaskCanvasGraph, id: string): TaskCanvasGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
  };
}
export function isTaskCanvas(value: unknown): value is TaskCanvasGraph {
  if (!value || typeof value !== "object") return false;
  const graph = value as TaskCanvasGraph;
  if (
    graph.version !== 1 ||
    !Array.isArray(graph.nodes) ||
    graph.nodes.length > 80 ||
    !Array.isArray(graph.edges) ||
    graph.edges.length > 160 ||
    (graph.decor !== undefined &&
      (!Array.isArray(graph.decor) ||
        graph.decor.length > 400 ||
        !graph.decor.every(isDecorItem) ||
        new Set(graph.decor.map((d) => d.id)).size !== graph.decor.length))
  )
    return false;
  if (
    !graph.nodes.every(
      (n) =>
        n &&
        typeof n.id === "string" &&
        !!n.id &&
        Object.hasOwn(blockNames, n.kind) &&
        ["title", "prompt", "reference", "source", "engine", "reviewer"].every(
          (k) =>
            typeof n[k as keyof CanvasNode] === "string" &&
            String(n[k as keyof CanvasNode]).length <= 6000,
        ) &&
        Number.isFinite(n.x) &&
        Number.isFinite(n.y) &&
        Math.abs(n.x) <= STUDIO_LIMIT &&
        Math.abs(n.y) <= STUDIO_LIMIT &&
        (n.style === undefined || isNodeStyle(n.style)) &&
        typeof n.readOnly === "boolean" &&
        typeof n.network === "boolean" &&
        (n.attachmentIds === undefined ||
          (Array.isArray(n.attachmentIds) &&
            n.attachmentIds.length <= 8 &&
            new Set(n.attachmentIds).size === n.attachmentIds.length &&
            n.attachmentIds.every((id) => typeof id === "string" && !!id))) &&
        (n.files === undefined || validAttachments(n.files)) &&
        (n.contextType === undefined || Object.hasOwn(contextTypeNames, n.contextType)) &&
        (n.capabilityStatus === undefined ||
          ["", "found", "configured", "disabled", "cached"].includes(n.capabilityStatus)) &&
        Number.isInteger(n.maxSteps) &&
        n.maxSteps >= 1 &&
        n.maxSteps <= 1000,
    )
  )
    return false;
  if (
    new Set(graph.nodes.map((n) => n.id)).size !== graph.nodes.length ||
    new Set(graph.edges.map((e) => e?.id)).size !== graph.edges.length
  )
    return false;
  let checked: TaskCanvasGraph = { ...graph, edges: [] };
  for (const edge of graph.edges) {
    if (
      !edge ||
      typeof edge.id !== "string" ||
      !edge.id ||
      !["success", "failure", "always", "approved"].includes(edge.condition) ||
      connectionError(checked, edge.from, edge.to, true)
    )
      return false;
    const attachment = attachmentKinds.includes(graph.nodes.find((n) => n.id === edge.from)!.kind);
    if (
      edge.kind !== (attachment ? "attachment" : "flow") ||
      (attachment && edge.condition !== "always")
    )
      return false;
    checked = { ...checked, edges: [...checked.edges, edge] };
  }
  return true;
}
export function canvasWarnings(company: Company, graph: TaskCanvasGraph): string[] {
  const warnings: string[] = [];
  const agents = company.offices.flatMap((o) => o.agents);
  const entries = canvasEntryNodes(graph);
  const reachable = reachableCanvasNodes(graph);
  if (!entries.length)
    warnings.push(
      "Add an office, domain, agent, custom prompt, or approval to start the workflow.",
    );
  for (const n of graph.nodes) {
    if (
      attachmentKinds.includes(n.kind)
        ? !graph.edges.some((e) => e.from === n.id && reachable.has(e.to))
        : !reachable.has(n.id)
    )
      warnings.push(`${n.title}: not connected to the workflow.`);
    if (n.kind === "agent" && !agents.some((a) => a.id === n.reference))
      warnings.push(`${n.title}: choose an available agent.`);
    if (n.kind === "office") {
      const office = company.offices.find((candidate) => candidate.id === n.reference);
      if (!office) warnings.push(`${n.title}: choose an available office.`);
      else if (!office.agents.length) warnings.push(`${n.title}: this office has no agents.`);
    }
    if (n.kind === "domain" && !companyDomains(company).includes(n.reference))
      warnings.push(`${n.title}: choose an available domain.`);
    if (["mcp", "skill", "connector"].includes(n.kind)) {
      if (!n.reference) warnings.push(`${n.title}: select a discovered capability.`);
      else if (!n.source || !n.engine || !n.capabilityStatus)
        warnings.push(`${n.title}: replace the manual reference with a discovered capability.`);
      else if (n.capabilityStatus === "disabled")
        warnings.push(`${n.title}: choose a capability that is not disabled.`);
    }
    if (n.kind === "context") {
      const contextType = n.contextType || "notes";
      if (["folder", "github", "jira", "url", "memory"].includes(contextType) && !n.source.trim())
        warnings.push(
          `${n.title}: add the ${contextTypeNames[contextType].toLowerCase()} reference.`,
        );
      else if (!n.prompt.trim() && !n.source.trim() && !(n.attachmentIds || []).length)
        warnings.push(`${n.title}: add notes or choose a task file.`);
    }
    if (n.kind === "prompt" && !n.prompt.trim())
      warnings.push(`${n.title}: add context or a custom prompt.`);
    if (n.kind === "approval" && n.reviewer !== "human" && !agents.some((a) => a.id === n.reviewer))
      warnings.push(`${n.title}: reviewer is unavailable.`);
    // An approval with no outgoing flow is a final sign-off; one that continues must do so
    // on approval.
    if (
      n.kind === "approval" &&
      graph.edges.some((e) => e.kind === "flow" && e.from === n.id && e.condition !== "approved")
    )
      warnings.push(`${n.title}: connections after an approval must use the Approved condition.`);
  }
  for (const edge of graph.edges) {
    if (
      edge.kind === "attachment" &&
      graph.nodes.find((node) => node.id === edge.to)?.kind === "approval"
    )
      warnings.push("Move resources from an approval block to the work step they should affect.");
  }
  return warnings;
}
