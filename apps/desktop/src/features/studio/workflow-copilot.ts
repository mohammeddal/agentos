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
export type CopilotPlan = {
  summary?: string;
  name?: string;
  outcome?: string;
  steps: PlanStep[];
  /** Ids of steps to delete. Steps not listed are kept as they are. */
  remove?: string[];
};
export type InstalledTool = Capability & { engine: "codex" | "claude" };

const FENCE = "agentos-workflow";
const stepKinds = new Set(["agent", "office", "prompt", "approval"]);
const isStep = (node: CanvasNode) => stepKinds.has(node.kind);
const lower = (text: string) => text.trim().toLowerCase();

/** The current workflow in the same shape the copilot answers with, so it edits rather than rebuilds. */
export function describeWorkflow(
  company: Company,
  graph: TaskCanvasGraph,
  /** Shorten long step instructions (only for very large workflows). */
  maxInstructions = Infinity,
): CopilotPlan {
  const clip = (text: string) =>
    text.length > maxInstructions ? `${text.slice(0, maxInstructions)}… (shortened)` : text;
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
        instructions: clip(node.prompt),
        ...(node.kind === "prompt"
          ? { engine: node.engine === "claude" ? "claude" : "codex" }
          : {}),
        after: incoming.map((e) => (e.from === root?.id ? "start" : e.from)),
        when: (incoming.find((e) => e.condition !== "approved")?.condition ||
          "success") as PlanStep["when"],
        tools: resources.filter((n) => n.kind !== "context").map((n) => n.title),
        context: resources
          .filter((n) => n.kind === "context")
          .map((n) => ({ title: n.title, notes: clip(n.prompt) })),
      };
    }),
  };
}

export function copilotPrompt(
  company: Company,
  graph: TaskCanvasGraph,
  tools: InstalledTool[],
  request: string,
  /** Facts the copilot can answer from: where files go, schedule, the latest run. */
  facts = "",
  /** Recent chat turns, so follow-ups like "why?" make sense. Each request starts a fresh engine
   * conversation; resuming one would resend every earlier copy of the workflow. */
  recent: ChatTurn[] = [],
): string {
  // A compacted chat starts with its summary; only turns after it are sent in full.
  let summaryAt = -1;
  recent.forEach((m, i) => {
    if (m.summary) summaryAt = i;
  });
  const summary = summaryAt >= 0 ? recent[summaryAt]!.text : "";
  const turns = recent.slice(summaryAt + 1).slice(-6);
  const agents = company.offices.flatMap((office) =>
    office.agents.map((a) => `- ${a.name} (${office.name}; ${a.role}; ${a.engine})`),
  );
  // Names only: the copilot needs to know what exists, not each tool's details.
  const toolNames = [
    ...new Set(
      tools
        .filter((t) => t.kind !== "skill" || !t.scope.toLowerCase().includes("system"))
        .map((t) => `${t.name} (${t.kind})`),
    ),
  ].slice(0, 150);
  // Keep the whole prompt well inside the runtime limit: shorten instructions only if needed.
  let workflowJson = JSON.stringify(describeWorkflow(company, graph));
  for (const cap of [4000, 1500, 600])
    if (workflowJson.length > 120_000)
      workflowJson = JSON.stringify(describeWorkflow(company, graph, cap));
  return [
    "You are the AgentOS workflow copilot for one workflow. You answer questions about it and edit it on request. You never run it, use tools, edit files, or run commands.",
    "",
    "First decide what the user wants:",
    "- A QUESTION (what does it do, where is the output saved, why did it fail, what does a step do): answer briefly and concretely from the facts below. Do NOT include a workflow block and do not change anything.",
    "- A CHANGE (add, remove, rewrite, reorder, attach a tool): say in one or two sentences what you changed, then include ONE workflow block containing only what changes.",
    "- Unclear: ask one short question and include no block.",
    "",
    "Workflow block format (a patch):",
    `\`\`\`${FENCE}\n{"summary":"...","steps":[{"id":"existing-or-new-id","title":"...","instructions":"..."}],"remove":["id-to-delete"]}\n\`\`\``,
    "- List only steps you add or change. For a changed step include its id and only the fields that change. Unlisted steps stay exactly as they are.",
    '- New steps need "id" (short, new), "kind", and "after".',
    '- Optional top-level "name" and "outcome" rename the workflow or change its goal.',
    "",
    "Step fields:",
    '- "kind": "agent" (set "agent" to an exact company agent name), "office" (set "office"), "prompt" (custom step; set "engine": "codex" or "claude"), "approval" (set "reviewer": "me" or an agent name).',
    '- "after": ids that must finish first; "start" means right after the workflow begins.',
    '- "when": "success" (default), "failure", or "always".',
    '- "tools": installed tool names only. "context": [{"title","notes"}].',
    '- "instructions": a specific brief for that step: what to do, inputs, and what to hand off.',
    '- Instructions ending in "(shortened)" were cut for length. When you change such a step, write its complete new instructions.',
    "",
    `Company agents:\n${agents.join("\n") || "- none (use prompt steps)"}`,
    "",
    `Installed tools: ${toolNames.join(", ") || "none"}`,
    "",
    facts ? `Facts about this workflow:\n${facts.slice(0, 4000)}\n` : "",
    summary ? `Summary of the earlier conversation:\n${summary.slice(0, 4000)}\n` : "",
    turns.length
      ? `Conversation so far (most recent last):\n${turns
          .map(
            (m) =>
              `${m.role === "user" ? "User" : "Copilot"}: ${m.text.length > 1500 ? `${m.text.slice(0, 1500)}…` : m.text}`,
          )
          .join("\n")}\n`
      : "",
    `Current workflow:\n\`\`\`json\n${workflowJson}\n\`\`\``,
    "",
    `User: ${request.slice(0, 20_000)}`,
  ].join("\n");
}

export type ChatTurn = { role: "user" | "copilot"; text: string; summary?: boolean };

/** Asks the engine to fold a long copilot chat into a short summary that replaces it. */
export function compactPrompt(workflowName: string, turns: ChatTurn[]): string {
  let budget = 150_000;
  const lines: string[] = [];
  // Newest turns matter most: keep them whole and drop the oldest if the chat is huge.
  for (const m of [...turns].reverse()) {
    const text = m.text.length > 3000 ? `${m.text.slice(0, 3000)}…` : m.text;
    const line = `${m.summary ? "Earlier summary" : m.role === "user" ? "User" : "Copilot"}: ${text}`;
    if (line.length > budget) break;
    budget -= line.length;
    lines.unshift(line);
  }
  return [
    `Summarize this chat about the AgentOS workflow "${workflowName}" so it can replace the chat as context for future requests.`,
    "Keep: decisions made, changes already applied, the user's preferences and constraints, and open questions or problems.",
    "Drop: greetings, repeated attempts, and errors that were resolved.",
    "Write at most 200 words as short bullet points. Do not include a workflow block. Do not use tools.",
    "",
    "Chat:",
    ...lines,
  ].join("\n");
}

/** Reads the copilot's workflow block. Returns null when the reply has no valid plan. */
export function parsePlan(text: string): CopilotPlan | null {
  const match = new RegExp("```" + FENCE + "\\s*\\n([\\s\\S]*?)```").exec(text);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]!) as CopilotPlan;
    if (!value || typeof value !== "object") return null;
    if (!Array.isArray(value.steps)) value.steps = [];
    if (value.steps.length > 40) return null;
    if (value.remove !== undefined && !Array.isArray(value.remove)) delete value.remove;
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
/**
 * Turns a patch (only changed steps, plus ids to remove) into the complete plan by merging it
 * with the current workflow. Unlisted steps keep everything, including their connections.
 */
export function mergePatch(
  company: Company,
  graph: TaskCanvasGraph,
  patch: CopilotPlan,
): CopilotPlan {
  const current = describeWorkflow(company, graph);
  const removed = new Set(patch.remove || []);
  const steps = current.steps
    .filter((step) => !removed.has(step.id))
    .map((step) => {
      const change = patch.steps.find((s) => s.id === step.id);
      if (!change) return step;
      const defined = Object.fromEntries(
        Object.entries(change).filter(([, value]) => value !== undefined && value !== null),
      ) as Partial<PlanStep>;
      return { ...step, ...defined };
    });
  for (const step of patch.steps)
    if (!current.steps.some((s) => s.id === step.id) && !removed.has(step.id)) steps.push(step);
  // Steps that waited on a removed step now follow what it followed.
  for (const step of steps)
    if (step.after?.some((id) => removed.has(id))) {
      const inherited = step.after.flatMap((id) =>
        removed.has(id) ? current.steps.find((s) => s.id === id)?.after || ["start"] : [id],
      );
      step.after = [...new Set(inherited.filter((id) => !removed.has(id)))];
    }
  return {
    ...current,
    ...(patch.name ? { name: patch.name } : {}),
    ...(typeof patch.outcome === "string" ? { outcome: patch.outcome } : {}),
    ...(patch.summary ? { summary: patch.summary } : {}),
    steps,
  };
}

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
