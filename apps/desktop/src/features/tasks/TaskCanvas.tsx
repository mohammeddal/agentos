import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  Building2,
  Layers3,
  Plug,
  FileText,
  FolderOpen,
  Github,
  GitBranch,
  Link2,
  Sparkles,
  ShieldCheck,
  SlidersHorizontal,
  MessageSquare,
  ClipboardList,
  GripVertical,
  Undo2,
  Redo2,
  Plus,
  Minus,
  Paperclip,
  RefreshCw,
  Search,
  Settings2,
  StickyNote,
  Ticket,
  Trash2,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { companyDomains, type Company, type CompanyTask } from "../company/company-model";
import { AttachmentEditor } from "../attachments/Attachments";
import { HelpTip } from "../../shared/HelpTip";
import type { Attachment } from "../attachments/attachment-model";
import { compileTask, type LiveStep } from "../engines/live-runtime";
import { TaskModels } from "../engines/TaskModels";
import type { ApprovalRule } from "./task-approvals";
import {
  discoverEngine,
  engineNames,
  type Engine,
  type Inventory,
} from "../engines/engine-inventory";
import {
  attachmentKinds,
  blockNames,
  canvasEntryNodes,
  fitCanvas,
  canvasSize,
  canvasWarnings,
  connectCanvas,
  contextTypeNames,
  initialTaskCanvas,
  newCanvasNode,
  removeCanvasNode,
  type BlockKind,
  type CanvasNode,
  type ContextType,
  type TaskCanvasGraph,
  type CanvasEdge,
} from "./task-canvas-model";
import "./task-canvas.css";

const icons = {
  task: ClipboardList,
  office: Building2,
  agent: Bot,
  domain: Layers3,
  mcp: Plug,
  context: FileText,
  skill: Sparkles,
  connector: Plug,
  approval: ShieldCheck,
  restriction: SlidersHorizontal,
  prompt: MessageSquare,
};
const descriptions = {
  task: "A task step in this workflow",
  office: "One office team",
  agent: "A specialist",
  domain: "An entire team",
  mcp: "Tools & servers",
  context: "Facts & source notes",
  skill: "Reusable expertise",
  connector: "An integration",
  approval: "A review checkpoint",
  restriction: "Boundaries & limits",
  prompt: "Your instructions",
};
const contextIcons = {
  notes: StickyNote,
  files: Paperclip,
  folder: FolderOpen,
  github: Github,
  jira: Ticket,
  url: Link2,
  memory: BookOpen,
};
const contextSourceFields: Partial<Record<ContextType, { label: string; placeholder: string }>> = {
  folder: { label: "Folder path", placeholder: "/Users/you/Projects/app or ./docs" },
  github: {
    label: "Repository, issue, PR, or file",
    placeholder: "owner/repo, #123, or a GitHub URL",
  },
  jira: { label: "Jira ticket", placeholder: "ENG-123 or a Jira ticket URL" },
  url: { label: "Web page", placeholder: "https://…" },
  memory: {
    label: "Memory file or scope",
    placeholder: "MEMORY.md, Office · Engineering, or Agent · Reviewer",
  },
};
const contextHints: Record<ContextType, string> = {
  notes: "Paste the facts or instructions this step should use.",
  files: "Choose task attachments below. Files remain scoped to this workflow step.",
  folder: "The selected engine must have permission to read this local path.",
  github:
    "Attach a GitHub connector or MCP block if the engine cannot already open this reference.",
  jira: "Attach a Jira connector or MCP block. A ticket reference alone does not prove access.",
  url: "Opening the page depends on the engine's network access and task restrictions.",
  memory: "Reviewed memory is scoped automatically; use this to point at a specific file or area.",
};
const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));
const stepKinds: BlockKind[] = ["task", "office", "agent", "domain", "prompt"];
export type ResourceSetupKind = "context" | "mcp" | "skill" | "connector";

export function TaskCanvas({
  company,
  task,
  save,
  back,
  storageError,
  saveModels,
  changeProject,
  changeAttachments,
  onAttachmentsBusy,
  changeApproval,
  changeTaskDetails,
  openResourceSettings,
  embedded = false,
}: {
  company: Company;
  task: CompanyTask;
  save: (graph: TaskCanvasGraph) => void;
  back: () => void;
  storageError: boolean;
  saveModels: (task: CompanyTask) => void;
  changeProject?: (projectId: string) => void;
  changeAttachments?: (attachments: Attachment[]) => void;
  onAttachmentsBusy?: (busy: boolean) => void;
  changeApproval?: (rule: ApprovalRule) => void;
  changeTaskDetails?: (details: { title: string; brief: string }) => void;
  openResourceSettings?: (kind: ResourceSetupKind, engine: Engine) => void;
  embedded?: boolean;
}) {
  const [graph, setGraph] = useState(() => initialTaskCanvas(task));
  const [past, setPast] = useState<TaskCanvasGraph[]>([]),
    [future, setFuture] = useState<TaskCanvasGraph[]>([]);
  const [selected, setSelected] = useState(graph.nodes[0]?.id || ""),
    [edgeId, setEdgeId] = useState("");
  const [taskSettings, setTaskSettings] = useState(!graph.nodes.length);
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [connecting, setConnecting] = useState("");
  const [zoom, setZoom] = useState(0.85),
    [error, setError] = useState("");
  const [moving, setMoving] = useState<{ id: string; x: number; y: number } | null>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const wireStart = useRef<{ x: number; y: number } | null>(null);
  const [wire, setWire] = useState<{ x: number; y: number } | null>(null);
  const viewport = useRef<HTMLDivElement>(null),
    world = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine>("codex"),
    [workspace, setWorkspace] = useState("");
  const [inventory, setInventory] = useState<Inventory | null>(null),
    [discovering, setDiscovering] = useState(false),
    [discoveryError, setDiscoveryError] = useState("");
  const [capabilityQuery, setCapabilityQuery] = useState("");
  const discoveryRequest = useRef(0);
  const node = graph.nodes.find((n) => n.id === selected),
    edge = graph.edges.find((e) => e.id === edgeId);
  const contextType: ContextType = node?.kind === "context" ? node.contextType || "notes" : "notes";
  const agents = company.offices.flatMap((o) => o.agents);
  const taskApprovalAgentId = task.approval?.kind === "agent" ? task.approval.agentId : "";
  const scopedFileIds = new Set(graph.nodes.flatMap((candidate) => candidate.attachmentIds || []));
  const warnings = [
    ...canvasWarnings(company, graph),
    ...(scopedFileIds.size
      ? (task.attachments || [])
          .filter((file) => !scopedFileIds.has(file.id))
          .map((file) => `${file.name}: attached to the task but not assigned to a workflow step.`)
      : []),
  ];
  const shown = graph.nodes.map((n) =>
    moving?.id === n.id ? { ...n, x: moving.x, y: moving.y } : n,
  );
  const workflowRootId = graph.nodes.find((candidate) => candidate.kind === "task")?.id;
  const entryIds = new Set(canvasEntryNodes(graph).map((entry) => entry.id));
  function commit(next: TaskCanvasGraph) {
    if (JSON.stringify(next) === JSON.stringify(graph)) return;
    setPast((p) => [...p, graph].slice(-50));
    setFuture([]);
    setGraph(next);
    save(next);
    setError("");
  }
  function fit() {
    const view = viewport.current;
    if (!view) return;
    const fitted = fitCanvas(graph, view.clientWidth - 20, view.clientHeight - 20);
    setZoom(fitted.zoom);
    requestAnimationFrame(() => view.scrollTo({ left: fitted.left, top: fitted.top }));
  }
  function undo() {
    const next = past.at(-1);
    if (!next) return;
    setFuture((f) => [graph, ...f]);
    setPast((p) => p.slice(0, -1));
    setGraph(next);
    save(next);
    setConnecting("");
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    setPast((p) => [...p, graph]);
    setFuture((f) => f.slice(1));
    setGraph(next);
    save(next);
  }
  function update(id: string, patch: Partial<CanvasNode>) {
    const current = graph.nodes.find((candidate) => candidate.id === id);
    if (
      current &&
      current.id === workflowRootId &&
      changeTaskDetails &&
      (patch.title !== undefined || patch.prompt !== undefined)
    )
      changeTaskDetails({
        title: patch.title ?? current.title,
        brief: patch.prompt ?? current.prompt,
      });
    commit({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  }
  function add(kind: BlockKind, x?: number, y?: number) {
    if (graph.nodes.length >= 80) {
      setError("This draft supports up to 80 blocks.");
      return;
    }
    const columns = Math.max(
      1,
      Math.min(8, Math.floor((viewport.current?.clientWidth || 700) / zoom / 270)),
    );
    let slot = { x: 40, y: 40 };
    for (let i = 0; i < 80; i++) {
      const candidate = { x: 40 + (i % columns) * 270, y: 40 + Math.floor(i / columns) * 175 };
      if (
        candidate.y <= 1470 &&
        !graph.nodes.some(
          (n) => Math.abs(n.x - candidate.x) < 230 && Math.abs(n.y - candidate.y) < 145,
        )
      ) {
        slot = candidate;
        break;
      }
    }
    const next = newCanvasNode(kind, clamp(x ?? slot.x, 2190), clamp(y ?? slot.y, 1470));
    commit({ ...graph, nodes: [...graph.nodes, next] });
    setSelected(next.id);
    setEdgeId("");
    setTaskSettings(false);
    if (x === undefined)
      viewport.current?.scrollTo({
        left: Math.max(0, next.x * zoom - 50),
        top: Math.max(0, next.y * zoom - 80),
        behavior: "smooth",
      });
  }
  function attach(kind: (typeof attachmentKinds)[number], target: CanvasNode) {
    if (graph.nodes.length >= 80) {
      setError("This draft supports up to 80 blocks.");
      return;
    }
    const offset = graph.edges.filter((e) => e.kind === "attachment" && e.to === target.id).length;
    const hasLeftSpace = target.x >= 270;
    const resource = newCanvasNode(
      kind,
      clamp(hasLeftSpace ? target.x - 270 : target.x, 2190),
      clamp(target.y + (hasLeftSpace ? offset : offset + 1) * 155, 1470),
    );
    try {
      const withNode = { ...graph, nodes: [...graph.nodes, resource] };
      commit(connectCanvas(withNode, resource.id, target.id));
      setSelected(resource.id);
      setEdgeId("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function addApprovalAfter(target: CanvasNode) {
    if (graph.nodes.length >= 80) {
      setError("This draft supports up to 80 blocks.");
      return;
    }
    const offset = graph.edges.filter(
      (candidate) => candidate.kind === "flow" && candidate.from === target.id,
    ).length;
    const hasRightSpace = target.x <= 1920;
    const approval = newCanvasNode(
      "approval",
      clamp(hasRightSpace ? target.x + 270 : target.x, 2190),
      clamp(target.y + (hasRightSpace ? offset : offset + 1) * 155, 1470),
    );
    try {
      const withNode = { ...graph, nodes: [...graph.nodes, approval] };
      commit(connectCanvas(withNode, target.id, approval.id));
      setSelected(approval.id);
      setEdgeId("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function connect(source: string, target: string) {
    try {
      commit(connectCanvas(graph, source, target));
      setConnecting("");
      setWire(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function remove() {
    if (edge) {
      commit({ ...graph, edges: graph.edges.filter((e) => e.id !== edge.id) });
      setEdgeId("");
    } else if (node) {
      const removedTask = node.id === workflowRootId;
      commit(removeCanvasNode(graph, selected));
      setSelected("");
      setTaskSettings(removedTask);
    }
  }
  function point(clientX: number, clientY: number) {
    const rect = world.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  }
  async function discover() {
    const request = ++discoveryRequest.current;
    setDiscovering(true);
    setDiscoveryError("");
    setInventory(null);
    try {
      const next = await discoverEngine(engine, workspace.trim());
      if (discoveryRequest.current === request) setInventory(next);
    } catch (e) {
      if (discoveryRequest.current === request) setDiscoveryError((e as Error).message);
    } finally {
      if (discoveryRequest.current === request) setDiscovering(false);
    }
  }
  useEffect(() => {
    if (!node || !["mcp", "skill", "connector"].includes(node.kind)) return;
    setCapabilityQuery("");
    if (["codex", "claude"].includes(node.engine) && node.engine !== engine) {
      setEngine(node.engine as Engine);
      return;
    }
    void discover();
    return () => {
      discoveryRequest.current++;
    };
  }, [selected, engine]);
  let executionSteps: LiveStep[] = [];
  try {
    executionSteps = compileTask(company, { ...task, canvas: graph });
  } catch {
    // Incomplete drafts remain editable; actionable items are listed only when present below.
  }
  const taskSettingsPanel = (
    <>
      <h3>Workflow settings</h3>
      <p className="tc-task-settings-note">
        These details belong to the workflow, while blocks on the map describe its task steps,
        owners, context, and controls.
      </p>
      <label>
        Workflow name
        <input
          maxLength={120}
          value={task.title}
          disabled={!changeTaskDetails}
          onChange={(event) =>
            changeTaskDetails?.({ title: event.target.value, brief: task.brief })
          }
        />
      </label>
      <label>
        Workflow outcome
        <textarea
          rows={6}
          maxLength={6000}
          value={task.brief}
          disabled={!changeTaskDetails}
          placeholder="Describe the outcome, context, and what done looks like…"
          onChange={(event) =>
            changeTaskDetails?.({ title: task.title, brief: event.target.value })
          }
        />
      </label>
      {changeProject && (
        <label>
          Company project
          <select
            value={task.projectId || ""}
            onChange={(event) => changeProject(event.target.value)}
          >
            <option value="">No project · Company-wide</option>
            {task.projectId &&
              !company.projects?.some((project) => project.id === task.projectId) && (
                <option value={task.projectId}>Unavailable project (retained)</option>
              )}
            {(company.projects || []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {changeApproval && (
        <label>
          Before this workflow starts
          <select
            value={
              task.approval?.kind === "agent"
                ? `agent:${task.approval.agentId}`
                : task.approval?.kind || "none"
            }
            onChange={(event) => {
              const value = event.target.value;
              changeApproval(
                value === "human"
                  ? { kind: "human" }
                  : value.startsWith("agent:")
                    ? { kind: "agent", agentId: value.slice(6) }
                    : { kind: "none" },
              );
            }}
          >
            <option value="human">My approval</option>
            <option value="none">No approval</option>
            <optgroup label="Agent approval">
              {agents.map((agent) => (
                <option key={agent.id} value={`agent:${agent.id}`}>
                  {agent.name}
                </option>
              ))}
            </optgroup>
            {taskApprovalAgentId && !agents.some((agent) => agent.id === taskApprovalAgentId) && (
              <option value={`agent:${taskApprovalAgentId}`}>Unavailable reviewer</option>
            )}
          </select>
          <small>Step-specific reviews can still be added as Approval blocks.</small>
        </label>
      )}
      {changeAttachments && onAttachmentsBusy && (
        <section className="tc-root-files">
          <strong>Workflow files</strong>
          <AttachmentEditor
            compact
            value={task.attachments || []}
            onChange={changeAttachments}
            onBusy={onAttachmentsBusy}
          >
            {null}
          </AttachmentEditor>
          <small>Attach here, then scope files to individual Context blocks.</small>
        </section>
      )}
    </>
  );
  return (
    <section className="tc" aria-label="Visual workflow builder">
      <div className="tc-toolbar">
        {!embedded && (
          <nav className="co-task-view-switch" aria-label="Workflow view">
            <button type="button" aria-pressed="false" onClick={back}>
              Overview
            </button>
            <button type="button" aria-pressed="true">
              <GitBranch size={13} />
              Workflow map
            </button>
          </nav>
        )}
        <span className="tc-draft">
          Workflow · {graph.nodes.length} {graph.nodes.length === 1 ? "block" : "blocks"}
        </span>
        <div className="tc-tools">
          <HelpTip label="How workflow connections work" align="end">
            Solid lines pass work to the next step. Dashed lines attach context or capabilities.
            Steps without an incoming line start first.
          </HelpTip>
          <button
            type="button"
            className="co-button"
            aria-pressed={taskSettings && !node && !edge}
            onClick={() => {
              setSelected("");
              setEdgeId("");
              setTaskSettings(true);
            }}
          >
            <ClipboardList size={13} /> Workflow settings
          </button>
          <button type="button" className="co-button" onClick={fit}>
            Fit view
          </button>
          <button
            type="button"
            className="co-icon-button"
            aria-label="Undo canvas change"
            disabled={!past.length}
            onClick={undo}
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            className="co-icon-button"
            aria-label="Redo canvas change"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 size={15} />
          </button>
          <button
            type="button"
            className="co-icon-button"
            aria-label="Zoom out"
            disabled={zoom <= 0.1}
            onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))}
          >
            <Minus size={14} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="co-icon-button"
            aria-label="Zoom in"
            disabled={zoom >= 1.2}
            onClick={() => setZoom((z) => Math.min(1.2, z + 0.1))}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="tc-layout">
        <aside className="tc-palette" aria-label="Workflow blocks">
          {node && stepKinds.includes(node.kind) ? (
            <section className="tc-palette-inputs" aria-label={`Inputs for ${node.title}`}>
              <div className="tc-palette-inputs-heading">
                <span>Inputs</span>
                <em aria-label="Attached inputs">
                  {
                    graph.edges.filter((item) => item.kind === "attachment" && item.to === node.id)
                      .length
                  }
                </em>
              </div>
              <div className="tc-palette-input-actions">
                {(["context", "mcp", "skill", "connector"] as const).map((kind) => {
                  const Icon = icons[kind];
                  return (
                    <button type="button" key={kind} onClick={() => attach(kind, node)}>
                      <Icon size={13} />
                      {blockNames[kind]}
                    </button>
                  );
                })}
                <button type="button" onClick={() => addApprovalAfter(node)}>
                  <ShieldCheck size={13} />
                  Approval next
                </button>
              </div>
              {graph.edges
                .filter((item) => item.kind === "attachment" && item.to === node.id)
                .map((item) => graph.nodes.find((candidate) => candidate.id === item.from)!)
                .map((resource) => {
                  const ResourceIcon = icons[resource.kind];
                  return (
                    <button
                      type="button"
                      className="tc-palette-attached"
                      key={resource.id}
                      onClick={() => {
                        setSelected(resource.id);
                        setEdgeId("");
                      }}
                    >
                      <ResourceIcon size={13} />
                      <span>
                        <strong>{resource.title}</strong>
                        <small>{blockNames[resource.kind]}</small>
                      </span>
                      <ChevronRight size={12} />
                    </button>
                  );
                })}
            </section>
          ) : null}
          {(
            [
              { label: "Steps & team", kinds: ["task", "office", "agent", "prompt"] },
              { label: "Resources", kinds: ["context", "mcp", "skill", "connector"] },
              { label: "Control", kinds: ["approval", "restriction"] },
            ] as { label: string; kinds: BlockKind[] }[]
          ).map(({ label, kinds }) => (
            <details className="tc-block-group" key={label} open={label !== "Resources"}>
              <summary>
                {label}
                <span>{kinds.length}</span>
              </summary>
              {kinds.map((kind) => {
                const Icon = icons[kind];
                return (
                  <button
                    type="button"
                    key={kind}
                    className="tc-palette-block"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/agentos-block", kind);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => add(kind)}
                    aria-label={`Add ${blockNames[kind]} block`}
                  >
                    <Icon size={17} />
                    <span>
                      <strong>{blockNames[kind]}</strong>
                      <small>{descriptions[kind]}</small>
                    </span>
                    <Plus size={12} />
                  </button>
                );
              })}
            </details>
          ))}
        </aside>
        <div className="tc-center">
          <div
            className="tc-canvas"
            ref={viewport}
            aria-label="Workflow canvas"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const kind = e.dataTransfer.getData("application/agentos-block");
              if (Object.hasOwn(descriptions, kind)) {
                const p = point(e.clientX, e.clientY);
                add(kind as BlockKind, p.x, p.y);
              }
            }}
          >
            <div style={{ width: canvasSize.width * zoom, height: canvasSize.height * zoom }}>
              <div
                className="tc-world"
                ref={world}
                style={{
                  width: canvasSize.width,
                  height: canvasSize.height,
                  transform: `scale(${zoom})`,
                }}
              >
                <svg
                  className="tc-wires"
                  width={canvasSize.width}
                  height={canvasSize.height}
                  aria-label="Connections"
                >
                  <defs>
                    <marker
                      id="tc-arrow"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                    </marker>
                  </defs>
                  {graph.edges.map((e) => {
                    const a = shown.find((n) => n.id === e.from)!,
                      b = shown.find((n) => n.id === e.to)!;
                    const x = a.x + 210,
                      y = a.y + 65,
                      dx = Math.max(80, Math.abs(b.x - x) / 2);
                    const d = `M${x},${y} C${x + dx},${y} ${b.x - dx},${b.y + 65} ${b.x},${b.y + 65}`;
                    return (
                      <g
                        key={e.id}
                        className={`${e.kind} ${e.id === edgeId ? "selected" : ""}`}
                        onClick={() => {
                          setEdgeId(e.id);
                          setSelected("");
                        }}
                      >
                        <path className="tc-wire-hit" d={d} />
                        <path className="tc-wire" d={d} markerEnd="url(#tc-arrow)" />
                        <text x={(x + b.x) / 2} y={(y + b.y + 65) / 2 - 9}>
                          {e.kind === "attachment" ? "applies to" : e.condition}
                        </text>
                      </g>
                    );
                  })}
                  {connecting &&
                    wire &&
                    (() => {
                      const a = shown.find((n) => n.id === connecting);
                      return a ? (
                        <path
                          className="tc-wire tc-wire-preview"
                          d={`M${a.x + 210},${a.y + 65} L${wire.x},${wire.y}`}
                        />
                      ) : null;
                    })()}
                </svg>
                {shown.map((n) => {
                  const Icon = icons[n.kind];
                  const inputCount = graph.edges.filter(
                    (edge) => edge.kind === "attachment" && edge.to === n.id,
                  ).length;
                  return (
                    <article
                      key={n.id}
                      className={`tc-node tc-kind-${n.kind} ${selected === n.id ? "selected" : ""}`}
                      style={{ left: n.x, top: n.y }}
                      tabIndex={0}
                      aria-label={`${n.id === workflowRootId ? "Workflow" : blockNames[n.kind]} block: ${n.title}`}
                      onClick={() => {
                        setSelected(n.id);
                        setEdgeId("");
                      }}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const offsets: Record<string, [number, number]> = {
                          ArrowLeft: [-20, 0],
                          ArrowRight: [20, 0],
                          ArrowUp: [0, -20],
                          ArrowDown: [0, 20],
                        };
                        const offset = offsets[e.key];
                        if (offset) {
                          e.preventDefault();
                          update(n.id, {
                            x: clamp(n.x + offset[0], 2190),
                            y: clamp(n.y + offset[1], 1470),
                          });
                        }
                        if (e.key === "Enter") {
                          setSelected(n.id);
                          setEdgeId("");
                        }
                        if (e.key === "Delete" || e.key === "Backspace") {
                          e.preventDefault();
                          commit(removeCanvasNode(graph, n.id));
                          setSelected("");
                          if (n.id === workflowRootId) setTaskSettings(true);
                        }
                      }}
                    >
                      <div
                        className="tc-node-handle"
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.currentTarget.setPointerCapture(e.pointerId);
                          drag.current = {
                            id: n.id,
                            x: n.x,
                            y: n.y,
                            clientX: e.clientX,
                            clientY: e.clientY,
                          };
                          setSelected(n.id);
                          setEdgeId("");
                        }}
                        onPointerMove={(e) => {
                          const d = drag.current;
                          if (d?.id === n.id)
                            setMoving({
                              id: n.id,
                              x: clamp(d.x + (e.clientX - d.clientX) / zoom, 2190),
                              y: clamp(d.y + (e.clientY - d.clientY) / zoom, 1470),
                            });
                        }}
                        onPointerUp={(e) => {
                          const d = drag.current;
                          if (d)
                            update(n.id, {
                              x: clamp(d.x + (e.clientX - d.clientX) / zoom, 2190),
                              y: clamp(d.y + (e.clientY - d.clientY) / zoom, 1470),
                            });
                          drag.current = null;
                          setMoving(null);
                        }}
                        onPointerCancel={() => {
                          drag.current = null;
                          setMoving(null);
                        }}
                      >
                        <Icon size={15} />
                        <span>{n.id === workflowRootId ? "Workflow" : blockNames[n.kind]}</span>
                        {entryIds.has(n.id) && <em className="tc-entry">Start</em>}
                        <GripVertical size={13} />
                      </div>
                      <strong>{n.title || "Untitled block"}</strong>
                      <p>
                        {inputCount ? `${inputCount} attached · ` : ""}
                        {n.kind === "approval"
                          ? n.reviewer === "human"
                            ? "Your approval required"
                            : agents.find((a) => a.id === n.reviewer)?.name || "Choose reviewer"
                          : n.kind === "restriction"
                            ? `${n.readOnly ? "Read only" : "Writes requested"} · ${n.network ? "Network requested" : "No network"}`
                            : n.kind === "context"
                              ? `${contextTypeNames[n.contextType || "notes"]} · ${n.source || n.prompt || (n.attachmentIds || []).length ? "Configured" : "Select a source"}`
                              : n.prompt ||
                                (n.reference
                                  ? n.capabilityStatus
                                    ? `${n.capabilityStatus} · ${n.engine}`
                                    : "Reference selected · unverified"
                                  : "Select to configure")}
                      </p>
                      {!attachmentKinds.includes(n.kind) && (
                        <button
                          type="button"
                          className="tc-port tc-port-in"
                          data-input={n.id}
                          aria-label={`Connect into ${n.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (connecting) connect(connecting, n.id);
                            else {
                              setTo(n.id);
                              setError("Choose an output port or a From block below.");
                            }
                          }}
                        />
                      )}
                      <button
                        type="button"
                        className={`tc-port tc-port-out ${connecting === n.id ? "active" : ""}`}
                        aria-label={`Connect from ${n.title}`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          wireStart.current = { x: e.clientX, y: e.clientY };
                          setConnecting(n.id);
                        }}
                        onPointerMove={(e) => {
                          if (wireStart.current) setWire(point(e.clientX, e.clientY));
                        }}
                        onPointerUp={(e) => {
                          const start = wireStart.current;
                          wireStart.current = null;
                          if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) {
                            const target = document
                              .elementFromPoint(e.clientX, e.clientY)
                              ?.closest<HTMLElement>("[data-input]")?.dataset.input;
                            if (target) connect(n.id, target);
                            else
                              setError("Drop on an input dot, or click one to finish connecting.");
                          }
                          setWire(null);
                        }}
                        onPointerCancel={() => {
                          wireStart.current = null;
                          setWire(null);
                          setConnecting("");
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (e.detail === 0) setConnecting(n.id);
                        }}
                      />
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
          <details className="tc-connect-tools">
            <summary>Connect using selectors</summary>
            <div className="tc-connect">
              <label>
                From
                <select
                  aria-label="Connection from"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                >
                  <option value="">Choose block</option>
                  {graph.nodes.map((n, i) => (
                    <option key={n.id} value={n.id}>
                      {i + 1}. {n.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                To
                <select
                  aria-label="Connection to"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                >
                  <option value="">Choose block</option>
                  {graph.nodes
                    .filter((n) => !attachmentKinds.includes(n.kind))
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {graph.nodes.indexOf(n) + 1}. {n.title}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className="co-button"
                disabled={!from || !to}
                onClick={() => connect(from, to)}
              >
                Connect
              </button>
            </div>
          </details>
          <div className="tc-hint" role="status">
            {error ||
              (connecting
                ? "Choose an input dot to connect."
                : "Drag headers to move. Drag output → input to connect. Arrow keys move a focused block.")}
            {connecting && (
              <button
                type="button"
                onClick={() => {
                  setConnecting("");
                  setWire(null);
                  setError("");
                }}
              >
                Cancel connection
              </button>
            )}
          </div>
        </div>
        <aside
          className="tc-inspector"
          onKeyDownCapture={(event) => {
            if (
              event.target instanceof HTMLInputElement ||
              event.target instanceof HTMLTextAreaElement ||
              event.target instanceof HTMLSelectElement
            )
              event.stopPropagation();
          }}
        >
          <span className="co-section-kicker">{edge ? "CONNECTION" : "BLOCK SETTINGS"}</span>
          {node ? (
            <>
              <h3>{node.id === workflowRootId ? "Workflow" : blockNames[node.kind]}</h3>
              <label>
                {node.id === workflowRootId
                  ? "Workflow name"
                  : node.kind === "task"
                    ? "Task name"
                    : "Block name"}
                <input
                  maxLength={120}
                  value={node.title}
                  onChange={(e) => update(node.id, { title: e.target.value })}
                />
              </label>
              {["office", "agent", "domain"].includes(node.kind) && (
                <label>
                  {node.kind === "office"
                    ? "Assigned office"
                    : node.kind === "agent"
                      ? "Assigned agent"
                      : "Assigned domain"}
                  <select
                    value={node.reference}
                    onChange={(e) =>
                      update(node.id, {
                        reference: e.target.value,
                        title:
                          node.kind === "office"
                            ? company.offices.find((office) => office.id === e.target.value)
                                ?.name || node.title
                            : node.kind === "agent"
                              ? agents.find((a) => a.id === e.target.value)?.name || node.title
                              : e.target.value || node.title,
                      })
                    }
                  >
                    <option value="">Choose {node.kind}</option>
                    {node.reference &&
                      !(node.kind === "office"
                        ? company.offices.some((office) => office.id === node.reference)
                        : node.kind === "agent"
                          ? agents.some((a) => a.id === node.reference)
                          : companyDomains(company).includes(node.reference)) && (
                        <option value={node.reference}>Unavailable: {node.reference}</option>
                      )}
                    {node.kind === "office"
                      ? companyDomains(company).map((domain) => (
                          <optgroup label={domain} key={domain}>
                            {company.offices
                              .filter((office) => office.domain === domain)
                              .map((office) => (
                                <option key={office.id} value={office.id}>
                                  {office.name} · {office.agents.length} agents
                                </option>
                              ))}
                          </optgroup>
                        ))
                      : node.kind === "agent"
                        ? agents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} · {a.engine}
                            </option>
                          ))
                        : companyDomains(company).map((d) => <option key={d}>{d}</option>)}
                  </select>
                </label>
              )}
              {executionSteps.some((s) => s.id.startsWith(`canvas-${node.id}-`)) && (
                <TaskModels
                  compact
                  task={task}
                  steps={executionSteps.filter((s) => s.id.startsWith(`canvas-${node.id}-`))}
                  save={saveModels}
                />
              )}
              {node.kind === "context" && (
                <section className="tc-context-source">
                  <div className="tc-resource-picker-heading">
                    <span>
                      <strong>Context source</strong>
                      <small>Choose what this step should read</small>
                    </span>
                  </div>
                  <div className="tc-context-types">
                    {(Object.keys(contextTypeNames) as ContextType[]).map((type) => {
                      const Icon = contextIcons[type];
                      return (
                        <button
                          type="button"
                          key={type}
                          aria-pressed={contextType === type}
                          onClick={() => update(node.id, { contextType: type })}
                        >
                          <Icon size={13} />
                          {contextTypeNames[type]}
                        </button>
                      );
                    })}
                  </div>
                  {contextSourceFields[contextType] && (
                    <label>
                      {contextSourceFields[contextType]!.label}
                      <input
                        maxLength={1200}
                        value={node.source}
                        placeholder={contextSourceFields[contextType]!.placeholder}
                        onChange={(e) => update(node.id, { source: e.target.value })}
                      />
                    </label>
                  )}
                  <small className="tc-context-hint">{contextHints[contextType]}</small>
                </section>
              )}
              <label>
                {node.kind === "task"
                  ? node.id === workflowRootId
                    ? "Workflow outcome"
                    : "Task outcome"
                  : node.kind === "context"
                    ? contextType === "notes"
                      ? "Notes"
                      : "Notes for this source"
                    : "Custom prompt"}
                <textarea
                  rows={6}
                  maxLength={6000}
                  placeholder={
                    node.kind === "task"
                      ? node.id === workflowRootId
                        ? "Describe the workflow outcome, context, and what done looks like…"
                        : "Describe what this task step should produce…"
                      : node.kind === "context"
                        ? contextType === "notes"
                          ? "Paste the relevant facts, instructions, or source notes…"
                          : "Optional instructions for how this source should be used…"
                        : "What should this block do? Include the expected result…"
                  }
                  value={node.prompt}
                  onChange={(e) => update(node.id, { prompt: e.target.value })}
                />
              </label>
              {node.kind === "context" && (
                <fieldset className="tc-context-files">
                  <legend>
                    <Paperclip size={11} /> Supporting files
                  </legend>
                  {(task.attachments || []).length ? (
                    (task.attachments || []).map((file) => (
                      <label className="tc-check" key={file.id}>
                        <input
                          type="checkbox"
                          checked={(node.attachmentIds || []).includes(file.id)}
                          onChange={() =>
                            update(node.id, {
                              attachmentIds: (node.attachmentIds || []).includes(file.id)
                                ? (node.attachmentIds || []).filter((id) => id !== file.id)
                                : [...(node.attachmentIds || []), file.id],
                            })
                          }
                        />
                        <span>{file.name}</span>
                      </label>
                    ))
                  ) : (
                    <small>No task files yet. Attach a file to make it available here.</small>
                  )}
                  {changeAttachments && onAttachmentsBusy && (
                    <AttachmentEditor
                      compact
                      hideList
                      value={task.attachments || []}
                      onChange={changeAttachments}
                      onBusy={onAttachmentsBusy}
                    >
                      {null}
                    </AttachmentEditor>
                  )}
                  <button
                    type="button"
                    className="tc-resource-create"
                    disabled={!openResourceSettings}
                    onClick={() => openResourceSettings?.("context", engine)}
                  >
                    <Settings2 size={13} />
                    Create reusable context
                    <ArrowRight size={13} />
                  </button>
                  <small>Files are copied locally and remain scoped to this task.</small>
                </fieldset>
              )}
              {node.kind === "approval" && (
                <label>
                  Approval by
                  <select
                    value={node.reviewer}
                    onChange={(e) => update(node.id, { reviewer: e.target.value })}
                  >
                    <option value="human">Me · human review</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                    {node.reviewer !== "human" && !agents.some((a) => a.id === node.reviewer) && (
                      <option value={node.reviewer}>Unavailable reviewer</option>
                    )}
                  </select>
                  <small>Use an Approved connection for work that follows this checkpoint.</small>
                </label>
              )}
              {node.kind === "restriction" && (
                <fieldset>
                  <legend>Requested policy</legend>
                  <label className="tc-check">
                    <input
                      type="checkbox"
                      checked={node.readOnly}
                      onChange={(e) => update(node.id, { readOnly: e.target.checked })}
                    />
                    Read-only actions
                  </label>
                  <label className="tc-check">
                    <input
                      type="checkbox"
                      checked={node.network}
                      onChange={(e) => update(node.id, { network: e.target.checked })}
                    />
                    Allow network access
                  </label>
                  <label>
                    Maximum steps
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={node.maxSteps}
                      onChange={(e) =>
                        update(node.id, { maxSteps: clamp(Number(e.target.value) || 1, 1000) || 1 })
                      }
                    />
                  </label>
                  <small>Policy intent only. No runtime enforcement yet.</small>
                </fieldset>
              )}
              {["mcp", "skill", "connector"].includes(node.kind) && (
                <section className="tc-resource-picker">
                  <div className="tc-resource-picker-heading">
                    <span>
                      <strong>Choose {blockNames[node.kind]}</strong>
                      <small>Available to the selected engine</small>
                    </span>
                    <button
                      type="button"
                      className="co-icon-button"
                      aria-label="Refresh available capabilities"
                      disabled={discovering}
                      onClick={() => void discover()}
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                  <div className="tc-resource-picker-tools">
                    <label>
                      <span>Engine</span>
                      <select
                        value={engine}
                        onChange={(e) => {
                          setEngine(e.target.value as Engine);
                          setInventory(null);
                        }}
                      >
                        {Object.entries(engineNames).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="tc-resource-search">
                      <span>Search</span>
                      <span className="tc-resource-search-field">
                        <Search size={13} />
                        <input
                          aria-label={`Search available ${blockNames[node.kind]}`}
                          value={capabilityQuery}
                          onChange={(event) => setCapabilityQuery(event.target.value)}
                          placeholder="Search available…"
                        />
                      </span>
                    </label>
                  </div>
                  {discovering && <p role="status">Reading available capabilities…</p>}
                  {discoveryError && <p role="alert">{discoveryError}</p>}
                  {inventory && (
                    <div className="tc-resource-options">
                      {inventory.entries
                        .filter(
                          (entry) =>
                            entry.kind === node.kind &&
                            `${entry.name} ${entry.description} ${entry.scope}`
                              .toLowerCase()
                              .includes(capabilityQuery.toLowerCase()),
                        )
                        .map((entry) => (
                          <button
                            type="button"
                            className={node.reference === entry.id ? "selected" : ""}
                            aria-pressed={node.reference === entry.id}
                            disabled={entry.status === "disabled"}
                            key={entry.id}
                            onClick={() =>
                              update(node.id, {
                                reference: entry.id,
                                title: entry.name.slice(0, 120),
                                source: entry.source,
                                engine: inventory.engine,
                                capabilityStatus: entry.status,
                              })
                            }
                          >
                            <span>
                              <strong>{entry.name}</strong>
                              <small>{entry.description || entry.source}</small>
                            </span>
                            <em>{entry.status}</em>
                          </button>
                        ))}
                      {!inventory.entries.some(
                        (entry) =>
                          entry.kind === node.kind &&
                          `${entry.name} ${entry.description} ${entry.scope}`
                            .toLowerCase()
                            .includes(capabilityQuery.toLowerCase()),
                      ) && <small>No matching {blockNames[node.kind].toLowerCase()} found.</small>}
                    </div>
                  )}
                  {node.source && (
                    <div className="tc-resource-selected" title={node.source}>
                      <span>Selected</span>
                      <strong>{node.title}</strong>
                      <em>
                        {node.capabilityStatus} ·{" "}
                        {engineNames[node.engine as Engine] || node.engine}
                      </em>
                    </div>
                  )}
                  <button
                    type="button"
                    className="tc-resource-create"
                    disabled={!openResourceSettings}
                    onClick={() => openResourceSettings?.(node.kind as ResourceSetupKind, engine)}
                  >
                    <Settings2 size={13} />
                    Set up new {blockNames[node.kind]}
                    <ArrowRight size={13} />
                  </button>
                  {!openResourceSettings && (
                    <small>Finish the task name and assignment before opening settings.</small>
                  )}
                  <details className="tc-manual-reference">
                    <summary>Advanced · manual reference</summary>
                    <label>
                      Reference ID
                      <input
                        maxLength={6000}
                        value={node.reference}
                        onChange={(e) =>
                          update(node.id, {
                            reference: e.target.value,
                            source: "",
                            engine: "",
                            capabilityStatus: "",
                          })
                        }
                      />
                    </label>
                    <small>Manual references remain drafts and cannot run until discovered.</small>
                  </details>
                </section>
              )}
              <button type="button" className="co-button tc-delete" onClick={remove}>
                <Trash2 size={13} />
                {node.id === workflowRootId ? "Remove workflow start" : "Remove block"}
              </button>
              {node.id === workflowRootId && (
                <small>
                  Removing this block keeps the workflow name, outcome, project, files, and approval
                  in Workflow settings. Any block without an incoming flow then becomes a start
                  step.
                </small>
              )}
            </>
          ) : edge ? (
            <>
              <h3>{edge.kind === "attachment" ? "Applies to" : "Conditional handoff"}</h3>
              <p>
                {graph.nodes.find((n) => n.id === edge.from)?.title} →{" "}
                {graph.nodes.find((n) => n.id === edge.to)?.title}
              </p>
              {edge.kind === "flow" && (
                <label>
                  Continue when
                  <select
                    value={edge.condition}
                    onChange={(e) =>
                      commit({
                        ...graph,
                        edges: graph.edges.map((item) =>
                          item.id === edge.id
                            ? { ...item, condition: e.target.value as CanvasEdge["condition"] }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="success">Successful</option>
                    <option value="failure">Failed</option>
                    <option value="always">Always</option>
                    <option value="approved">Approved</option>
                  </select>
                </label>
              )}
              <button type="button" className="co-button" onClick={remove}>
                <Trash2 size={13} />
                Remove connection
              </button>
            </>
          ) : taskSettings ? (
            taskSettingsPanel
          ) : (
            <p>Select a block or connection to edit it.</p>
          )}
          <details className="tc-outline">
            <summary>Connections ({graph.edges.length})</summary>
            {graph.edges.map((e) => (
              <button
                type="button"
                key={e.id}
                onClick={() => {
                  setSelected("");
                  setEdgeId(e.id);
                }}
              >
                {graph.nodes.find((n) => n.id === e.from)?.title} →{" "}
                {graph.nodes.find((n) => n.id === e.to)?.title}
                <small>{e.kind === "attachment" ? "applies to" : e.condition}</small>
              </button>
            ))}
          </details>
        </aside>
      </div>
      {(storageError || warnings.length > 0) && (
        <footer className="tc-footer">
          {storageError && <span role="status">Storage unavailable · session only</span>}
          {warnings.length > 0 && (
            <details>
              <summary>
                {warnings.length} {warnings.length === 1 ? "item needs" : "items need"} attention
              </summary>
              {warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
            </details>
          )}
        </footer>
      )}
    </section>
  );
}
