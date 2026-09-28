import { useEffect, useRef, useState } from "react";
import {
  Building2,
  ChevronRight,
  GitBranch,
  Menu,
  Search,
  SquareTerminal,
  Trash2,
} from "lucide-react";
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
import { CompanyFloorplan } from "../features/company/CompanyFloorplan";
import {
  deleteStructure,
  structureDeletion,
  type StructureTarget,
} from "../features/company/company-structure";
import { AgentForm, OfficeForm, RenameForm } from "../features/company/CompanyForms";
import { CompanyDialog } from "../shared/CompanyDialog";
import { HelpTip } from "../shared/HelpTip";
import { TaskForm } from "../features/tasks/CompanyTasks";
import { CompanyMemory } from "../features/memory/CompanyMemory";
import { EngineLibrary } from "../features/engines/EngineLibrary";
import { EngineSettings, type EngineSettingsFocus } from "../features/engines/EngineSettings";
import { AgentActivity } from "../features/activity/AgentActivity";
import { ProjectForm } from "../features/projects/CompanyProjects";
import { CompanyStart } from "../features/start/CompanyStart";
import { emptyPrompt, PROMPT_STORAGE, taskFromPrompt } from "../features/start/prompt-composer";
import { TaskCanvas, type ResourceSetupKind } from "../features/tasks/TaskCanvas";
import type { Engine } from "../features/engines/engine-inventory";
import { WorkDetail } from "../features/tasks/WorkDetail";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import { QuickFind } from "./QuickFind";
import { useWorkspaceRoute } from "./useWorkspaceRoute";
import { useLiveSchedules } from "../features/engines/live-schedules";
import { pauseSchedule } from "../features/engines/live-schedules";
import {
  isActiveRun,
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
import { TerminalDock } from "../features/terminal/TerminalDock";
import {
  destinations,
  primaryView,
  viewLabels,
  type FindResult,
  type WorkspaceView,
} from "./navigation";

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
const descriptions: Record<WorkspaceView, string> = {
  start: "",
  tasks: "Build workflows from tasks, agents, context, and approvals.",
  map: "Your offices, agents, and workflows in one place.",
  memory: "Facts, lessons, and context worth keeping.",
  engines: "Discover the tools and skills already available locally.",
  settings: "Manage local engines, project discovery, and notifications.",
};

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
  const [newWorkflow, setNewWorkflow] = useState<(NewWorkflowInit & { key: number }) | null>(null);
  const [theme, setTheme] = useState(initialTheme);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [engineSettingsFocus, setEngineSettingsFocus] = useState<EngineSettingsFocus | null>(null);
  const [memoryCreateRequest, setMemoryCreateRequest] = useState(0);
  const { route, go } = useWorkspaceRoute();
  const view = route.view;
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [storageError, setStorageError] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const allAgents = company.offices.flatMap((o) => o.agents.map((a) => ({ ...a, office: o })));
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
  function openResourceSettings(kind: ResourceSetupKind, engine: Engine) {
    setQuery("");
    setDialog(null);
    if (kind === "context") {
      setMemoryCreateRequest((request) => request + 1);
      go({ view: "memory" });
      return;
    }
    setEngineSettingsFocus((current) => ({
      id: (current?.id || 0) + 1,
      kind,
      engine,
    }));
    go({ view: "settings" });
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
  function confirmStructureDelete(target: StructureTarget) {
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
      const next = deleteStructure(storedCompany, target);
      localStorage.setItem(STORAGE, JSON.stringify(next));
      setCompany(next);
      setDialog(null);
      setDirectoryNotice(
        `${target.kind[0]!.toUpperCase()}${target.kind.slice(1)} deleted. Past run history remains available.`,
      );
    } catch (error) {
      setDirectoryNotice(String(error).replace(/^Error: /, ""));
    }
  }
  function openNewWorkflow(init: NewWorkflowInit = {}) {
    setDialog(null);
    setNewWorkflow({ ...init, key: (newWorkflow?.key || 0) + 1 });
    go({ view: "tasks", taskId: NEW_WORKFLOW });
  }
  async function runWorkflow(task: CompanyTask) {
    const nextCompany = {
      ...company,
      tasks: company.tasks?.some((candidate) => candidate.id === task.id)
        ? company.tasks.map((candidate) => (candidate.id === task.id ? task : candidate))
        : [task, ...(company.tasks || [])],
    };
    upsertTask(task);
    await startLive(await taskRequest(nextCompany, task));
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
    if (result.route) {
      setQuery("");
      go(result.route);
    } else if (result.kind === "project") openProject(result.id);
    else if (result.kind === "office") openCompany();
    else if (result.kind === "task") {
      setQuery("");
      go({ view: "tasks", taskId: result.id });
    } else if (result.kind === "agent") {
      const a = allAgents.find((a) => a.id === result.id);
      if (a) setDialog({ type: "inspect-agent", officeId: a.office.id, agent: a });
    }
  }
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
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dialog]);
  const navigationProps = {
    directory: {
      company: storedCompany,
      selectedChat: route.chatId,
      selectedProject: view === "start" && !route.chatId ? route.projectId : undefined,
      selectedTask: route.taskId || inspectedTask?.id,
      openEntry: openDirectoryEntry,
      createEntry: createDirectoryEntry,
      lifecycle: updateLifecycle,
      editProject: (id: string) => {
        const project = company.projects?.find((p) => p.id === id);
        if (project) setDialog({ type: "project", project });
      },
    },
    openRun: (runKey: string) => {
      setDialog(null);
      if (runKey.startsWith("chat:")) go({ view: "start", chatId: runKey.slice(5) });
      else if (runKey.startsWith("task:")) go({ view: "tasks", taskId: runKey.slice(5) });
    },
    view,
    theme,
    navigate: (next: WorkspaceView) => {
      setDialog(null);
      setView(next);
    },
    find: () => setDialog({ type: "find" }),
    rename: () => setDialog({ type: "rename" }),
    engineSettings: () => {
      setEngineSettingsFocus((current) => ({
        id: (current?.id || 0) + 1,
      }));
      setDialog(null);
      setView("settings");
    },
    help: () => setDialog({ type: "help" }),
    toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
  };
  const group = primaryView(view);
  // The Company map has no heading or tabs: workflows live inside the offices on the map.
  const companyMap = view === "map" || (view === "tasks" && !isWorkflowBuilder);
  const searchLabel =
    view === "engines"
      ? "Search capabilities"
      : view === "memory"
        ? "Search memory"
        : view === "tasks"
          ? "Search workflows"
          : "Search agents and workflows";
  return (
    <div className="company-app" data-theme={theme} data-terminal-open={terminalOpen || undefined}>
      <WorkspaceNavigation {...navigationProps} />
      <div className="co-main">
        <header className="co-topbar">
          <button
            className="co-mobile-menu co-icon-button"
            aria-label="Open navigation"
            onClick={() => setDialog({ type: "navigation" })}
          >
            <Menu size={18} />
          </button>
          <div className="co-breadcrumb">
            <Building2 size={15} />
            <button onClick={openCompany}>{company.name}</button>
            <ChevronRight size={13} />
            <span>
              {route.chatId
                ? "Chat"
                : destinations.find((d) => d.view === group)?.label || viewLabels[view]}
            </span>
          </div>
          <div className="co-top-actions">
            <HelpTip label="About local storage" align="end">
              Company data and history stay on this Mac. Provider requests use the selected engine.
            </HelpTip>
            <button
              aria-label={terminalOpen ? "Close terminal" : "Open terminal"}
              aria-pressed={terminalOpen}
              title="Terminal · Cmd/Ctrl J"
              onClick={() => setTerminalOpen((open) => !open)}
            >
              <SquareTerminal size={17} />
            </button>
          </div>
        </header>
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
          className={`co-content ${companyMap ? "co-map-mode" : view === "start" ? "co-start-mode" : ""} ${isWorkflowBuilder ? "co-workflow-page" : ""}`}
        >
          {view !== "start" && !companyMap && (
            <section className="co-page-heading">
              <div>
                <div className="co-page-title-line">
                  <h1>{isWorkflowBuilder ? "Workflow Builder" : viewLabels[view]}</h1>
                  {descriptions[view] && (
                    <HelpTip
                      label={`About ${isWorkflowBuilder ? "Workflow Builder" : viewLabels[view]}`}
                    >
                      {descriptions[view]}
                    </HelpTip>
                  )}
                </div>
                {isWorkflowBuilder && <p>{isNewWorkflow ? "New workflow" : workflowPage?.title}</p>}
              </div>
            </section>
          )}
          {group === "memory" && (
            <nav className="co-page-tabs" aria-label="Library sections">
              {(["memory", "engines"] as const).map((tab) => (
                <button
                  key={tab}
                  aria-current={view === tab ? "page" : undefined}
                  onClick={() => setView(tab)}
                >
                  {viewLabels[tab]}
                </button>
              ))}
            </nav>
          )}
          {!isWorkflowBuilder && view !== "start" && view !== "settings" && !companyMap && (
            <div className="co-section-toolbar">
              {view === "tasks" && (
                <div className="co-section-title">
                  <span className="co-directory-count">
                    {`${tasks.length} ${tasks.length === 1 ? "workflow" : "workflows"}`}
                  </span>
                </div>
              )}
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
            </div>
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
              lifecycleChat={(chat, lifecycle) => {
                const entry = directoryEntries(storedCompany).find(
                  (candidate) => candidate.kind === "chat" && candidate.id === chat.id,
                );
                if (entry) updateLifecycle(entry, lifecycle);
              }}
            />
          ) : view === "engines" ? (
            <EngineLibrary query={query} />
          ) : view === "settings" ? (
            <EngineSettings focus={engineSettingsFocus} />
          ) : view === "memory" ? (
            <CompanyMemory company={company} query={query} createRequest={memoryCreateRequest} />
          ) : isWorkflowBuilder ? (
            isNewWorkflow ? (
              <div className="co-workflow-builder-shell">
                <TaskForm
                  key={`new:${newWorkflow?.key || 0}`}
                  company={company}
                  existing={undefined}
                  initialDomain={newWorkflow?.domain}
                  initialProjectId={newWorkflow?.projectId}
                  initialAgentId={newWorkflow?.agentId}
                  initialOfficeId={newWorkflow?.officeId}
                  storageError={storageError}
                  openResourceSettings={(task, kind, engine) => {
                    upsertTask(task);
                    openResourceSettings(kind, engine);
                  }}
                  save={(task) => {
                    upsertTask(task);
                    go({ view: "tasks", taskId: task.id });
                  }}
                  start={async (task) => {
                    await runWorkflow(task);
                    go({ view: "tasks", taskId: task.id });
                  }}
                />
              </div>
            ) : workflowPage ? (
              <div className="co-workflow-builder-shell">
                <TaskForm
                  key={workflowPage.id}
                  company={company}
                  existing={workflowPage}
                  initialDomain={undefined}
                  storageError={storageError}
                  openResourceSettings={(task, kind, engine) => {
                    upsertTask(task);
                    openResourceSettings(kind, engine);
                  }}
                  save={upsertTask}
                  start={runWorkflow}
                />
              </div>
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
            <CompanyFloorplan
              company={company}
              query={query}
              editOffice={(o) => setDialog({ type: "edit-office", office: o })}
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
                  ? "Find anything"
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
                                    : "Getting started"
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
                  <strong>Reassign these tasks first</strong>
                  <p>
                    They use this domain or one of the agents as an owner, reviewer, handoff, or
                    canvas block.
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
                <button
                  className="co-button co-button-danger"
                  disabled={
                    structureImpact.blockingTasks.length > 0 || activeStructureRuns.length > 0
                  }
                  onClick={() => confirmStructureDelete(dialog.target)}
                >
                  <Trash2 size={14} /> Delete {dialog.target.kind}
                </button>
              </div>
            </div>
          )}
          {dialog.type === "find" && <QuickFind company={company} choose={chooseResult} />}
          {dialog.type === "navigation" && <WorkspaceNavigation {...navigationProps} mobile />}
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
                changeApproval={(approval) =>
                  setCompany((c) => ({
                    ...c,
                    tasks: (c.tasks || []).map((t) =>
                      t.id === inspectedTask.id ? { ...t, approval } : t,
                    ),
                  }))
                }
                openResourceSettings={openResourceSettings}
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
            <div className="co-guide">
              <p>Six places to find your work. Start small; add structure when you need it.</p>
              {destinations.map((d) => (
                <div key={d.view}>
                  <span>
                    <strong>{d.label}</strong>
                    <p>{d.description}</p>
                  </span>
                  <button
                    className="co-button"
                    onClick={() => {
                      setDialog(null);
                      setView(d.view);
                    }}
                  >
                    Open
                  </button>
                </div>
              ))}
              <div className="co-form-note">
                The Mac app uses your installed Codex or Claude Code CLI and sign-in. Chats are
                read-only; task details show execution and approvals. Some advanced canvas blocks
                remain non-executable and will block a run. Rehearsals are simulations. Library
                discovery reads metadata only.
              </div>
            </div>
          )}
        </CompanyDialog>
      )}
    </div>
  );
}
