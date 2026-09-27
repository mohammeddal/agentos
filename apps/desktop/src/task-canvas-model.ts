import { companyDomains, type Company, type CompanyTask } from "./company-model";

export const blockNames = { task: "Task", agent: "Agent", domain: "Domain", mcp: "MCP", context: "Context", skill: "Skill", connector: "Connector", approval: "Approval", restriction: "Restrictions", prompt: "Custom prompt" } as const;
export type BlockKind = keyof typeof blockNames;
export type CanvasNode = { id: string; kind: BlockKind; title: string; x: number; y: number; prompt: string; reference: string; source: string; engine: string; reviewer: string; readOnly: boolean; network: boolean; maxSteps: number };
export type CanvasEdge = { id: string; from: string; to: string; kind: "flow" | "attachment"; condition: "success" | "failure" | "always" | "approved" };
export type TaskCanvasGraph = { version: 1; nodes: CanvasNode[]; edges: CanvasEdge[] };
export const attachmentKinds: BlockKind[] = ["context", "mcp", "skill", "connector", "restriction"];
export const canvasSize = { width: 2400, height: 1600, nodeWidth: 210, nodeHeight: 130 };
export function newCanvasNode(kind: BlockKind, x: number, y: number, id: string = crypto.randomUUID()): CanvasNode {
  return { id, kind, title: blockNames[kind], x, y, prompt: "", reference: "", source: "", engine: "", reviewer: "human", readOnly: true, network: false, maxSteps: 20 };
}
export function initialTaskCanvas(task: CompanyTask): TaskCanvasGraph {
  return task.canvas || { version: 1, nodes: [{ ...newCanvasNode("task", 60, 180, "task-root"), title: task.title, prompt: task.brief }], edges: [] };
}
export function connectionError(graph: TaskCanvasGraph, from: string, to: string): string | null {
  const source = graph.nodes.find(n => n.id === from), target = graph.nodes.find(n => n.id === to);
  if (!source || !target) return "Choose two available blocks.";
  if (from === to) return "A block cannot connect to itself.";
  if (graph.edges.length >= 160) return "This draft supports up to 160 connections.";
  if (graph.edges.some(e => e.from === from && e.to === to)) return "These blocks are already connected.";
  if (attachmentKinds.includes(target.kind)) return "Connect resources and restrictions out to a task, agent, domain, approval, or prompt—not into another resource.";
  if (target.kind === "task" && !attachmentKinds.includes(source.kind)) return "The task is the flow entry. Only resources or restrictions can attach to it.";
  const seen = new Set<string>();
  function reaches(id: string): boolean { if (id === from) return true; if (seen.has(id)) return false; seen.add(id); return graph.edges.filter(e => e.from === id).some(e => reaches(e.to)); }
  return reaches(to) ? "This connection would create a loop." : null;
}
export function connectCanvas(graph: TaskCanvasGraph, from: string, to: string, id: string = crypto.randomUUID()): TaskCanvasGraph {
  const error = connectionError(graph, from, to); if (error) throw new Error(error);
  const attachment = attachmentKinds.includes(graph.nodes.find(n => n.id === from)!.kind);
  return { ...graph, edges: [...graph.edges, { id, from, to, kind: attachment ? "attachment" : "flow", condition: attachment ? "always" : graph.nodes.find(n => n.id === from)?.kind === "approval" ? "approved" : "success" }] };
}
export function removeCanvasNode(graph: TaskCanvasGraph, id: string): TaskCanvasGraph {
  if (graph.nodes.find(n => n.id === id)?.kind === "task") return graph;
  return { ...graph, nodes: graph.nodes.filter(n => n.id !== id), edges: graph.edges.filter(e => e.from !== id && e.to !== id) };
}
export function isTaskCanvas(value: unknown): value is TaskCanvasGraph {
  if (!value || typeof value !== "object") return false;
  const graph = value as TaskCanvasGraph;
  if (graph.version !== 1 || !Array.isArray(graph.nodes) || !graph.nodes.length || graph.nodes.length > 80 || !Array.isArray(graph.edges) || graph.edges.length > 160) return false;
  if (!graph.nodes.every(n => n && typeof n.id === "string" && !!n.id && Object.hasOwn(blockNames, n.kind) && ["title", "prompt", "reference", "source", "engine", "reviewer"].every(k => typeof n[k as keyof CanvasNode] === "string" && String(n[k as keyof CanvasNode]).length <= 6000) && Number.isFinite(n.x) && Number.isFinite(n.y) && n.x >= 0 && n.x <= canvasSize.width - canvasSize.nodeWidth && n.y >= 0 && n.y <= canvasSize.height - canvasSize.nodeHeight && typeof n.readOnly === "boolean" && typeof n.network === "boolean" && Number.isInteger(n.maxSteps) && n.maxSteps >= 1 && n.maxSteps <= 1000)) return false;
  if (new Set(graph.nodes.map(n => n.id)).size !== graph.nodes.length || graph.nodes.filter(n => n.kind === "task").length !== 1 || new Set(graph.edges.map(e => e?.id)).size !== graph.edges.length) return false;
  let checked: TaskCanvasGraph = { ...graph, edges: [] };
  for (const edge of graph.edges) {
    if (!edge || typeof edge.id !== "string" || !edge.id || !["success", "failure", "always", "approved"].includes(edge.condition) || connectionError(checked, edge.from, edge.to)) return false;
    const attachment = attachmentKinds.includes(graph.nodes.find(n => n.id === edge.from)!.kind);
    if (edge.kind !== (attachment ? "attachment" : "flow") || (attachment && edge.condition !== "always")) return false;
    checked = { ...checked, edges: [...checked.edges, edge] };
  }
  return true;
}
export function canvasWarnings(company: Company, graph: TaskCanvasGraph): string[] {
  const warnings: string[] = [];
  const agents = company.offices.flatMap(o => o.agents);
  const root = graph.nodes.find(n => n.kind === "task")!;
  const reachable = new Set([root.id]);
  let changed = true;
  while (changed) { changed = false; for (const e of graph.edges) if (e.kind === "flow" && reachable.has(e.from) && !reachable.has(e.to)) { reachable.add(e.to); changed = true; } }
  for (const n of graph.nodes) {
    if (attachmentKinds.includes(n.kind) ? !graph.edges.some(e => e.from === n.id && reachable.has(e.to)) : !reachable.has(n.id)) warnings.push(`${n.title}: not connected to the task flow.`);
    if (n.kind === "agent" && !agents.some(a => a.id === n.reference)) warnings.push(`${n.title}: choose an available agent.`);
    if (n.kind === "domain" && !companyDomains(company).includes(n.reference)) warnings.push(`${n.title}: choose an available domain.`);
    if (["mcp", "skill", "connector"].includes(n.kind) && !n.reference) warnings.push(`${n.title}: select a discovered capability or enter a reference.`);
    if (["context", "prompt"].includes(n.kind) && !n.prompt.trim()) warnings.push(`${n.title}: add context or a custom prompt.`);
    if (n.kind === "approval" && n.reviewer !== "human" && !agents.some(a => a.id === n.reviewer)) warnings.push(`${n.title}: reviewer is unavailable.`);
    if (n.kind === "approval" && !graph.edges.some(e => e.from === n.id && e.condition === "approved")) warnings.push(`${n.title}: connect an outgoing flow with the Approved condition.`);
  }
  return warnings;
}
