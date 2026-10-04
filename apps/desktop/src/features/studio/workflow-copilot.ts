import type { Company } from "../company/company-model";
import type { Capability } from "../engines/engine-inventory";
import {
  attachmentKinds,
  connectionError,
  newCanvasNode,
  type CanvasEdge,
  type CanvasNode,
  type TaskCanvasGraph,
} from "../tasks/task-canvas-model";
import { autoArrange } from "./studio-model";

/**
 * The workflow copilot edits a workflow from a chat. The engine answers with the complete
 * desired workflow in a fenced `agentos-workflow` JSON block; AgentOS applies it as one change.
 */
type StepKind = "agent" | "office" | "prompt" | "approval";
export type PlanStep = {
  id: string;
  kind?: StepKind | undefined;
  agent?: string;
  office?: string;
  reviewer?: string;
  title?: string;
  instructions?: string;
  engine?: "codex" | "claude";
  after?: string[];
  when?: "success" | "failure" | "always" | undefined;
  tools?: string[];
  context?: { title: string; notes: string }[];
};
export type CopilotPlan = { summary?: string; name?: string; outcome?: string; steps: PlanStep[] };
export type InstalledTool = Capability & { engine: "codex" | "claude" };

const FENCE = "agentos-workflow";
const stepKinds = new Set(["agent", "office", "prompt", "approval"]);
const isStep = (node: CanvasNode) => stepKinds.has(node.kind);
const lower = (text: string) => text.trim().toLowerCase();

/** The current workflow in the same shape the copilot answers with, so it edits rather than rebuilds. */
export function describeWorkflow(company: Company, graph: TaskCanvasGraph): CopilotPlan {
  const root = graph.nodes.find((n) => n.kind === "task");
  const agents = company.offices.flatMap((o) => o.agents);
  const attached = (id: string) =>
    graph.edges
      .filter((e) => e.kind === "attachment" && e.to === id)
      .map((e) => graph.nodes.find((n) => n.id === e.from)!)
      .filter(Boolean);
  return {
    name: root?.title || "",
    outcome: root?.prompt || "",
    steps: graph.nodes.filter(isStep).map((node) => {
      const incoming = graph.edges.filter((e) => e.kind === "flow" && e.to === node.id);
      const resources = attached(node.id);
      return {
        id: node.id,
        kind: node.kind as StepKind,
        ...(node.kind === "agent"
          ? { agent: agents.find((a) => a.id === node.reference)?.name || node.title }
          : {}),
        ...(node.kind === "office"
          ? { office: company.offices.find((o) => o.id === node.reference)?.name || node.title }
          : {}),
        ...(node.kind === "approval"
          ? {
              reviewer:
                node.reviewer === "human"
                  ? "me"
                  : agents.find((a) => a.id === node.reviewer)?.name || "me",
            }
          : {}),
        title: node.title,
        instructions: node.prompt,
        ...(node.kind === "prompt"
          ? { engine: node.engine === "claude" ? "claude" : "codex" }
          : {}),
        after: incoming.map((e) => (e.from === root?.id ? "start" : e.from)),
        when: (incoming.find((e) => e.condition !== "approved")?.condition ||
          "success") as PlanStep["when"],
        tools: resources.filter((n) => n.kind !== "context").map((n) => n.title),
        context: resources
          .filter((n) => n.kind === "context")
          .map((n) => ({ title: n.title, notes: n.prompt })),
      };
    }),
  };
}

export function copilotPrompt(
  company: Company,
  graph: TaskCanvasGraph,
  tools: InstalledTool[],
  request: string,
): string {
  const agents = company.offices.flatMap((office) =>
    office.agents.map((a) => `- ${a.name} (${office.name}; ${a.role}; ${a.engine})`),
  );
  const toolNames = [...new Set(tools.map((t) => `${t.name} [${t.kind}, ${t.engine}]`))].slice(
    0,
    200,
  );
  return [
    "You are the AgentOS workflow copilot. You design and edit multi-step agent workflows. You do not run them and you must not use tools, edit files, or run commands.",
    "Building blocks:",
    '- step kinds: "agent" (a company agent, set "agent" to its exact name), "office" (a whole office, set "office"), "prompt" (a custom step run directly on "codex" or "claude"), "approval" (pauses until "reviewer" approves: "me" or an agent name).',
    '- "after": ids of steps that must finish first; use "start" for the first steps. Steps with the same "after" run in parallel.',
    '- "when": run after the previous step "success" (default), "failure", or "always".',
    '- "tools": names of installed MCP servers, skills, or connectors the step must use. Only use names from the installed list.',
    '- "context": reference notes for a step: [{"title": "...", "notes": "..."}].',
    '- Write each step\'s "instructions" as a clear, specific brief for that agent: what to do, inputs to use, and what to hand off.',
    "",
    `Company agents:\n${agents.join("\n") || "- none (use prompt steps)"}`,
    "",
    `Installed tools:\n${toolNames.join("\n") || "- none"}`,
    "",
    `Current workflow (edit this; keep ids of steps you keep):\n\`\`\`json\n${JSON.stringify(describeWorkflow(company, graph), null, 1)}\n\`\`\``,
    "",
    `User request: ${request}`,
    "",
    `Reply with one or two sentences saying what you changed, then the COMPLETE updated workflow in a fenced block:\n\`\`\`${FENCE}\n{"summary":"...","name":"...","outcome":"...","steps":[{"id":"...","kind":"agent","agent":"...","title":"...","instructions":"...","after":["start"],"tools":[],"context":[]}]}\n\`\`\``,
    "If the request is unclear, ask one short question instead and omit the block.",
  ].join("\n");
}

/** Reads the copilot's workflow block. Returns null when the reply has no valid plan. */
export function parsePlan(text: string): CopilotPlan | null {
  const match = new RegExp("```" + FENCE + "\\s*\\n([\\s\\S]*?)```").exec(text);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]!) as CopilotPlan;
    if (!value || !Array.isArray(value.steps) || value.steps.length > 40) return null;
    const steps = value.steps.filter(
      (s): s is PlanStep => !!s && typeof s === "object" && typeof s.id === "string" && !!s.id,
    );
    return { ...value, steps };
  } catch {
    return null;
  }
}

/** The reply text without the workflow block, for the chat transcript. */
export function replyText(text: string): string {
  return text.replace(new RegExp("```" + FENCE + "[\\s\\S]*?```", "g"), "").trim();
}

/**
 * Applies a plan to the canvas. Steps keep their block (position, colour) when the id matches;
 * new blocks are laid out by flow. Annotations are never touched.
 */
export function applyPlan(
  company: Company,
  graph: TaskCanvasGraph,
  plan: CopilotPlan,
  tools: InstalledTool[],
): { graph: TaskCanvasGraph; changes: string[]; problems: string[] } {
  const changes: string[] = [];
  const problems: string[] = [];
  const agents = company.offices.flatMap((o) => o.agents);
  const root =
    graph.nodes.find((n) => n.kind === "task") ||
    ({ ...newCanvasNode("task", 0, 0, "task-root"), title: "Untitled workflow" } as CanvasNode);
  const nextRoot = {
    ...root,
    ...(plan.name?.trim() ? { title: plan.name.trim().slice(0, 120) } : {}),
    ...(typeof plan.outcome === "string" ? { prompt: plan.outcome.slice(0, 6000) } : {}),
  };
  if (nextRoot.title !== root.title || nextRoot.prompt !== root.prompt)
    changes.push("Updated the workflow name and outcome");

  const nodes: CanvasNode[] = [nextRoot];
  const idMap = new Map<string, string>([["start", root.id]]);
  let added = false;
  for (const step of plan.steps.slice(0, 40)) {
    const existing = graph.nodes.find((n) => n.id === step.id && isStep(n));
    const agent =
      step.agent && agents.find((a) => a.id === step.agent || lower(a.name) === lower(step.agent!));
    const office =
      step.office &&
      company.offices.find((o) => o.id === step.office || lower(o.name) === lower(step.office!));
    let kind: CanvasNode["kind"] =
      step.kind === "approval" ? "approval" : agent ? "agent" : office ? "office" : "prompt";
    if (step.kind === "agent" && !agent) {
      problems.push(`No agent named “${step.agent}”; made it a custom step.`);
      kind = "prompt";
    }
    const reviewerAgent =
      kind === "approval" && step.reviewer && lower(step.reviewer) !== "me"
        ? agents.find((a) => lower(a.name) === lower(step.reviewer!))
        : undefined;
    const base =
      existing && existing.kind === kind
        ? existing
        : {
            ...newCanvasNode(kind, 0, 0),
            ...(existing ? { x: existing.x, y: existing.y, style: existing.style } : {}),
          };
    const node: CanvasNode = {
      ...base,
      title: (
        step.title?.trim() ||
        (agent
          ? agent.name
          : office
            ? office.name
            : kind === "approval"
              ? "Approval"
              : "Custom step")
      ).slice(0, 120),
      prompt: (step.instructions ?? base.prompt ?? "").slice(0, 6000),
      reference: agent ? agent.id : office ? office.id : kind === "prompt" ? "" : base.reference,
      ...(kind === "prompt" ? { engine: step.engine === "claude" ? "claude" : "codex" } : {}),
      ...(kind === "approval" ? { reviewer: reviewerAgent?.id || "human" } : {}),
    };
    if (!existing) added = true;
    changes.push(
      existing
        ? node.prompt !== existing.prompt ||
          node.title !== existing.title ||
          node.kind !== existing.kind
          ? `Updated ${node.title}`
          : ""
        : `Added ${node.title}`,
    );
    idMap.set(step.id, node.id);
    nodes.push(node);
  }
  for (const removed of graph.nodes.filter(
    (n) => isStep(n) && !nodes.some((kept) => kept.id === n.id),
  ))
    changes.push(`Removed ${removed.title}`);

  // Flow connections, rebuilt from "after".
  let next: TaskCanvasGraph = { ...graph, nodes, edges: [] };
  const connect = (from: string, to: string, condition: CanvasEdge["condition"]) => {
    const error = connectionError(next, from, to);
    if (error) {
      problems.push(error);
      return;
    }
    next = {
      ...next,
      edges: [
        ...next.edges,
        {
          id: crypto.randomUUID(),
          from,
          to,
          kind: attachmentKinds.includes(next.nodes.find((n) => n.id === from)!.kind)
            ? "attachment"
            : "flow",
          condition,
        },
      ],
    };
  };
  for (const step of plan.steps.slice(0, 40)) {
    const target = idMap.get(step.id)!;
    const parents = (step.after?.length ? step.after : ["start"])
      .map((id) => idMap.get(id))
      .filter((id): id is string => !!id && id !== target);
    for (const parent of parents.length ? parents : [root.id]) {
      const fromApproval = next.nodes.find((n) => n.id === parent)?.kind === "approval";
      connect(parent, target, fromApproval ? "approved" : step.when || "success");
    }
  }

  // Resources: reuse blocks already attached to the step, add the rest.
  for (const step of plan.steps.slice(0, 40)) {
    const target = idMap.get(step.id)!;
    const targetNode = next.nodes.find((n) => n.id === target)!;
    const previous = graph.edges
      .filter((e) => e.kind === "attachment" && e.to === target)
      .map((e) => graph.nodes.find((n) => n.id === e.from))
      .filter((n): n is CanvasNode => !!n);
    const stepEngine =
      targetNode.kind === "agent"
        ? agents
            .find((a) => a.id === targetNode.reference)
            ?.engine.toLowerCase()
            .includes("claude")
          ? "claude"
          : "codex"
        : targetNode.engine === "claude"
          ? "claude"
          : "codex";
    for (const name of step.tools || []) {
      const reuse = previous.find((n) => n.kind !== "context" && lower(n.title) === lower(name));
      const tool =
        tools.find((t) => t.engine === stepEngine && lower(t.name) === lower(name)) ||
        tools.find((t) => lower(t.name) === lower(name));
      if (!reuse && !tool) {
        problems.push(`“${name}” isn't installed, so it wasn't attached.`);
        continue;
      }
      if (tool && tool.engine !== stepEngine)
        problems.push(
          `“${name}” is installed for ${tool.engine === "claude" ? "Claude Code" : "Codex"} only; ${targetNode.title} runs on the other engine.`,
        );
      const resource: CanvasNode = reuse || {
        ...newCanvasNode(tool!.kind as CanvasNode["kind"], 0, 0),
        title: tool!.name.slice(0, 120),
        reference: tool!.id,
        source: tool!.source,
        engine: tool!.engine,
        capabilityStatus: tool!.status,
      };
      if (!reuse) {
        added = true;
        changes.push(`Attached ${resource.title} to ${targetNode.title}`);
      }
      next = { ...next, nodes: [...next.nodes, resource] };
      connect(resource.id, target, "always");
    }
    for (const item of step.context || []) {
      if (!item?.title) continue;
      const reuse = previous.find(
        (n) => n.kind === "context" && lower(n.title) === lower(item.title),
      );
      const resource: CanvasNode = {
        ...(reuse || newCanvasNode("context", 0, 0)),
        title: item.title.slice(0, 120),
        prompt: (item.notes || "").slice(0, 6000),
      };
      if (!reuse) {
        added = true;
        changes.push(`Added context “${resource.title}”`);
      }
      next = { ...next, nodes: [...next.nodes, resource] };
      connect(resource.id, target, "always");
    }
  }
  if (next.nodes.length > 80) {
    problems.push("A workflow supports up to 80 blocks; the plan was not applied.");
    return { graph, changes: [], problems };
  }
  // Lay out only when new blocks need a place; otherwise keep the user's arrangement.
  return {
    graph: added ? autoArrange(next) : next,
    changes: changes.filter(Boolean),
    problems: [...new Set(problems)],
  };
}
