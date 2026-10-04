import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Bot,
  Building2,
  Cable,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  FileText,
  Frame,
  Hand,
  Layers,
  Lock,
  LockOpen,
  MessageSquareText,
  MousePointer2,
  Play,
  Plug,
  Redo2,
  Shapes,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  StickyNote,
  Type,
  Undo2,
  Users,
  Workflow,
} from "lucide-react";
import type { Company, CompanyTask } from "../company/company-model";
import { isCompanyTask } from "../company/company-model";
import {
  blockNames,
  connectCanvas,
  connectionError,
  contextTypeNames,
  attachmentKinds,
  newCanvasNode,
  taskCanvasAssignment,
  taskCanvasFromAssignment,
  type BlockKind,
  type CanvasNode,
  type DecorItem,
  type DecorKind,
  type TaskCanvasGraph,
} from "../tasks/task-canvas-model";
import { schedulePreview } from "../tasks/task-workflow";
import { useLiveRuntime, workflowFolder, isActiveRun } from "../engines/live-runtime";
import { useInstalledTools } from "../engines/installed-tools";
import { canvasRunStatuses } from "../canvas/run-state";
import { WorkflowRunPanel } from "../tasks/WorkflowRunPanel";
import { useResizableWidth } from "../../shared/useResizableWidth";
import {
  alignItems,
  applyBox,
  autoArrange,
  decorBox,
  deleteItems,
  distributeItems,
  duplicateItems,
  edgePath,
  fitView,
  itemBox,
  kindColors,
  marqueeHits,
  moveItems,
  newDecor,
  newStudioNode,
  nodeBox,
  resizeBox,
  unionBox,
  withSectionChildren,
  type Box,
  type Handle,
} from "./studio-model";
import {
  AlignBar,
  DecorDesign,
  EdgeWorkflow,
  NodeDesign,
  NodeWorkflow,
  WorkflowSettings,
  type WorkflowMeta,
} from "./StudioInspector";
import { CopilotPanel } from "./CopilotPanel";
import "./studio.css";

type Tool = "move" | "hand" | DecorKind | "connect";
type View = { x: number; y: number; zoom: number };
type Drag =
  | { kind: "pan"; startX: number; startY: number; view: View }
  | {
      kind: "move";
      startX: number;
      startY: number;
      origin: TaskCanvasGraph;
      ids: string[];
      moved: boolean;
    }
  | { kind: "marquee"; startX: number; startY: number; x: number; y: number; additive: string[] }
  | {
      kind: "resize";
      startX: number;
      startY: number;
      origin: TaskCanvasGraph;
      id: string;
      box: Box;
      handle: Handle;
    }
  | { kind: "create"; type: DecorKind; startX: number; startY: number; x: number; y: number }
  | { kind: "connect"; from: string; x: number; y: number };

const kindIcons: Record<BlockKind, typeof Bot> = {
  task: Workflow,
  agent: Bot,
  office: Building2,
  domain: Users,
  prompt: MessageSquareText,
  approval: ShieldCheck,
  context: FileText,
  mcp: Plug,
  skill: Sparkles,
  connector: Cable,
  restriction: ShieldCheck,
};
const tools: { tool: Tool; label: string; key: string; icon: ReactNode }[] = [
  { tool: "move", label: "Move", key: "V", icon: <MousePointer2 size={16} /> },
  { tool: "hand", label: "Hand", key: "H", icon: <Hand size={16} /> },
  { tool: "section", label: "Section", key: "F", icon: <Frame size={16} /> },
  { tool: "rect", label: "Rectangle", key: "R", icon: <Square size={16} /> },
  { tool: "ellipse", label: "Ellipse", key: "O", icon: <Circle size={16} /> },
  { tool: "text", label: "Text", key: "T", icon: <Type size={16} /> },
  { tool: "sticky", label: "Sticky note", key: "S", icon: <StickyNote size={16} /> },
  { tool: "connect", label: "Connect", key: "C", icon: <Cable size={16} /> },
];
const BLOCK_GROUPS = "agentos:studio-block-groups";
const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export type StudioInit = { projectId?: string; officeId?: string; agentId?: string };

/**
 * A Figma-style editor for one workflow. Blocks and connections are the executable workflow;
 * sections, shapes, text, and stickies are annotations that never run.
 */
export function WorkflowStudio({
  company,
  task,
  init = {},
  save,
  run,
  close,
}: {
  company: Company;
  task?: CompanyTask | undefined;
  init?: StudioInit;
  save: (task: CompanyTask) => void;
  run: (task: CompanyTask, fromStepId?: string) => Promise<void>;
  close: () => void;
}) {
  const [taskId] = useState(() => task?.id || crypto.randomUUID());
  const [createdAt] = useState(() => task?.createdAt || new Date().toISOString());
  const [graph, setGraph] = useState<TaskCanvasGraph>(() => {
    if (task) return { decor: [], ...taskCanvasFromAssignment(company, task) };
    const root = { ...newCanvasNode("task", 120, 200, "task-root"), title: "Untitled workflow" };
    const agent = company.offices
      .flatMap((office) => office.agents)
      .find((candidate) => candidate.id === init.agentId);
    if (!agent) return { version: 1, nodes: [root], edges: [], decor: [] };
    const step = { ...newCanvasNode("agent", 440, 200), title: agent.name, reference: agent.id };
    return connectCanvas(
      { version: 1, nodes: [root, step], edges: [], decor: [] },
      root.id,
      step.id,
    );
  });
  const [meta, setMeta] = useState<WorkflowMeta>(() => ({
    projectId: task?.projectId || init.projectId || "",
    directory: task?.directory || "",
    approval: task?.approval || { kind: "none" },
    schedule: task?.schedule || { kind: "manual" },
    modelDefaults: task?.modelDefaults || {},
  }));
  const [past, setPast] = useState<TaskCanvasGraph[]>([]);
  const [future, setFuture] = useState<TaskCanvasGraph[]>([]);
  const [view, setView] = useState<View>({ x: 80, y: 80, zoom: 1 });
  const [tool, setTool] = useState<Tool>("move");
  const [selection, setSelection] = useState<string[]>([]);
  const [edgeId, setEdgeId] = useState("");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [connectFrom, setConnectFrom] = useState("");
  const [editingText, setEditingText] = useState("");
  const [leftTab, setLeftTab] = useState<"layers" | "blocks">("layers");
  const [blockQuery, setBlockQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(BLOCK_GROUPS) || "null");
      if (Array.isArray(saved)) return saved.filter((id): id is string => typeof id === "string");
    } catch {
      /* Fall back to the defaults. */
    }
    return ["basics", "agents", "annotate"];
  });
  const [rightTab, setRightTab] = useState<"copilot" | "design" | "workflow" | "run">(() =>
    task && task.canvas && task.canvas.nodes.length > 1 ? "workflow" : "copilot",
  );
  // Selecting on the canvas follows the selection, but never pulls you out of the copilot chat.
  const followTab = (tab: "design" | "workflow") =>
    setRightTab((current) => (current === "copilot" ? current : tab));
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(!task);
  const [spaceDown, setSpaceDown] = useState(false);
  const [viewRunId, setViewRunId] = useState("");
  const [busy, setBusy] = useState(false);
  const clipboard = useRef<{ graph: TaskCanvasGraph; ids: string[] } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const right = useResizableWidth("agentos:studio-right", 320, 260, 560);
  const live = useLiveRuntime();
  const codexTools = useInstalledTools("codex");
  const claudeTools = useInstalledTools("claude");

  const runs = live.runs
    .filter((r) => r.request.key === `task:${taskId}`)
    .sort((a, b) => b.createdAt - a.createdAt);
  const viewedRun = runs.find((r) => r.request.id === viewRunId) || runs[0];
  const statuses = useMemo(() => canvasRunStatuses(graph, viewedRun), [graph, viewedRun]);
  const decor = graph.decor || [];
  const root = graph.nodes.find((node) => node.kind === "task");
  const selectedNodes = graph.nodes.filter((node) => selection.includes(node.id));
  const selectedDecor = decor.filter((item) => selection.includes(item.id));
  const edge = graph.edges.find((candidate) => candidate.id === edgeId);
  const selectionBox = unionBox(
    selection.map((id) => itemBox(graph, id)).filter((box): box is Box => !!box),
  );

  // ── Persistence ────────────────────────────────────────────────────────
  function buildTask(): CompanyTask {
    const assignment = taskCanvasAssignment(company, graph);
    const { projectId: _p, directory: _d, ...base } = task || ({} as Partial<CompanyTask>);
    return {
      ...base,
      id: taskId,
      title: root?.title.trim() || "Untitled workflow",
      brief: root?.prompt.trim() || "",
      assignment:
        assignment.targets.length || !task?.assignment.targets.length
          ? assignment
          : task.assignment,
      status: "planned",
      createdAt,
      attachments: task?.attachments || [],
      modelDefaults: meta.modelDefaults,
      stepModels: task?.stepModels || {},
      ...(meta.projectId ? { projectId: meta.projectId } : {}),
      ...(meta.directory ? { directory: meta.directory } : {}),
      ...(task?.officeId || init.officeId ? { officeId: (task?.officeId || init.officeId)! } : {}),
      schedule: meta.schedule,
      handoffs: [],
      approval: meta.approval,
      canvas: graph,
    };
  }
  function persist(): CompanyTask | null {
    const next = buildTask();
    const scheduleError = schedulePreview(meta.schedule).error;
    if (scheduleError) {
      setNotice(scheduleError);
      return null;
    }
    if (!isCompanyTask(next)) {
      setNotice("This workflow can't be saved yet. Check its blocks and settings.");
      return null;
    }
    save(next);
    setDirty(false);
    return next;
  }
  // Existing workflows save as you go, like a Figma file.
  useEffect(() => {
    if (!dirty || !task) return;
    const timer = window.setTimeout(() => persist(), 700);
    return () => window.clearTimeout(timer);
  }, [graph, meta, dirty]);
  async function runWorkflow(fromStepId?: string) {
    const saved = persist();
    if (!saved) return;
    setBusy(true);
    try {
      await run(saved, fromStepId);
      setViewRunId("");
      setRightTab("run");
      setNotice(fromStepId ? "Running from that step." : "Running. Blocks light up as they work.");
    } catch (error) {
      setNotice(String(error).replace(/^Error: /, ""));
    } finally {
      setBusy(false);
    }
  }

  // ── History ────────────────────────────────────────────────────────────
  function commit(next: TaskCanvasGraph, before: TaskCanvasGraph = graph) {
    if (next === before) return;
    setPast((p) => [...p, before].slice(-100));
    setFuture([]);
    setGraph(next);
    setDirty(true);
  }
  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setFuture((f) => [graph, ...f]);
    setPast((p) => p.slice(0, -1));
    setGraph(previous);
    setDirty(true);
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    setPast((p) => [...p, graph]);
    setFuture((f) => f.slice(1));
    setGraph(next);
    setDirty(true);
  }
  function changeMeta(patch: Partial<WorkflowMeta>) {
    setMeta((m) => ({ ...m, ...patch }));
    setDirty(true);
  }
  function updateNode(id: string, patch: Partial<CanvasNode>) {
    commit({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  }
  function updateDecor(id: string, patch: Partial<DecorItem>) {
    commit({ ...graph, decor: decor.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  }

  // ── Coordinates & view ────────────────────────────────────────────────
  function toWorld(clientX: number, clientY: number) {
    const rect = viewport.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.zoom,
      y: (clientY - rect.top - view.y) / view.zoom,
    };
  }
  function zoomAt(nextZoom: number, clientX?: number, clientY?: number) {
    const rect = viewport.current?.getBoundingClientRect();
    if (!rect) return;
    const zoom = Math.max(0.1, Math.min(4, nextZoom));
    const cx = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const cy = (clientY ?? rect.top + rect.height / 2) - rect.top;
    setView((v) => ({
      zoom,
      x: cx - ((cx - v.x) / v.zoom) * zoom,
      y: cy - ((cy - v.y) / v.zoom) * zoom,
    }));
  }
  function fitAll(
    box = unionBox([...graph.nodes.map(nodeBox), ...decor.filter((d) => !d.hidden).map(decorBox)]),
  ) {
    const rect = viewport.current?.getBoundingClientRect();
    if (!rect) return;
    setView(fitView(box, rect.width, rect.height));
  }
  useEffect(() => {
    if (fitted.current || !viewport.current) return;
    fitted.current = true;
    fitAll();
  }, []);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        setView((v) => {
          const rect = element.getBoundingClientRect();
          const zoom = Math.max(0.1, Math.min(4, v.zoom * Math.exp(-event.deltaY * 0.01)));
          const cx = event.clientX - rect.left;
          const cy = event.clientY - rect.top;
          return {
            zoom,
            x: cx - ((cx - v.x) / v.zoom) * zoom,
            y: cy - ((cy - v.y) / v.zoom) * zoom,
          };
        });
      } else setView((v) => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  function centre() {
    const rect = viewport.current?.getBoundingClientRect();
    if (!rect) return { x: 200, y: 200 };
    return toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // ── Inserting ──────────────────────────────────────────────────────────
  function insertNode(kind: BlockKind, patch: Partial<CanvasNode> = {}) {
    if (graph.nodes.length >= 80) return setNotice("A workflow supports up to 80 blocks.");
    const anchor = selectedNodes.length === 1 ? selectedNodes[0]! : undefined;
    const resource = attachmentKinds.includes(kind);
    const at = anchor
      ? resource
        ? { x: anchor.x - 40, y: anchor.y + nodeBox(anchor).h + 60 }
        : { x: anchor.x + nodeBox(anchor).w + 96, y: anchor.y }
      : centre();
    const node = { ...newStudioNode(kind, at.x, at.y), ...patch };
    let next: TaskCanvasGraph = { ...graph, nodes: [...graph.nodes, node] };
    // Inserting next to a selected step connects it, so building a flow is click, click, click.
    if (anchor) {
      try {
        next = resource
          ? connectCanvas(next, node.id, anchor.id)
          : connectCanvas(next, anchor.id, node.id);
      } catch {
        /* Leave it unconnected when the rules don't allow it. */
      }
    }
    commit(next);
    setSelection([node.id]);
    setEdgeId("");
    followTab("workflow");
  }
  function insertDecor(item: DecorItem) {
    commit({ ...graph, decor: [...decor, item] });
    setSelection([item.id]);
    setEdgeId("");
    followTab("design");
  }

  // ── Pointer interaction ───────────────────────────────────────────────
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button === 2) return;
    const target = event.target as HTMLElement;
    const world = toWorld(event.clientX, event.clientY);
    if (event.button === 1 || tool === "hand" || spaceDown) {
      setDrag({ kind: "pan", startX: event.clientX, startY: event.clientY, view });

      return;
    }
    const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle as
      | Handle
      | undefined;
    if (handle && selection.length === 1) {
      const box = itemBox(graph, selection[0]!);
      if (box) {
        setDrag({
          kind: "resize",
          startX: world.x,
          startY: world.y,
          origin: graph,
          id: selection[0]!,
          box,
          handle,
        });
      }
      return;
    }
    const port = target.closest<HTMLElement>("[data-port]")?.dataset.port;
    if (port) {
      setDrag({ kind: "connect", from: port, x: world.x, y: world.y });

      return;
    }
    const edgeHit = target.closest<SVGElement>("[data-edge]")?.dataset.edge;
    if (edgeHit) {
      setEdgeId(edgeHit);
      setSelection([]);
      followTab("workflow");
      return;
    }
    const itemId = target.closest<HTMLElement>("[data-item]")?.dataset.item;
    if (tool === "connect" && itemId && graph.nodes.some((n) => n.id === itemId)) {
      if (!connectFrom) setConnectFrom(itemId);
      else {
        tryConnect(connectFrom, itemId);
        setConnectFrom("");
      }
      return;
    }
    if (["section", "rect", "ellipse", "text", "sticky"].includes(tool)) {
      setDrag({
        kind: "create",
        type: tool as DecorKind,
        startX: world.x,
        startY: world.y,
        x: world.x,
        y: world.y,
      });

      return;
    }
    setEdgeId("");
    if (itemId) {
      const next = event.shiftKey
        ? selection.includes(itemId)
          ? selection.filter((id) => id !== itemId)
          : [...selection, itemId]
        : selection.includes(itemId)
          ? selection
          : [itemId];
      setSelection(next);
      if (graph.nodes.some((n) => n.id === itemId) && rightTab === "design" && next.length === 1)
        followTab("workflow");
      if (event.shiftKey) return;
      setDrag({
        kind: "move",
        startX: world.x,
        startY: world.y,
        origin: graph,
        ids: withSectionChildren(graph, next),
        moved: false,
      });

      return;
    }
    setDrag({
      kind: "marquee",
      startX: world.x,
      startY: world.y,
      x: world.x,
      y: world.y,
      additive: event.shiftKey ? selection : [],
    });
    if (!event.shiftKey) setSelection([]);
    setEditingText("");
  }
  type PointerPoint = { clientX: number; clientY: number; altKey: boolean };
  function onPointerMove(event: PointerPoint) {
    if (!drag) return;
    const world = toWorld(event.clientX, event.clientY);
    if (drag.kind === "pan")
      setView({
        ...drag.view,
        x: drag.view.x + event.clientX - drag.startX,
        y: drag.view.y + event.clientY - drag.startY,
      });
    else if (drag.kind === "move") {
      const dx = world.x - drag.startX;
      const dy = world.y - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) * view.zoom < 3) return;
      setGraph(moveItems(drag.origin, drag.origin, drag.ids, dx, dy, !event.altKey));
      if (!drag.moved) setDrag({ ...drag, moved: true });
    } else if (drag.kind === "resize")
      setGraph(
        applyBox(
          drag.origin,
          drag.id,
          resizeBox(drag.box, drag.handle, world.x - drag.startX, world.y - drag.startY),
        ),
      );
    else if (drag.kind === "marquee" || drag.kind === "create" || drag.kind === "connect")
      setDrag({ ...drag, x: world.x, y: world.y });
  }
  function onPointerUp(event: PointerPoint) {
    if (!drag) return;
    if (drag.kind === "move" && drag.moved) commit(graph, drag.origin);
    else if (drag.kind === "resize") commit(graph, drag.origin);
    else if (drag.kind === "marquee") {
      const area = {
        x: Math.min(drag.startX, drag.x),
        y: Math.min(drag.startY, drag.y),
        w: Math.abs(drag.x - drag.startX),
        h: Math.abs(drag.y - drag.startY),
      };
      if (area.w > 2 || area.h > 2)
        setSelection([...new Set([...drag.additive, ...marqueeHits(graph, area)])]);
    } else if (drag.kind === "create") {
      const w = Math.abs(drag.x - drag.startX);
      const h = Math.abs(drag.y - drag.startY);
      const sized = w > 8 && h > 8;
      insertDecor(
        newDecor(
          drag.type,
          sized ? Math.min(drag.startX, drag.x) : drag.startX,
          sized ? Math.min(drag.startY, drag.y) : drag.startY,
          sized ? { w, h } : undefined,
        ),
      );
      setTool("move");
    } else if (drag.kind === "connect") {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-item]")?.dataset.item;
      if (target && target !== drag.from) tryConnect(drag.from, target);
    }
    setDrag(null);
  }
  // While dragging, follow the pointer anywhere in the window so a release outside the canvas
  // (or a lost pointer capture) still finishes the gesture.
  const pointer = useRef({ move: onPointerMove, up: onPointerUp });
  pointer.current = { move: onPointerMove, up: onPointerUp };
  const dragging = !!drag;
  useLayoutEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => pointer.current.move(event);
    const up = (event: PointerEvent) => pointer.current.up(event);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging]);
  function tryConnect(from: string, to: string) {
    const error = connectionError(graph, from, to);
    if (error) return setNotice(error);
    commit(connectCanvas(graph, from, to));
  }

  // ── Keyboard ───────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target) || editingText) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (event.code === "Space") {
        setSpaceDown(true);
        event.preventDefault();
        return;
      }
      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && key === "s") {
        event.preventDefault();
        if (persist()) setNotice("Saved.");
      } else if (mod && key === "a") {
        event.preventDefault();
        setSelection([
          ...graph.nodes.map((n) => n.id),
          ...decor.filter((d) => !d.hidden && !d.locked).map((d) => d.id),
        ]);
      } else if (mod && key === "d") {
        event.preventDefault();
        duplicate(selection);
      } else if (mod && key === "c") {
        clipboard.current = { graph, ids: withSectionChildren(graph, selection) };
      } else if (mod && key === "v" && clipboard.current) {
        event.preventDefault();
        duplicate(clipboard.current.ids, clipboard.current.graph);
      } else if (mod && key === "enter") {
        event.preventDefault();
        void runWorkflow();
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        if (edgeId) {
          commit(deleteItems(graph, [edgeId]));
          setEdgeId("");
        } else if (selection.length) {
          commit(
            deleteItems(
              graph,
              withSectionChildren(graph, selection).filter((id) => selection.includes(id)),
            ),
          );
          setSelection([]);
        }
      } else if (key === "escape") {
        setSelection([]);
        setEdgeId("");
        setConnectFrom("");
        setTool("move");
      } else if (key.startsWith("arrow") && selection.length) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        commit(moveItems(graph, graph, withSectionChildren(graph, selection), dx, dy, false));
      } else if (event.shiftKey && !mod && key === "a") {
        event.preventDefault();
        arrange();
      } else if (event.shiftKey && event.code === "Digit1") fitAll();
      else if (event.shiftKey && event.code === "Digit2" && selectionBox) fitAll(selectionBox);
      else if (event.shiftKey && event.code === "Digit0") setView((v) => ({ ...v, zoom: 1 }));
      else if (!mod && (key === "=" || key === "+")) zoomAt(view.zoom * 1.2);
      else if (!mod && key === "-") zoomAt(view.zoom / 1.2);
      else if (!mod && !event.shiftKey) {
        const match = tools.find((t) => t.key.toLowerCase() === key);
        if (match) setTool(match.tool);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });
  function arrange() {
    const ids = selection.filter((id) => graph.nodes.some((n) => n.id === id));
    const next = autoArrange(graph, ids.length > 1 ? ids : []);
    commit(next);
    const box = unionBox(
      next.nodes.filter((n) => ids.length < 2 || ids.includes(n.id)).map(nodeBox),
    );
    window.requestAnimationFrame(() => fitAll(box));
    setNotice("Arranged by flow. ⌘Z to undo.");
  }
  function duplicate(ids: string[], source = graph) {
    if (!ids.length) return;
    try {
      const result = duplicateItems(graph, source, ids);
      commit(result.graph);
      setSelection(result.ids);
    } catch (error) {
      setNotice(String(error).replace(/^Error: /, ""));
    }
  }
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // ── Blocks panel ───────────────────────────────────────────────────────
  type BlockItem = {
    key: string;
    label: string;
    detail: string;
    icon: ReactNode;
    insert: () => void;
  };
  const toolItems = (kind: "mcp" | "skill" | "connector"): BlockItem[] =>
    [
      ...codexTools.map((t) => ({ ...t, engine: "codex" })),
      ...claudeTools.map((t) => ({ ...t, engine: "claude" })),
    ]
      .filter((tool) => tool.kind === kind)
      .map((tool) => {
        const Icon = kindIcons[kind];
        return {
          key: `${tool.engine}:${tool.id}`,
          label: tool.name,
          detail: tool.engine === "claude" ? "Claude Code" : "Codex",
          icon: <Icon size={14} style={{ color: kindColors[kind] }} />,
          insert: () =>
            insertNode(kind, {
              title: tool.name.slice(0, 120),
              reference: tool.id,
              source: tool.source,
              engine: tool.engine,
              capabilityStatus: tool.status,
            }),
        };
      });
  const blockGroups: { id: string; label: string; empty: string; items: BlockItem[] }[] = [
    {
      id: "basics",
      label: "Basics",
      empty: "",
      items: [
        {
          key: "prompt",
          label: "Custom step",
          detail: "Runs directly on Codex or Claude",
          icon: <MessageSquareText size={14} style={{ color: kindColors.prompt }} />,
          insert: () => insertNode("prompt", { title: "Custom step" }),
        },
        {
          key: "approval",
          label: "Approval",
          detail: "Pause for you or a reviewer",
          icon: <ShieldCheck size={14} style={{ color: kindColors.approval }} />,
          insert: () => insertNode("approval", { title: "Approval" }),
        },
        {
          key: "context",
          label: "Context",
          detail: "Notes, files, links",
          icon: <FileText size={14} style={{ color: kindColors.context }} />,
          insert: () => insertNode("context", { title: "Context" }),
        },
      ],
    },
    {
      id: "agents",
      label: "Agents",
      empty: "No agents yet. Add one from the company map.",
      items: company.offices.flatMap((office) =>
        office.agents.map((agent) => ({
          key: agent.id,
          label: agent.name,
          detail: office.name,
          icon: <Bot size={14} style={{ color: kindColors.agent }} />,
          insert: () => insertNode("agent", { title: agent.name, reference: agent.id }),
        })),
      ),
    },
    {
      id: "offices",
      label: "Offices",
      empty: "No offices yet.",
      items: company.offices.map((office) => ({
        key: office.id,
        label: office.name,
        detail: `Whole office · ${office.agents.length} agents`,
        icon: <Building2 size={14} style={{ color: kindColors.office }} />,
        insert: () => insertNode("office", { title: office.name, reference: office.id }),
      })),
    },
    {
      id: "mcp",
      label: "MCP servers",
      empty: "None installed. Add one from Settings → Add capabilities.",
      items: toolItems("mcp"),
    },
    {
      id: "skill",
      label: "Skills",
      empty: "No skills installed.",
      items: toolItems("skill"),
    },
    {
      id: "connector",
      label: "Connectors",
      empty: "No connectors found.",
      items: toolItems("connector"),
    },
    {
      id: "annotate",
      label: "Annotate",
      empty: "",
      items: (["section", "rect", "ellipse", "text", "sticky"] as DecorKind[]).map((type) => {
        const meta = tools.find((t) => t.tool === type)!;
        return {
          key: type,
          label: meta.label,
          detail: "",
          icon: meta.icon,
          insert: () => {
            const c = centre();
            insertDecor(newDecor(type, c.x, c.y));
          },
        };
      }),
    },
  ];

  // ── Rendering helpers ─────────────────────────────────────────────────
  const agents = company.offices.flatMap((office) =>
    office.agents.map((agent) => ({ ...agent, office })),
  );
  function subtitle(node: CanvasNode): string {
    if (node.kind === "agent") {
      const agent = agents.find((a) => a.id === node.reference);
      return agent ? `${agent.role} · ${agent.engine}` : "Choose an agent";
    }
    if (node.kind === "office")
      return company.offices.find((o) => o.id === node.reference)?.agents.length
        ? `${company.offices.find((o) => o.id === node.reference)!.agents.length} agents`
        : "Choose an office";
    if (["mcp", "skill", "connector"].includes(node.kind))
      return node.reference
        ? `${node.engine === "claude" ? "Claude Code" : "Codex"} · installed`
        : "Choose an installed tool";
    if (node.kind === "context")
      return `${contextTypeNames[node.contextType || "notes"]}${node.source ? ` · ${node.source}` : ""}`;
    if (node.kind === "approval")
      return node.reviewer === "human"
        ? "You approve"
        : `${agents.find((a) => a.id === node.reviewer)?.name || "Agent"} reviews`;
    return (
      node.prompt.trim() || (node.kind === "task" ? "Describe the outcome" : "Add instructions")
    );
  }
  const canConnectFrom = (node: CanvasNode) => node.kind !== "restriction";
  const canConnectTo = (node: CanvasNode) =>
    !attachmentKinds.includes(node.kind) && node.kind !== "task";

  const layers = [
    ...decor.filter((d) => d.type === "section"),
    ...graph.nodes,
    ...decor.filter((d) => d.type !== "section"),
  ];
  const marquee =
    drag?.kind === "marquee"
      ? {
          x: Math.min(drag.startX, drag.x),
          y: Math.min(drag.startY, drag.y),
          w: Math.abs(drag.x - drag.startX),
          h: Math.abs(drag.y - drag.startY),
        }
      : drag?.kind === "create"
        ? {
            x: Math.min(drag.startX, drag.x),
            y: Math.min(drag.startY, drag.y),
            w: Math.abs(drag.x - drag.startX),
            h: Math.abs(drag.y - drag.startY),
          }
        : null;
  const connectSource =
    drag?.kind === "connect" ? graph.nodes.find((n) => n.id === drag.from) : undefined;
  const activeRun = runs.find(isActiveRun);
  const folderLabel = workflowFolder(company, { ...buildTask() });
  const cursor =
    tool === "hand" || spaceDown
      ? drag?.kind === "pan"
        ? "grabbing"
        : "grab"
      : ["section", "rect", "ellipse", "text", "sticky"].includes(tool)
        ? "crosshair"
        : "default";

  function renderDecor(item: DecorItem) {
    if (item.hidden) return null;
    const selected = selection.includes(item.id);
    const style = {
      left: item.x,
      top: item.y,
      width: item.w,
      height: item.h,
      background: item.type === "text" ? "transparent" : item.fill,
      borderColor: item.stroke,
      borderRadius: item.type === "ellipse" ? "50%" : item.radius,
      fontSize: item.fontSize,
      // A text layer's fill is its text colour.
      color: item.type === "text" ? item.fill : undefined,
    };
    return (
      <div
        key={item.id}
        className={`st-decor st-decor-${item.type}`}
        data-item={item.locked ? undefined : item.id}
        data-selected={selected || undefined}
        style={style}
        onDoubleClick={() => item.type !== "section" && !item.locked && setEditingText(item.id)}
      >
        {item.type === "section" && <span className="st-section-label">{item.name}</span>}
        {editingText === item.id ? (
          <textarea
            autoFocus
            className="st-inline-text"
            style={{ fontSize: item.fontSize }}
            value={item.text}
            onChange={(event) =>
              setGraph((g) => ({
                ...g,
                decor: (g.decor || []).map((d) =>
                  d.id === item.id ? { ...d, text: event.target.value } : d,
                ),
              }))
            }
            onBlur={() => {
              setEditingText("");
              setDirty(true);
              setPast((p) => [...p, graph]);
            }}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : (
          item.type !== "section" && item.text && <span className="st-decor-text">{item.text}</span>
        )}
      </div>
    );
  }

  return (
    <div className="st-studio" style={{ "--st-right": `${right.width}px` } as CSSProperties}>
      <header className="st-topbar">
        <div className="st-top-left">
          <button
            type="button"
            className="st-icon"
            aria-label="Back to company map"
            title="Back"
            onClick={() => {
              if (dirty && task) persist();
              close();
            }}
          >
            <ChevronLeft size={17} />
          </button>
          <span className="st-file">
            <small>
              {company.offices.find((o) => o.id === (task?.officeId || init.officeId))?.name ||
                company.name}
            </small>
            <span>/</span>
            <input
              aria-label="Workflow name"
              value={root?.title || ""}
              placeholder="Untitled workflow"
              maxLength={120}
              onChange={(event) => root && updateNode(root.id, { title: event.target.value })}
            />
            {dirty && <i className="st-dirty" title="Unsaved changes" />}
          </span>
        </div>
        <div className="st-tools" role="toolbar" aria-label="Tools">
          {tools.map((t) => (
            <button
              key={t.tool}
              type="button"
              aria-label={`${t.label} (${t.key})`}
              title={`${t.label} · ${t.key}`}
              aria-pressed={tool === t.tool}
              onClick={() => {
                setTool(t.tool);
                setConnectFrom("");
              }}
            >
              {t.icon}
            </button>
          ))}
          <button
            type="button"
            aria-label="Auto-arrange (Shift A)"
            title="Auto-arrange · ⇧A"
            onClick={arrange}
          >
            <Workflow size={16} />
          </button>
          <span className="st-tools-gap" />
          <button
            type="button"
            aria-label="Undo"
            title="Undo · ⌘Z"
            disabled={!past.length}
            onClick={undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo · ⇧⌘Z"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 size={16} />
          </button>
        </div>
        <div className="st-top-right">
          <select
            className="st-zoom"
            aria-label="Zoom"
            value=""
            onChange={(event) => {
              const value = event.target.value;
              if (value === "fit") fitAll();
              else if (value === "selection" && selectionBox) fitAll(selectionBox);
              else if (value) zoomAt(Number(value));
            }}
          >
            <option value="">{Math.round(view.zoom * 100)}%</option>
            <option value="fit">Zoom to fit · ⇧1</option>
            <option value="selection" disabled={!selectionBox}>
              Zoom to selection · ⇧2
            </option>
            <option value="0.5">50%</option>
            <option value="1">100% · ⇧0</option>
            <option value="2">200%</option>
          </select>
          <button
            type="button"
            className="st-button"
            onClick={() => persist() && setNotice("Saved.")}
          >
            {task ? (dirty ? "Save" : "Saved") : "Create"}
          </button>
          <button
            type="button"
            className="st-button st-primary"
            disabled={busy || !!activeRun}
            onClick={() => void runWorkflow()}
            title="Run · ⌘Enter"
          >
            <Play size={13} fill="currentColor" /> {activeRun ? "Running…" : "Run"}
          </button>
        </div>
      </header>

      <aside className="st-left">
        <nav className="st-tabs">
          <button
            type="button"
            aria-pressed={leftTab === "layers"}
            onClick={() => setLeftTab("layers")}
          >
            <Layers size={13} /> Layers
          </button>
          <button
            type="button"
            aria-pressed={leftTab === "blocks"}
            onClick={() => setLeftTab("blocks")}
          >
            <Shapes size={13} /> Blocks
          </button>
        </nav>
        {leftTab === "layers" ? (
          <ul className="st-layers">
            {layers.map((layer) => {
              const isNode = "kind" in layer;
              const Icon = isNode
                ? kindIcons[(layer as CanvasNode).kind]
                : (layer as DecorItem).type === "section"
                  ? Frame
                  : (layer as DecorItem).type === "text"
                    ? Type
                    : (layer as DecorItem).type === "sticky"
                      ? StickyNote
                      : (layer as DecorItem).type === "ellipse"
                        ? Circle
                        : Square;
              const name = isNode
                ? (layer as CanvasNode).title || blockNames[(layer as CanvasNode).kind]
                : (layer as DecorItem).name;
              const item = !isNode ? (layer as DecorItem) : undefined;
              return (
                <li key={layer.id} aria-selected={selection.includes(layer.id)}>
                  <button
                    type="button"
                    className="st-layer"
                    onClick={(event) => {
                      setEdgeId("");
                      setSelection(
                        event.shiftKey ? [...new Set([...selection, layer.id])] : [layer.id],
                      );
                    }}
                    onDoubleClick={() => {
                      const box = itemBox(graph, layer.id);
                      if (box) fitAll(box);
                    }}
                  >
                    <Icon
                      size={13}
                      style={
                        isNode
                          ? {
                              color:
                                (layer as CanvasNode).style?.fill ||
                                kindColors[(layer as CanvasNode).kind],
                            }
                          : undefined
                      }
                    />
                    <span>{name}</span>
                    {statuses[layer.id] && <em data-status={statuses[layer.id]} />}
                  </button>
                  {item && (
                    <span className="st-layer-actions">
                      <button
                        type="button"
                        aria-label={item.locked ? "Unlock" : "Lock"}
                        onClick={() => updateDecor(item.id, { locked: !item.locked })}
                      >
                        {item.locked ? <Lock size={12} /> : <LockOpen size={12} />}
                      </button>
                      <button
                        type="button"
                        aria-label={item.hidden ? "Show" : "Hide"}
                        onClick={() => updateDecor(item.id, { hidden: !item.hidden })}
                      >
                        {item.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="st-blocks">
            <div className="st-block-search">
              <Search size={13} />
              <input
                aria-label="Search blocks"
                placeholder="Search blocks…"
                value={blockQuery}
                onChange={(event) => setBlockQuery(event.target.value)}
              />
            </div>
            {blockGroups.map((group) => {
              const items = group.items.filter((item) =>
                `${item.label} ${item.detail}`
                  .toLowerCase()
                  .includes(blockQuery.trim().toLowerCase()),
              );
              if (blockQuery.trim() && !items.length) return null;
              return (
                <details
                  key={group.id}
                  className="st-block-group"
                  open={blockQuery.trim() ? true : openGroups.includes(group.id)}
                  onToggle={(event) => {
                    if (blockQuery.trim()) return;
                    const open = event.currentTarget.open;
                    setOpenGroups((current) => {
                      const next = open
                        ? [...new Set([...current, group.id])]
                        : current.filter((id) => id !== group.id);
                      try {
                        localStorage.setItem(BLOCK_GROUPS, JSON.stringify(next));
                      } catch {
                        /* Session only. */
                      }
                      return next;
                    });
                  }}
                >
                  <summary>
                    <ChevronRight size={12} className="st-group-caret" />
                    <span>{group.label}</span>
                    <em>{items.length}</em>
                  </summary>
                  {group.id === "annotate" ? (
                    <div className="st-annotate">
                      {items.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          title={item.label}
                          onClick={item.insert}
                        >
                          {item.icon}
                          <small>{item.label}</small>
                        </button>
                      ))}
                    </div>
                  ) : items.length ? (
                    items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="st-block"
                        onClick={item.insert}
                      >
                        {item.icon}
                        <span>
                          {item.label}
                          <small>{item.detail}</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="st-hint st-group-empty">{group.empty}</p>
                  )}
                </details>
              );
            })}
            <p className="st-hint">
              Select a step first: new steps connect after it, and resources attach to it.
            </p>
          </div>
        )}
      </aside>

      <main
        ref={viewport}
        className="st-canvas"
        style={{
          cursor,
          backgroundPosition: `${view.x}px ${view.y}px`,
          backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px`,
        }}
        onPointerDown={onPointerDown}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div
          className="st-world"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          {decor.filter((d) => d.type === "section").map(renderDecor)}
          <svg className="st-edges" aria-hidden="false">
            {graph.edges.map((e) => {
              const from = graph.nodes.find((n) => n.id === e.from);
              const to = graph.nodes.find((n) => n.id === e.to);
              if (!from || !to) return null;
              const attachment = e.kind === "attachment";
              const a = nodeBox(from);
              const b = nodeBox(to);
              const d = attachment
                ? `M${a.x + a.w / 2} ${a.y}C${a.x + a.w / 2} ${a.y - 60} ${b.x + b.w / 2} ${b.y + b.h + 60} ${b.x + b.w / 2} ${b.y + b.h}`
                : edgePath(a, b);
              const live = viewedRun && isActiveRun(viewedRun) && statuses[to.id] === "working";
              return (
                <g
                  key={e.id}
                  data-edge={e.id}
                  className="st-edge"
                  data-selected={edgeId === e.id || undefined}
                  data-attachment={attachment || undefined}
                  data-live={live || undefined}
                >
                  <path d={d} className="st-edge-hit" />
                  <path d={d} className="st-edge-line" />
                  {!attachment && e.condition !== "success" && (
                    <text
                      x={(a.x + a.w + b.x) / 2}
                      y={(a.y + a.h / 2 + b.y + b.h / 2) / 2 - 8}
                      textAnchor="middle"
                      className="st-edge-label"
                    >
                      {e.condition === "approved"
                        ? "approved"
                        : e.condition === "failure"
                          ? "on failure"
                          : "always"}
                    </text>
                  )}
                </g>
              );
            })}
            {connectSource && drag?.kind === "connect" && (
              <path
                className="st-edge-draft"
                d={edgePath(nodeBox(connectSource), { x: drag.x, y: drag.y, w: 0, h: 0 })}
              />
            )}
          </svg>
          {graph.nodes.map((node) => {
            const box = nodeBox(node);
            const Icon = kindIcons[node.kind];
            const status = statuses[node.id];
            const color = node.style?.fill || kindColors[node.kind];
            return (
              <div
                key={node.id}
                className="st-node"
                data-item={node.id}
                data-kind={node.kind}
                data-status={status}
                data-selected={selection.includes(node.id) || undefined}
                data-connect-from={connectFrom === node.id || undefined}
                style={
                  {
                    left: box.x,
                    top: box.y,
                    width: box.w,
                    height: box.h,
                    "--accent": color,
                  } as CSSProperties
                }
                onDoubleClick={() => setRightTab("workflow")}
              >
                <header>
                  <Icon size={13} />
                  <span>{node.kind === "task" ? "Start" : blockNames[node.kind]}</span>
                  {status && <em data-status={status}>{status}</em>}
                </header>
                <strong>{node.title || blockNames[node.kind]}</strong>
                <p>{subtitle(node)}</p>
                {canConnectTo(node) && <span className="st-port st-port-in" />}
                {canConnectFrom(node) && (
                  <span
                    className="st-port st-port-out"
                    data-port={node.id}
                    title="Drag to connect"
                  />
                )}
              </div>
            );
          })}
          {decor.filter((d) => d.type !== "section").map(renderDecor)}
          {selectionBox && !drag?.kind.match(/move|resize/) && (
            <div
              className="st-selection"
              style={{
                left: selectionBox.x,
                top: selectionBox.y,
                width: selectionBox.w,
                height: selectionBox.h,
              }}
            >
              {selection.length === 1 &&
                handles.map((h) => (
                  <span
                    key={h}
                    className={`st-handle st-handle-${h}`}
                    data-handle={h}
                    style={{ transform: `scale(${1 / view.zoom})` }}
                  />
                ))}
              <span
                className="st-size"
                style={{ transform: `translateX(-50%) scale(${1 / view.zoom})` }}
              >
                {Math.round(selectionBox.w)} × {Math.round(selectionBox.h)}
              </span>
            </div>
          )}
          {marquee && (
            <div
              className={drag?.kind === "create" ? "st-create" : "st-marquee"}
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
            />
          )}
        </div>
        {notice && (
          <div className="st-toast" role="status">
            {notice}
          </div>
        )}
        <footer className="st-statusbar">
          <span data-state={activeRun ? "working" : viewedRun?.status || "idle"}>
            {activeRun
              ? activeRun.status === "awaiting_approval"
                ? "Needs your approval"
                : "Running…"
              : viewedRun
                ? `Last run ${viewedRun.status}`
                : "Not run yet"}
          </span>
          <span>{dirty ? (task ? "Saving…" : "Not created yet") : "All changes saved"}</span>
          <span>
            {graph.nodes.length} blocks · {Math.round(view.zoom * 100)}%
          </span>
        </footer>
        {tool === "connect" && (
          <div className="st-toast st-toast-hint">
            {connectFrom
              ? "Now click the block to connect to."
              : "Click a block to start a connection, or drag from its right edge."}
          </div>
        )}
      </main>

      <aside className="st-right">
        <div
          className="co-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          tabIndex={0}
          onPointerDown={right.startResize}
        />
        <nav className="st-tabs">
          <button
            type="button"
            aria-pressed={rightTab === "copilot"}
            onClick={() => setRightTab("copilot")}
          >
            <Sparkles size={13} /> Copilot
          </button>
          <button
            type="button"
            aria-pressed={rightTab === "design"}
            onClick={() => setRightTab("design")}
          >
            Design
          </button>
          <button
            type="button"
            aria-pressed={rightTab === "workflow"}
            onClick={() => setRightTab("workflow")}
          >
            Workflow
          </button>
          <button
            type="button"
            aria-pressed={rightTab === "run"}
            onClick={() => setRightTab("run")}
          >
            Run{activeRun ? " ●" : ""}
          </button>
        </nav>
        <div className="st-panel">
          {rightTab === "copilot" ? (
            <CopilotPanel
              company={company}
              taskId={taskId}
              graph={graph}
              facts={[
                `Files are saved to: ${folderLabel}. Each run works in that folder; finished runs list the files they changed.`,
                `Schedule: ${meta.schedule.kind === "cron" ? `cron ${meta.schedule.expression} (${meta.schedule.timeZone})` : "runs when started by hand"}.`,
                `Before it starts: ${meta.approval.kind === "none" ? "starts right away" : meta.approval.kind === "human" ? "waits for the user's approval" : "an agent reviews first"}.`,
                viewedRun
                  ? `Latest run: ${viewedRun.status} on ${new Date(viewedRun.createdAt).toLocaleString()}${viewedRun.error ? `; error: ${viewedRun.error.slice(0, 400)}` : ""}${viewedRun.files?.length ? `; files changed: ${viewedRun.files.slice(0, 20).join(", ")}` : "; no files changed"}${viewedRun.output ? `; final output (excerpt): ${viewedRun.output.slice(-1200)}` : ""}`
                  : "It has not run yet.",
              ].join("\n")}
              apply={(next) => {
                commit(next);
                window.requestAnimationFrame(() =>
                  fitAll(
                    unionBox([...next.nodes.map(nodeBox), ...(next.decor || []).map(decorBox)]),
                  ),
                );
              }}
            />
          ) : rightTab === "run" ? (
            <div className="st-run">
              <WorkflowRunPanel
                runs={runs}
                run={viewedRun}
                selectRun={setViewRunId}
                node={selectedNodes.length === 1 ? selectedNodes[0] : undefined}
                isRoot={!selectedNodes.length || selectedNodes[0]?.kind === "task"}
                status={selectedNodes.length === 1 ? statuses[selectedNodes[0]!.id] : undefined}
                runAgain={() => void runWorkflow()}
                runFrom={(stepId) => void runWorkflow(stepId)}
              />
            </div>
          ) : edge ? (
            <EdgeWorkflow
              edge={edge}
              fromApproval={graph.nodes.find((n) => n.id === edge.from)?.kind === "approval"}
              update={(condition) =>
                commit({
                  ...graph,
                  edges: graph.edges.map((e) => (e.id === edge.id ? { ...e, condition } : e)),
                })
              }
              remove={() => {
                commit(deleteItems(graph, [edge.id]));
                setEdgeId("");
              }}
            />
          ) : selection.length > 1 ? (
            <section className="st-section">
              <h4>{selection.length} selected</h4>
              <AlignBar
                count={selection.length}
                align={(how) => commit(alignItems(graph, selection, how))}
                distribute={(axis) => commit(distributeItems(graph, selection, axis))}
              />
              <button type="button" className="st-button" onClick={arrange}>
                <Workflow size={13} /> Auto-arrange by flow · ⇧A
              </button>
              <p className="st-hint">
                Align lines blocks up on one edge or centre; using both centre buttons stacks them
                on one spot. Auto-arrange lays the flow out left to right instead.
              </p>
            </section>
          ) : selectedNodes.length === 1 ? (
            rightTab === "design" ? (
              <NodeDesign
                node={selectedNodes[0]!}
                box={nodeBox(selectedNodes[0]!)}
                setBox={(box) => commit(applyBox(graph, selectedNodes[0]!.id, box))}
                setFill={(fill) => {
                  const { fill: _previous, ...rest } = selectedNodes[0]!.style || {};
                  updateNode(selectedNodes[0]!.id, { style: fill ? { ...rest, fill } : rest });
                }}
              />
            ) : (
              <NodeWorkflow
                company={company}
                node={selectedNodes[0]!}
                update={(patch) => updateNode(selectedNodes[0]!.id, patch)}
              />
            )
          ) : selectedDecor.length === 1 ? (
            <DecorDesign
              item={selectedDecor[0]!}
              update={(patch) => updateDecor(selectedDecor[0]!.id, patch)}
              setBox={(box) => commit(applyBox(graph, selectedDecor[0]!.id, box))}
            />
          ) : (
            <WorkflowSettings
              company={company}
              meta={meta}
              change={changeMeta}
              folderLabel={folderLabel}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
