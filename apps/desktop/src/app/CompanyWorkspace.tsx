import { useEffect, useRef, useState } from "react";
import { GitBranch, Search, Trash2 } from "lucide-react";
import {
  isCompany,
  starterCompany,
  type Company,
  type CompanyProject,
  type CompanyAgent,
  type CompanyTask,
  type Office,
} from "../features/company/company-model";
import "./company-workspace.css";
import "./workspace-shell.css";
import { CompanyFloorplan, type MapFocus } from "../features/company/CompanyFloorplan";
import {
  deleteStructure,
  structureDeletion,
  type StructureTarget,
} from "../features/company/company-structure";
import { AgentForm, OfficeForm, RenameForm } from "../features/company/CompanyForms";
import { CompanyDialog } from "../shared/CompanyDialog";
import { CompanyMemory } from "../features/memory/CompanyMemory";
import { EngineLibrary } from "../features/engines/EngineLibrary";
import { EngineSettings, type EngineSettingsFocus } from "../features/engines/EngineSettings";
import { AgentActivity } from "../features/activity/AgentActivity";
import { ActivityView } from "../features/activity/ActivityView";
import { AppRail } from "./shell/AppRail";
import { TabBar, tabRoute, useOpenTabs } from "./shell/TabBar";
import { SectionSidebar, type ActivityFilter } from "./shell/SectionSidebar";
import { TodayStrip } from "./shell/TodayStrip";
import "./shell/shell.css";
import type { LiveRun } from "../features/engines/live-runtime";
import { ProjectForm } from "../features/projects/CompanyProjects";
import { CompanyStart } from "../features/start/CompanyStart";
import { emptyPrompt, PROMPT_STORAGE, taskFromPrompt } from "../features/start/prompt-composer";
import { TaskCanvas, type ResourceSetupKind } from "../features/tasks/TaskCanvas";
import type { Engine } from "../features/engines/engine-inventory";
import { WorkDetail } from "../features/tasks/WorkDetail";
import { WorkflowStudio } from "../features/studio/WorkflowStudio";
import { newCanvasNode } from "../features/tasks/task-canvas-model";
import { QuickFind } from "./QuickFind";
import { useWorkspaceRoute } from "./useWorkspaceRoute";
import { useLiveSchedules } from "../features/engines/live-schedules";
import { pauseSchedule } from "../features/engines/live-schedules";
import {
  isActiveRun,
  partialRequest,
  startLive,
  taskRequest,
  useLiveRuntime,
} from "../features/engines/live-runtime";
import {
  activeCompany,
  affectedRunKeys,
  changeLifecycle,
  directoryEntries,
  type DirectoryEntry,
  type DirectoryKind,
  type Lifecycle,
} from "../features/company/company-directory";
import { useLiveNotifications } from "../features/engines/live-notifications";
import { learnFromRuns } from "../features/memory/run-learning";
import { TerminalDock } from "../features/terminal/TerminalDock";
import { primaryView, viewLabels, type FindResult, type WorkspaceView } from "./navigation";

const STORAGE = "agentos:company:v1";
type DialogState =
  | { type: "remove-entry"; entry: DirectoryEntry }
  | { type: "delete-structure"; target: StructureTarget }
  | { type: "find" | "navigation" }
  | { type: "canvas"; taskId: string }
  | { type: "inspect-task"; taskId: string }
  | { type: "project"; project?: CompanyProject }
  | { type: "inspect-agent"; officeId: string; agent: CompanyAgent }
  | { type: "office" }
  | { type: "agent"; officeId: string; agent?: CompanyAgent }
  | { type: "rename" }
  | { type: "edit-office"; office: Office }
  | { type: "help" };
function initialCompany() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (isCompany(value)) return value;
  } catch {
    /* Keep the workspace usable if storage is unavailable. */
  }
  return starterCompany;
}
function initialTheme(): "light" | "dark" {
  try {
    return localStorage.getItem("agentos:theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

const NEW_WORKFLOW = "new";
type NewWorkflowInit = {
  domain?: string | undefined;
  projectId?: string | undefined;
  agentId?: string | undefined;
  officeId?: string | undefined;
};

export function CompanyWorkspace() {
  useLiveSchedules();
  useLiveNotifications();
  const [storedCompany, setCompany] = useState<Company>(initialCompany);
  const company = activeCompany(storedCompany);
  const live = useLiveRuntime();
  const [directoryNotice, setDirectoryNotice] = useState("");
  const [composerVersion, setComposerVersion] = useState(0);
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const [newWorkflow, setNewWorkflow] = useState<(NewWorkflowInit & { key: number }) | null>(null);
  const [theme, setTheme] = useState(initialTheme);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [engineSettingsFocus, setEngineSettingsFocus] = useState<EngineSettingsFocus | null>(null);
  const [memoryCreateRequest, setMemoryCreateRequest] = useState(0);
  // The workflow that sent the user to Memory to create context, so they can go straight back.
  const [memoryReturnTask, setMemoryReturnTask] = useState("");
  const { route, go } = useWorkspaceRoute();
  const view = route.view;
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [storageError, setStorageError] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("needs");
  // Company-wide or one project: filters sidebar lists and is where new chats and workflows go.
  const [scope, setScopeState] = useState(() => {
    try {
      return localStorage.getItem("agentos:scope") || "";
    } catch {
      return "";
    }
  });
  const scopeProject = company.projects?.some((p) => p.id === scope) ? scope : "";
  function setScope(next: string) {
    setScopeState(next);
    try {
      localStorage.setItem("agentos:scope", next);
    } catch {
      /* Session only. */
    }
  }
  const openTabs = useOpenTabs(company, route);
  const tasks = company.tasks || [];
  const structureImpact =
    dialog?.type === "delete-structure"
      ? structureDeletion(storedCompany, dialog.target)
      : undefined;
  const activeStructureRuns = structureImpact
    ? live.runs.filter(
        (run) =>
          isActiveRun(run) &&
          run.request.steps.some(
            (step) =>
              structureImpact.agentIds.includes(step.agentId) ||
              (step.reviewer && structureImpact.agentIds.includes(step.reviewer.agentId)),
          ),
      )
    : [];
  const inspectedTask =
    dialog?.type === "inspect-task" || dialog?.type === "canvas"
      ? tasks.find((t) => t.id === dialog.taskId)
      : undefined;
  const workflowPage = route.taskId ? tasks.find((task) => task.id === route.taskId) : undefined;
  const isNewWorkflow = route.taskId === NEW_WORKFLOW;
  const isWorkflowBuilder = view === "tasks" && !!route.taskId;
  function setView(next: WorkspaceView) {
    setQuery("");
    go({ view: next });
  }
  function openCompany() {
    setQuery("");
    go({ view: "map" });
  }
  function openProject(id: string) {
    // Projects have no page of their own: opening one starts a chat inside it.
    setQuery("");
    setDialog(null);
    go({ view: "start", projectId: id });
  }
  function upsertTask(task: CompanyTask) {
    setCompany((current) => ({
      ...current,
      tasks: current.tasks?.some((candidate) => candidate.id === task.id)
        ? current.tasks.map((candidate) => (candidate.id === task.id ? task : candidate))
        : [task, ...(current.tasks || [])],
    }));
  }
  function openResourceSettings(kind: ResourceSetupKind, engine: Engine, taskId?: string) {
    setQuery("");
    setDialog(null);
    if (kind === "context") {
      setMemoryReturnTask(taskId || "");
      setMemoryCreateRequest((request) => request + 1);
      go({ view: "memory" });
      return;
    }
    setEngineSettingsFocus((current) => ({
      id: (current?.id || 0) + 1,
      kind,
      engine,
    }));
    go({ view: "engines" });
  }
  /** Starts a new chat prefilled with a request; `actions` lets it make changes. */
  function startChatWith(text: string, actions = false, engine = "Codex") {
    try {
      const saved = localStorage.getItem(PROMPT_STORAGE);
      if (
        saved &&
        JSON.parse(saved)?.text?.trim() &&
        !window.confirm("Replace your unsent chat draft?")
      )
        return;
      localStorage.setItem(
        PROMPT_STORAGE,
        JSON.stringify({
          ...emptyPrompt,
          text: text.slice(0, 3000),
          engine,
          projectId: scopeProject,
          ...(actions ? { actions: true } : {}),
        }),
      );
    } catch {
      setDirectoryNotice("Draft storage is unavailable, so the chat couldn't be prepared.");
      return;
    }
    setComposerVersion((v) => v + 1);
    go({ view: "start" });
  }
  function askAboutRun(run: LiveRun) {
    const detail = (run.error || run.output || "").slice(0, 1800);
    startChatWith(
      `About the run “${run.request.title}” (${run.status}, ${new Date(run.updatedAt).toLocaleString()}):\n${detail}\n\nMy question: `,
    );
  }
  /** A chat answer becomes the outcome of a new workflow; the Studio copilot builds its steps. */
  function workflowFromChat(request: string, reply: string, projectId?: string) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const outcome = `${request}\n\nPlan from chat:\n${reply}`.slice(0, 6000);
    const root = {
      ...newCanvasNode("task", 120, 200, "task-root"),
      title: request.split("\n")[0]!.slice(0, 80) || "Workflow from chat",
      prompt: outcome,
    };
    upsertTask({
      id,
      title: root.title,
      brief: outcome,
      assignment: { kind: "agents", targets: [] },
      status: "planned",
      createdAt: now,
      ...(projectId ? { projectId } : {}),
      schedule: { kind: "manual" },
      approval: { kind: "none" },
      canvas: { version: 1, nodes: [root], edges: [], decor: [] },
    });
    go({ view: "tasks", taskId: id });
  }
  /** Starts a new chat that can make changes, prefilled with a setup request. */
  function setupWithChat(text: string, engine: Engine) {
    try {
      const saved = localStorage.getItem(PROMPT_STORAGE);
      if (
        saved &&
        JSON.parse(saved)?.text?.trim() &&
        !window.confirm("Replace your unsent chat draft with this setup request?")
      )
        return;
      localStorage.setItem(
        PROMPT_STORAGE,
        JSON.stringify({
          ...emptyPrompt,
          text,
          engine: engine === "claude" ? "Claude Code" : "Codex",
          actions: true,
        }),
      );
    } catch {
      setDirectoryNotice("Draft storage is unavailable, so the setup chat couldn't be prepared.");
      return;
    }
    setComposerVersion((v) => v + 1);
    go({ view: "start" });
  }
  function openDirectoryEntry(entry: DirectoryEntry) {
    setDialog(null);
    if (entry.kind === "project") openProject(entry.id);
    else if (entry.kind === "chat") go({ view: "start", chatId: entry.id });
    else go({ view: "tasks", taskId: entry.id });
  }
  function createDirectoryEntry(kind: DirectoryKind, projectId?: string) {
    if (kind === "chat") {
      const key = projectId ? `${PROMPT_STORAGE}:project:${projectId}` : PROMPT_STORAGE;
      try {
        const saved = localStorage.getItem(key);
        if (
          saved &&
          (JSON.parse(saved)?.text?.trim() || JSON.parse(saved)?.attachments?.length) &&
          !window.confirm(
            "Start a new chat and clear the unsent draft for this workspace? Saved conversations are kept.",
          )
        )
          return;
        localStorage.setItem(key, JSON.stringify({ ...emptyPrompt, projectId: projectId || "" }));
      } catch {
        setDirectoryNotice("Draft storage is unavailable. Your existing draft was left untouched.");
        return;
      }
      setComposerVersion((v) => v + 1);
      go({ view: "start", ...(projectId ? { projectId } : {}) });
    } else if (kind === "task") openNewWorkflow({ projectId });
    else setDialog({ type: "project" });
    if (kind === "chat") setDialog(null);
  }
  function updateLifecycle(entry: DirectoryEntry, lifecycle: Lifecycle, confirmed = false) {
    try {
      const activeKeys = live.runs.filter(isActiveRun).map((r) => r.request.key);
      const next = changeLifecycle(storedCompany, entry, lifecycle, activeKeys);
      if (lifecycle === "removed" && !confirmed) {
        setDialog({ type: "remove-entry", entry });
        return;
      }
      if (lifecycle !== "active")
        for (const key of affectedRunKeys(storedCompany, entry))
          if (key.startsWith("task:")) pauseSchedule(key.slice(5));
      // Persist before changing the view; a full disk must not look like a successful archive.
      localStorage.setItem(STORAGE, JSON.stringify(next));
      setCompany(next);
      setDirectoryNotice(
        `${entry.kind === "project" ? "Project" : entry.kind === "chat" ? "Chat" : "Workflow"} ${lifecycle === "active" ? "restored. Schedules stay paused." : `${lifecycle}. Files and run history are kept.`}`,
      );
      if (lifecycle !== "active") {
        const keys = affectedRunKeys(storedCompany, entry);
        if (
          (route.chatId && keys.includes(`chat:${route.chatId}`)) ||
          (route.taskId && keys.includes(`task:${route.taskId}`)) ||
          (route.projectId === entry.id && entry.kind === "project")
        )
          go({ view: route.taskId ? "map" : "start" });
        if (dialog?.type === "inspect-task" || dialog?.type === "canvas")
          if (keys.includes(`task:${dialog.taskId}`)) setDialog(null);
      }
    } catch (e) {
      setDirectoryNotice(String(e).replace(/^Error: /, ""));
    }
  }
  function updateOffice(updated: Office) {
    setCompany((c) => ({
      ...c,
      offices: c.offices.map((o) => (o.id === updated.id ? updated : o)),
    }));
  }
  function confirmStructureDelete(target: StructureTarget, removeTasks = false) {
    try {
      const impact = structureDeletion(storedCompany, target);
      const running = live.runs.some(
        (run) =>
          isActiveRun(run) &&
          run.request.steps.some(
            (step) =>
              impact.agentIds.includes(step.agentId) ||
              (step.reviewer && impact.agentIds.includes(step.reviewer.agentId)),
          ),
      );
      if (running) throw new Error("Wait for the affected live work to finish or cancel it first.");
      const next = deleteStructure(storedCompany, target, { removeTasks });
      if (removeTasks)
        for (const task of storedCompany.tasks || [])
          if (!next.tasks?.some((kept) => kept.id === task.id)) pauseSchedule(task.id);
      localStorage.setItem(STORAGE, JSON.stringify(next));
      setCompany(next);
      setDialog(null);
      setDirectoryNotice(
        `${target.kind[0]!.toUpperCase()}${target.kind.slice(1)} deleted${removeTasks && impact.blockingTasks.length ? ` with ${impact.blockingTasks.length} ${impact.blockingTasks.length === 1 ? "workflow" : "workflows"}` : ""}. Past run history remains available.`,
      );
    } catch (error) {
      setDirectoryNotice(String(error).replace(/^Error: /, ""));
    }
  }
  function openNewWorkflow(init: NewWorkflowInit = {}) {
    setDialog(null);
    if (!init.projectId && scopeProject) init = { ...init, projectId: scopeProject };
    setNewWorkflow({ ...init, key: (newWorkflow?.key || 0) + 1 });
    go({ view: "tasks", taskId: NEW_WORKFLOW });
  }
  async function runWorkflow(task: CompanyTask, fromStepId?: string) {
    const nextCompany = {
      ...company,
      tasks: company.tasks?.some((candidate) => candidate.id === task.id)
        ? company.tasks.map((candidate) => (candidate.id === task.id ? task : candidate))
        : [task, ...(company.tasks || [])],
    };
    upsertTask(task);
    const request = await taskRequest(nextCompany, task);
    const history = live.runs.filter((run) => run.request.key === request.key);
    await startLive(fromStepId ? partialRequest(request, fromStepId, history) : request);
  }
  async function assignWork(agent: CompanyAgent, text: string) {
    // One-off work for a single agent is saved as a one-step workflow so it can be watched and rerun.
    const task = taskFromPrompt(
      company,
      { ...emptyPrompt, text, makeTask: true, target: `a:${agent.id}` },
      crypto.randomUUID(),
      new Date().toISOString(),
    );
    await runWorkflow(task);
    go({ view: "tasks", taskId: task.id });
  }
  function chooseResult(result: FindResult) {
    setDialog(null);
    if (result.run) return result.run();
    if (result.route) {
      setQuery("");
      go(result.route);
    } else if (result.kind === "project") openProject(result.id);
    else if (result.kind === "office") openCompany();
    else if (result.kind === "task") {
      setQuery("");
      go({ view: "tasks", taskId: result.id });
    } else if (result.kind === "agent") {
      // Agents live on the map: open it with that agent selected and in view.
      setQuery("");
      setMapFocus((current) => ({ kind: "agent", id: result.id, key: (current?.key || 0) + 1 }));
      go({ view: "map" });
    }
  }
  // Turn finished runs into memory notes: agents' learned lessons, and failures as known issues.
  const finishedRuns = live.runs
    .filter((run) => run.status === "completed" || run.status === "failed")
    .map((run) => run.request.id)
    .join(",");
  useEffect(() => {
    if (!finishedRuns) return;
    learnFromRuns(live.runs, company)
      .then((count) => {
        if (count)
          setDirectoryNotice(
            `Memory learned ${count} ${count === 1 ? "note" : "notes"} from recent runs.`,
          );
      })
      .catch(() => {
        /* Memory busy or unavailable; the next finished run retries. */
      });
  }, [finishedRuns]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(storedCompany));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [storedCompany]);
  useEffect(() => {
    document.documentElement.dataset.companyTheme = theme;
    try {
      localStorage.setItem("agentos:theme", theme);
    } catch {
      /* Appearance still works for this session. */
    }
  }, [theme]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k" &&
        !event.isComposing
      ) {
        event.preventDefault();
        if (!dialog || dialog.type === "find") setDialog(dialog ? null : { type: "find" });
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "j" &&
        !event.isComposing
      ) {
        event.preventDefault();
        setTerminalOpen((open) => !open);
      } else if (event.metaKey && !event.shiftKey && /^Digit[1-9]$/.test(event.code)) {
        // ⌘1–9 switch open tabs, like a browser.
        const tab = openTabs.tabs[Number(event.code.slice(5)) - 1];
        if (tab) {
          event.preventDefault();
          go(tabRoute(tab));
        }
      } else if (event.ctrlKey && !event.metaKey && /^Digit[1-4]$/.test(event.code)) {
        event.preventDefault();
        setView(
          (["map", "start", "activity", "memory"] as const)[Number(event.code.slice(5)) - 1]!,
        );
      } else if (event.metaKey && !event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        createDirectoryEntry("chat", scopeProject || undefined);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dialog, openTabs.tabs, scopeProject]);
  const group = primaryView(view);
  // ⌘K commands: run and create things, not just find them.
  const lastFailed = live.runs
    .filter((r) => r.status === "failed" && !r.request.key.startsWith("copilot:"))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const pendingCount = live.runs.reduce((n, r) => n + r.approvals.length, 0);
  const paletteActions: FindResult[] = [
    ...(pendingCount
      ? [
          {
            id: "action:needs",
            kind: "action" as const,
            title: `Review ${pendingCount} ${pendingCount === 1 ? "approval" : "approvals"}`,
            detail: "Activity · Needs you",
            run: () => {
              setActivityFilter("needs");
              setView("activity");
            },
          },
        ]
      : []),
    {
      id: "action:new-chat",
      kind: "action" as const,
      title: "New chat",
      detail: "⌘T",
      run: () => createDirectoryEntry("chat", scopeProject || undefined),
    },
    {
      id: "action:new-workflow",
      kind: "action" as const,
      title: "New workflow",
      detail: "Opens the Studio with the copilot",
      run: () => openNewWorkflow({}),
    },
    ...(lastFailed
      ? [
          {
            id: "action:last-failed",
            kind: "action" as const,
            title: `Open last failed run: ${lastFailed.request.title}`,
            detail: "Activity · Failed",
            run: () => {
              setActivityFilter("failed");
              setView("activity");
            },
          },
        ]
      : []),
    ...tasks.map((task) => ({
      id: `action:run:${task.id}`,
      kind: "action" as const,
      title: `Run ${task.title}`,
      detail: "Start this workflow now",
      run: () => {
        void runWorkflow(task)
          .then(() => setDirectoryNotice(`Started “${task.title}”.`))
          .catch((error) => setDirectoryNotice(String(error).replace(/^Error: /, "")));
      },
    })),
    ...company.offices.map((office) => ({
      id: `action:new-in:${office.id}`,
      kind: "action" as const,
      title: `New workflow in ${office.name}`,
      detail: "Office",
      run: () => openNewWorkflow({ officeId: office.id }),
    })),
    {
      id: "action:theme",
      kind: "action" as const,
      title: theme === "light" ? "Switch to dark appearance" : "Switch to light appearance",
      detail: "Appearance",
      run: () => setTheme((t) => (t === "light" ? "dark" : "light")),
    },
  ];
  // The Company map has no heading or tabs: workflows live inside the offices on the map.
  const companyMap = view === "map" || (view === "tasks" && !isWorkflowBuilder);
  const searchLabel =
    view === "engines"
      ? "Search capabilities"
      : view === "memory"
        ? "Search memory"
        : view === "activity"
          ? "Search runs"
          : view === "tasks"
            ? "Search workflows"
            : "Search agents and workflows";
  return (
    <div
      className="company-app sh-app"
      data-theme={theme}
      data-terminal-open={terminalOpen || undefined}
      data-sidebar={(view !== "settings" && !isWorkflowBuilder) || undefined}
    >
      <AppRail
        view={view}
        needsYou={live.runs.reduce(
          (n, r) => n + (r.request.key.startsWith("copilot:") ? 0 : r.approvals.length),
          0,
        )}
        theme={theme}
        navigate={(next) => {
          setDialog(null);
          if (next === "activity") setActivityFilter("needs");
          setView(next);
        }}
        find={() => setDialog({ type: "find" })}
        help={() => setDialog({ type: "help" })}
        toggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      />
      <SectionSidebar
        view={view}
        route={route}
        company={company}
        storedCompany={storedCompany}
        scope={scopeProject}
        setScope={setScope}
        newProject={() => setDialog({ type: "project" })}
        editProject={(id) => {
          const project = company.projects?.find((p) => p.id === id);
          if (project) setDialog({ type: "project", project });
        }}
        go={(next) => {
          setQuery("");
          go(next);
        }}
        focusOffice={(id) => {
          setMapFocus((current) => ({ kind: "office", id, key: (current?.key || 0) + 1 }));
          if (view !== "map") go({ view: "map" });
        }}
        newWorkflow={(officeId) =>
          openNewWorkflow({
            ...(officeId ? { officeId } : {}),
            ...(scopeProject ? { projectId: scopeProject } : {}),
          })
        }
        newChat={() => createDirectoryEntry("chat", scopeProject || undefined)}
        lifecycle={(entry, lifecycle) => updateLifecycle(entry, lifecycle)}
        activityFilter={activityFilter}
        setActivityFilter={(filter) => {
          setActivityFilter(filter);
          if (view !== "activity") setView("activity");
        }}
      />
      <div className="co-main">
        <TabBar
          company={company}
          tabs={openTabs.tabs}
          current={openTabs.current}
          open={(tab) => go(tabRoute(tab))}
          close={(tab) => {
            const index = openTabs.tabs.findIndex((t) => t.kind === tab.kind && t.id === tab.id);
            openTabs.close(tab);
            if (openTabs.current?.kind === tab.kind && openTabs.current.id === tab.id) {
              const neighbour = openTabs.tabs[index + 1] || openTabs.tabs[index - 1];
              const fallback = neighbour && neighbour.id !== tab.id ? neighbour : undefined;
              go(fallback ? tabRoute(fallback) : { view: tab.kind === "chat" ? "start" : "map" });
            }
          }}
          newChat={() => createDirectoryEntry("chat", scopeProject || undefined)}
          find={() => setDialog({ type: "find" })}
          title={isNewWorkflow ? "New workflow" : viewLabels[view === "inbox" ? "activity" : view]}
          terminalOpen={terminalOpen}
          toggleTerminal={() => setTerminalOpen((open) => !open)}
        />
        {directoryNotice && (
          <div className="co-directory-status" role="status">
            <span>{directoryNotice}</span>
            <button aria-label="Dismiss directory notice" onClick={() => setDirectoryNotice("")}>
              ×
            </button>
          </div>
        )}
        <main
          id="workspace-content"
          className={`co-content ${companyMap ? "co-map-mode" : view === "start" ? "co-start-mode" : view === "activity" || view === "inbox" ? "co-activity-mode" : ""} ${isWorkflowBuilder ? "co-workflow-page" : ""}`}
        >
          {!isWorkflowBuilder && !companyMap && !["start", "activity", "inbox"].includes(view) && (
            // One header pattern for every page: title on the left, search on the right.
            <section className="co-page-heading sh-page-head">
              <h1>{viewLabels[view]}</h1>
              {view !== "settings" && (
                <div className="co-search">
                  <Search size={14} />
                  <input
                    ref={searchRef}
                    aria-label={searchLabel}
                    placeholder={searchLabel + "…"}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      aria-label="Clear search"
                      onClick={() => {
                        setQuery("");
                        searchRef.current?.focus();
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
          {view === "start" ? (
            <CompanyStart
              key={route.chatId || `new:${route.projectId || "company"}:${composerVersion}`}
              selectedChatId={route.chatId}
              initialProjectId={route.projectId}
              openChat={(chatId) => go({ view: "start", chatId })}
              company={company}
              change={setCompany}
              editTask={(task) => go({ view: "tasks", taskId: task.id })}
              toWorkflow={workflowFromChat}
              lifecycleChat={(chat, lifecycle) => {
                const entry = directoryEntries(storedCompany).find(
                  (candidate) => candidate.kind === "chat" && candidate.id === chat.id,
                );
                if (entry) updateLifecycle(entry, lifecycle);
              }}
            />
          ) : view === "activity" || view === "inbox" ? (
            <ActivityView
              filter={view === "inbox" ? "needs" : activityFilter}
              askAboutRun={askAboutRun}
              openRun={(run) => {
                const key = run.request.key;
                if (key.startsWith("chat:")) go({ view: "start", chatId: key.slice(5) });
                else if (key.startsWith("task:")) go({ view: "tasks", taskId: key.slice(5) });
              }}
            />
          ) : view === "engines" ? (
            <EngineLibrary
              query={query}
              setupWithChat={setupWithChat}
              focus={engineSettingsFocus}
            />
          ) : view === "settings" ? (
            <EngineSettings />
          ) : view === "memory" ? (
            <CompanyMemory
              company={company}
              query={query}
              createRequest={memoryCreateRequest}
              back={
                memoryReturnTask && tasks.some((task) => task.id === memoryReturnTask)
                  ? () => {
                      setMemoryReturnTask("");
                      go({ view: "tasks", taskId: memoryReturnTask });
                    }
                  : undefined
              }
            />
          ) : isWorkflowBuilder ? (
            isNewWorkflow || workflowPage ? (
              <WorkflowStudio
                key={isNewWorkflow ? `new:${newWorkflow?.key || 0}` : `task:${workflowPage!.id}`}
                company={company}
                task={isNewWorkflow ? undefined : workflowPage}
                init={{
                  ...(newWorkflow?.projectId ? { projectId: newWorkflow.projectId } : {}),
                  ...(newWorkflow?.officeId ? { officeId: newWorkflow.officeId } : {}),
                  ...(newWorkflow?.agentId ? { agentId: newWorkflow.agentId } : {}),
                }}
                save={(task) => {
                  upsertTask(task);
                  if (isNewWorkflow) go({ view: "tasks", taskId: task.id });
                }}
                run={async (task, fromStepId) => {
                  await runWorkflow(task, fromStepId);
                  if (isNewWorkflow) go({ view: "tasks", taskId: task.id });
                }}
                close={() => go({ view: "map" })}
                addAgent={(officeId, agent) =>
                  setCompany((c) => ({
                    ...c,
                    offices: c.offices.map((o) =>
                      o.id === officeId ? { ...o, agents: [...o.agents, agent] } : o,
                    ),
                  }))
                }
              />
            ) : (
              <section className="co-workflow-missing">
                <GitBranch size={24} />
                <h2>Workflow unavailable</h2>
                <p>It may have been archived or removed.</p>
                <button className="co-button" onClick={() => setView("map")}>
                  Back to company
                </button>
              </section>
            )
          ) : (
            <>
              <CompanyFloorplan
                toolbar={
                  <TodayStrip
                    company={company}
                    openActivity={(filter) => {
                      setActivityFilter(filter);
                      setView("activity");
                    }}
                    openWorkflow={(id) => go({ view: "tasks", taskId: id })}
                  />
                }
                company={company}
                focus={mapFocus}
                openSettings={() => setView("settings")}
                editOffice={(o) => setDialog({ type: "edit-office", office: o })}
                deleteOffice={(o) =>
                  setDialog({ type: "delete-structure", target: { kind: "office", id: o.id } })
                }
                addWorkflow={(o) =>
                  openNewWorkflow(o ? { agentId: o.agents[0]?.id, officeId: o.id } : {})
                }
                addOffice={() => setDialog({ type: "office" })}
                addAgent={(officeId) => setDialog({ type: "agent", officeId })}
                inspectAgent={(officeId, agent) =>
                  setDialog({ type: "inspect-agent", officeId, agent })
                }
                editAgent={(officeId, agent) => setDialog({ type: "agent", officeId, agent })}
                openWorkflow={(task) => go({ view: "tasks", taskId: task.id })}
                runWorkflow={runWorkflow}
                assignWork={assignWork}
              />
            </>
          )}
          {storageError && (
            <footer className="co-page-foot" role="alert">
              <span>Storage unavailable — session only. Keep this window open.</span>
            </footer>
          )}
        </main>
        <TerminalDock open={terminalOpen} close={() => setTerminalOpen(false)} />
      </div>
      {dialog && (
        <CompanyDialog
          expanded={dialog.type === "canvas"}
          wide={
            dialog.type === "inspect-task" ||
            dialog.type === "project" ||
            dialog.type === "inspect-agent" ||
            dialog.type === "agent"
          }
          title={
            dialog.type === "remove-entry"
              ? `Delete ${dialog.entry.kind === "task" ? "workflow" : dialog.entry.kind}?`
              : dialog.type === "delete-structure"
                ? `Delete ${dialog.target.kind}?`
                : dialog.type === "find"
                  ? "Search or run a command"
                  : dialog.type === "navigation"
                    ? "Workspace"
                    : dialog.type === "canvas"
                      ? `${inspectedTask?.title || "Workflow"} · Workflow map`
                      : dialog.type === "inspect-task"
                        ? inspectedTask?.title || "Workflow unavailable"
                        : dialog.type === "project"
                          ? dialog.project
                            ? "Edit project"
                            : "Create a project"
                          : dialog.type === "inspect-agent"
                            ? `${dialog.agent.name} · Run history`
                            : dialog.type === "office"
                              ? "Create an office"
                              : dialog.type === "edit-office"
                                ? "Edit office"
                                : dialog.type === "agent"
                                  ? dialog.agent
                                    ? "Edit agent"
                                    : "Add a teammate"
                                  : dialog.type === "rename"
                                    ? "Make it your company"
                                    : "Help & shortcuts"
          }
          close={() => setDialog(null)}
        >
          {dialog.type === "remove-entry" && (
            <div className="co-form">
              <p>
                Delete “{dialog.entry.title.slice(0, 120)}” from your workspace?{" "}
                {dialog.entry.kind === "project"
                  ? "Its chats and workflows will be hidden with it."
                  : ""}
              </p>
              <p>
                You can restore it from Directory → Removed items. Files and run history are kept.
                Affected schedules will be paused.
              </p>
              <button className="co-button" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                className="co-button co-button-primary"
                onClick={() => {
                  const entry = dialog.entry;
                  setDialog(null);
                  updateLifecycle(entry, "removed", true);
                }}
              >
                Delete {dialog.entry.kind === "task" ? "workflow" : dialog.entry.kind}
              </button>
            </div>
          )}
          {dialog.type === "delete-structure" && structureImpact && (
            <div className="co-form co-delete-structure">
              <p>
                Permanently delete “{structureImpact.label}”? This cannot be undone. Historical Run
                history, memory, and project files are kept.
              </p>
              {(structureImpact.officeIds.length > 0 || structureImpact.agentIds.length > 0) && (
                <div className="co-form-note">
                  This removes {structureImpact.officeIds.length}{" "}
                  {structureImpact.officeIds.length === 1 ? "office" : "offices"} and{" "}
                  {structureImpact.agentIds.length}{" "}
                  {structureImpact.agentIds.length === 1 ? "agent" : "agents"} from the company.
                  {structureImpact.affectedProjects > 0
                    ? ` Membership will also be removed from ${structureImpact.affectedProjects} ${structureImpact.affectedProjects === 1 ? "project" : "projects"}.`
                    : ""}
                </div>
              )}
              {structureImpact.blockingTasks.length > 0 && (
                <div className="co-delete-blockers" role="alert">
                  <strong>These workflows use this team</strong>
                  <p>
                    Open one to reassign it, or delete them together with this {dialog.target.kind}.
                  </p>
                  {structureImpact.blockingTasks.map((task) =>
                    task.lifecycle === "active" ? (
                      <button
                        className="co-button"
                        key={task.id}
                        onClick={() => setDialog({ type: "inspect-task", taskId: task.id })}
                      >
                        {task.title}
                      </button>
                    ) : (
                      <span className="co-delete-blocked-task" key={task.id}>
                        {task.title} · Restore from Directory →{" "}
                        {task.lifecycle === "archived" ? "Archived" : "Removed"} items, then
                        reassign it.
                      </span>
                    ),
                  )}
                </div>
              )}
              {activeStructureRuns.length > 0 && (
                <div className="co-delete-blockers" role="alert">
                  <strong>Live work is still using this team</strong>
                  <p>Finish or cancel the active work from its chat or workflow before deleting.</p>
                  {[...new Set(activeStructureRuns.map((run) => run.request.title))].map(
                    (title) => (
                      <span key={title}>{title}</span>
                    ),
                  )}
                </div>
              )}
              <div className="co-delete-actions">
                <button className="co-button" onClick={() => setDialog(null)}>
                  Cancel
                </button>
                {structureImpact.blockingTasks.length > 0 ? (
                  <button
                    className="co-button co-button-danger"
                    disabled={activeStructureRuns.length > 0}
                    onClick={() => confirmStructureDelete(dialog.target, true)}
                  >
                    <Trash2 size={14} /> Delete {dialog.target.kind} and{" "}
                    {structureImpact.blockingTasks.length}{" "}
                    {structureImpact.blockingTasks.length === 1 ? "workflow" : "workflows"}
                  </button>
                ) : (
                  <button
                    className="co-button co-button-danger"
                    disabled={activeStructureRuns.length > 0}
                    onClick={() => confirmStructureDelete(dialog.target)}
                  >
                    <Trash2 size={14} /> Delete {dialog.target.kind}
                  </button>
                )}
              </div>
            </div>
          )}
          {dialog.type === "find" && (
            <QuickFind company={company} choose={chooseResult} actions={paletteActions} />
          )}
          {dialog.type === "inspect-task" &&
            (inspectedTask ? (
              <WorkDetail
                key={inspectedTask.id}
                company={company}
                task={inspectedTask}
                saveTask={(task) =>
                  setCompany((c) => ({
                    ...c,
                    tasks: (c.tasks || []).map((t) => (t.id === task.id ? task : t)),
                  }))
                }
                canvas={() => setDialog({ type: "canvas", taskId: inspectedTask.id })}
                edit={() => {
                  setDialog(null);
                  go({ view: "tasks", taskId: inspectedTask.id });
                }}
                archive={() => {
                  const entry = directoryEntries(storedCompany).find(
                    (candidate) => candidate.kind === "task" && candidate.id === inspectedTask.id,
                  );
                  if (entry) updateLifecycle(entry, "archived");
                }}
                remove={() => {
                  const entry = directoryEntries(storedCompany).find(
                    (candidate) => candidate.kind === "task" && candidate.id === inspectedTask.id,
                  );
                  if (entry) updateLifecycle(entry, "removed");
                }}
              />
            ) : (
              <p className="co-form">This workflow is no longer available.</p>
            ))}
          {dialog.type === "canvas" &&
            (inspectedTask ? (
              <TaskCanvas
                key={inspectedTask.id}
                company={company}
                task={inspectedTask}
                saveModels={(task) =>
                  setCompany((c) => ({
                    ...c,
                    tasks: (c.tasks || []).map((t) =>
                      t.id === task.id
                        ? {
                            ...t,
                            modelDefaults: task.modelDefaults || {},
                            stepModels: task.stepModels || {},
                          }
                        : t,
                    ),
                  }))
                }
                storageError={storageError}
                back={() => setDialog({ type: "inspect-task", taskId: inspectedTask.id })}
                changeTaskDetails={({ title, brief }) =>
                  setCompany((c) => ({
                    ...c,
                    tasks: (c.tasks || []).map((t) =>
                      t.id === inspectedTask.id ? { ...t, title, brief } : t,
                    ),
                  }))
                }
                changeProject={(projectId) =>
                  setCompany((c) => ({
                    ...c,
                    tasks: (c.tasks || []).map((t) => {
                      if (t.id !== inspectedTask.id) return t;
                      if (projectId) return { ...t, projectId };
                      const { projectId: _projectId, ...withoutProject } = t;
                      return withoutProject;
                    }),
                  }))
                }
                changeDirectory={(directory) =>
                  setCompany((c) => ({
                    ...c,
                    tasks: (c.tasks || []).map((t) => {
                      if (t.id !== inspectedTask.id) return t;
                      if (directory) return { ...t, directory };
                      const { directory: _directory, ...withoutDirectory } = t;
                      return withoutDirectory;
                    }),
                  }))
                }
                changeApproval={(approval) =>
                  setCompany((c) => ({
                    ...c,
                    tasks: (c.tasks || []).map((t) =>
                      t.id === inspectedTask.id ? { ...t, approval } : t,
                    ),
                  }))
                }
                openResourceSettings={(kind, engine) =>
                  openResourceSettings(kind, engine, inspectedTask.id)
                }
                changeAttachments={(attachments) =>
                  setCompany((c) => ({
                    ...c,
                    tasks: (c.tasks || []).map((t) =>
                      t.id === inspectedTask.id ? { ...t, attachments } : t,
                    ),
                  }))
                }
                onAttachmentsBusy={() => {}}
                save={(canvas) =>
                  setCompany((c) => ({
                    ...c,
                    tasks: (c.tasks || []).map((t) =>
                      t.id === inspectedTask.id ? { ...t, canvas } : t,
                    ),
                  }))
                }
              />
            ) : (
              <p className="co-form">This workflow is no longer available.</p>
            ))}
          {dialog.type === "project" && (
            <ProjectForm
              company={company}
              existing={dialog.project}
              save={(project) => {
                setCompany((c) => ({
                  ...c,
                  projects: c.projects?.some((p) => p.id === project.id)
                    ? c.projects.map((p) => (p.id === project.id ? project : p))
                    : [...(c.projects || []), project],
                }));
                openProject(project.id);
              }}
            />
          )}
          {(dialog.type === "office" || dialog.type === "edit-office") && (
            <OfficeForm
              existing={dialog.type === "edit-office" ? dialog.office : undefined}
              remove={
                dialog.type === "edit-office"
                  ? () =>
                      setDialog({
                        type: "delete-structure",
                        target: { kind: "office", id: dialog.office.id },
                      })
                  : undefined
              }
              save={(o) => {
                if (dialog.type === "edit-office") updateOffice(o);
                else setCompany((c) => ({ ...c, offices: [...c.offices, o] }));
                setDialog(null);
              }}
            />
          )}
          {dialog.type === "inspect-agent" && (
            <AgentActivity
              company={company}
              openProject={openProject}
              agent={dialog.agent}
              office={
                company.offices.find((o) => o.id === dialog.officeId)?.name || "Unknown office"
              }
              configure={() =>
                setDialog({ type: "agent", officeId: dialog.officeId, agent: dialog.agent })
              }
              remove={() =>
                setDialog({
                  type: "delete-structure",
                  target: { kind: "agent", id: dialog.agent.id, officeId: dialog.officeId },
                })
              }
            />
          )}
          {dialog.type === "agent" && (
            <AgentForm
              offices={company.offices}
              officeId={dialog.officeId}
              existing={dialog.agent}
              remove={
                dialog.agent
                  ? () =>
                      setDialog({
                        type: "delete-structure",
                        target: {
                          kind: "agent",
                          id: dialog.agent!.id,
                          officeId: dialog.officeId,
                        },
                      })
                  : undefined
              }
              save={(officeId, agent) => {
                setCompany((c) => ({
                  ...c,
                  offices: c.offices.map((o) => ({
                    ...o,
                    agents: [
                      ...o.agents.filter((a) => a.id !== agent.id),
                      ...(o.id === officeId ? [agent] : []),
                    ],
                  })),
                }));
                setDialog(null);
              }}
            />
          )}
          {dialog.type === "rename" && (
            <RenameForm
              name={company.name}
              save={(name) => {
                setCompany((c) => ({ ...c, name }));
                setDialog(null);
              }}
            />
          )}
          {dialog.type === "help" && (
            <div className="sh-help">
              <section>
                <h3>How it works</h3>
                <ol>
                  <li>
                    <strong>Home</strong> is your company: offices, agents, and the workflows they
                    run. Open a workflow to edit it in the Studio.
                  </li>
                  <li>
                    <strong>Build workflows</strong> on the canvas or by asking the Studio Copilot.
                    Steps run on your installed Codex or Claude Code.
                  </li>
                  <li>
                    <strong>Activity</strong> shows what needs your approval, what&apos;s running,
                    and every result.
                  </li>
                  <li>
                    <strong>Library</strong> holds notes your agents use and the tools they can
                    call.
                  </li>
                </ol>
              </section>
              <section>
                <h3>Shortcuts</h3>
                <dl>
                  {[
                    ["⌘K", "Search or run a command"],
                    ["⌘T", "New chat"],
                    ["⌘1–9", "Switch open tabs"],
                    ["⌃1–4", "Home, Chat, Activity, Library"],
                    ["⌘J", "Terminal"],
                    ["⌘↵", "Run the workflow (Studio)"],
                    ["⇧A", "Auto-arrange (Studio)"],
                    ["V H F R O T S C", "Studio tools"],
                  ].map(([keys, label]) => (
                    <div key={keys}>
                      <dt>
                        <kbd>{keys}</kbd>
                      </dt>
                      <dd>{label}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          )}
        </CompanyDialog>
      )}
    </div>
  );
}
