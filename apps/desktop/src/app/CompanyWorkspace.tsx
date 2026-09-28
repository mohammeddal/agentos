import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Building2,
  ChevronRight,
  Menu,
  Pencil,
  Plus,
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
import { OfficeCard } from "../features/company/CompanyDirectory";
import {
  deleteStructure,
  structureDeletion,
  type StructureTarget,
} from "../features/company/company-structure";
import { AgentForm, OfficeForm, RenameForm } from "../features/company/CompanyForms";
import { CompanyDialog } from "../shared/CompanyDialog";
import { HelpTip } from "../shared/HelpTip";
import { CompanyTasks, TaskForm } from "../features/tasks/CompanyTasks";
import { CompanyActivity } from "../features/activity/CompanyActivity";
import { CompanyMemory } from "../features/memory/CompanyMemory";
import { EngineLibrary } from "../features/engines/EngineLibrary";
import { EngineSettings, type EngineSettingsFocus } from "../features/engines/EngineSettings";
import { AgentActivity } from "../features/activity/AgentActivity";
import { CompanyProjects, ProjectForm } from "../features/projects/CompanyProjects";
import { CompanyStart } from "../features/start/CompanyStart";
import { emptyPrompt, PROMPT_STORAGE } from "../features/start/prompt-composer";
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
  type DirectoryEntry,
  type DirectoryKind,
  type Lifecycle,
} from "../features/company/company-directory";
import { useLiveNotifications } from "../features/engines/live-notifications";
import { activityAcknowledgementTokens } from "../features/activity/activity-badge";
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
  | {
      type: "task";
      task?: CompanyTask;
      domain?: string | undefined;
      projectId?: string | undefined;
      agentId?: string | undefined;
    }
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
  tasks: "Plan work, choose a team, and build a workflow.",
  projects: "Keep teams, tasks, and directories together.",
  map: "Your offices and the agents working in them.",
  offices: "Organize teams into dedicated spaces.",
  agents: "Find a specialist and inspect their work.",
  activity: "See what’s running, what needs you, and what finished.",
  memory: "Facts, lessons, and context worth keeping.",
  engines: "Discover the tools and skills already available locally.",
  settings: "Manage local engines, project discovery, and notifications.",
};

export function CompanyWorkspace() {
  useLiveSchedules();
  useLiveNotifications();
  const [storedCompany, setCompany] = useState<Company>(initialCompany);
  const company = activeCompany(storedCompany);
  const live = useLiveRuntime();
  const [directoryNotice, setDirectoryNotice] = useState("");
  const [activityKey, setActivityKey] = useState("");
  const [acknowledgedActivity, setAcknowledgedActivity] = useState<Set<string>>(() => new Set());
  const [composerVersion, setComposerVersion] = useState(0);
  const [theme, setTheme] = useState(initialTheme);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [engineSettingsFocus, setEngineSettingsFocus] = useState<EngineSettingsFocus | null>(null);
  const [memoryCreateRequest, setMemoryCreateRequest] = useState(0);
  const { route, go } = useWorkspaceRoute();
  const view = route.view,
    selectedOffice = route.officeId || null,
    selectedProject = route.projectId || "";
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [storageError, setStorageError] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const createMenu = useRef<HTMLDetailsElement>(null);
  const office = company.offices.find((o) => o.id === selectedOffice);
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
  const filteredOffices = company.offices.filter((o) =>
    `${o.name} ${o.domain} ${o.agents.map((a) => a.name).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const filteredAgents = allAgents.filter(
    (a) =>
      (!office || a.office.id === office.id) &&
      `${a.name} ${a.role} ${a.office.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  function setView(next: WorkspaceView) {
    setQuery("");
    go({ view: next });
  }
  function navigate(id: string | null) {
    setQuery("");
    go(id ? { view: "offices", officeId: id } : { view: "map" });
  }
  function setSelectedProject(id: string) {
    go({ view: "projects", projectId: id });
  }
  function openProject(id: string) {
    setQuery("");
    setSelectedProject(id);
    setDialog(null);
  }
  function openActivity(runKey = "") {
    setAcknowledgedActivity(
      (seen) => new Set([...seen, ...activityAcknowledgementTokens(live.runs)]),
    );
    setActivityKey(runKey);
    setDialog(null);
    setView("activity");
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
    else {
      setView("tasks");
      setDialog({ type: "inspect-task", taskId: entry.id });
    }
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
    } else if (kind === "task") setDialog({ type: "task", projectId });
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
        `${entry.kind === "project" ? "Project" : entry.kind === "chat" ? "Chat" : "Task"} ${lifecycle === "active" ? "restored. Schedules stay paused." : `${lifecycle}. Files and Activity history are kept.`}`,
      );
      if (lifecycle !== "active") {
        const keys = affectedRunKeys(storedCompany, entry);
        if (
          (route.chatId && keys.includes(`chat:${route.chatId}`)) ||
          (route.projectId === entry.id && entry.kind === "project")
        )
          go({ view: "start" });
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
      if (selectedOffice && impact.officeIds.includes(selectedOffice)) go({ view: "offices" });
      setDirectoryNotice(
        `${target.kind[0]!.toUpperCase()}${target.kind.slice(1)} deleted. Historical Activity remains available.`,
      );
    } catch (error) {
      setDirectoryNotice(String(error).replace(/^Error: /, ""));
    }
  }
  function addAgent() {
    setDialog(
      office || company.offices[0]
        ? { type: "agent", officeId: (office || company.offices[0])!.id }
        : { type: "office" },
    );
  }
  function create(type: "task" | "project" | "office" | "agent") {
    if (createMenu.current) createMenu.current.open = false;
    if (type === "agent") addAgent();
    else if (type === "task") setDialog({ type, domain: office?.domain });
    else setDialog({ type });
  }
  function chooseResult(result: FindResult) {
    setDialog(null);
    if (result.route) {
      setQuery("");
      go(result.route);
    } else if (result.kind === "project") openProject(result.id);
    else if (result.kind === "office") navigate(result.id);
    else if (result.kind === "task") {
      setView("tasks");
      setDialog({ type: "inspect-task", taskId: result.id });
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
    const closeMenu = (event: PointerEvent) => {
      const menu = createMenu.current;
      if (menu && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);
  useEffect(() => {
    if (createMenu.current) createMenu.current.open = false;
  }, [view, selectedOffice]);
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
      selectedProject: view === "projects" ? selectedProject : undefined,
      selectedTask: inspectedTask?.id,
      openEntry: openDirectoryEntry,
      createEntry: createDirectoryEntry,
      lifecycle: updateLifecycle,
    },
    acknowledgedActivity,
    view,
    theme,
    navigate: (next: WorkspaceView) => {
      if (next === "activity") {
        setActivityKey("");
        setAcknowledgedActivity(
          (seen) => new Set([...seen, ...activityAcknowledgementTokens(live.runs)]),
        );
      }
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
  const primary =
    office || view === "agents"
      ? { type: "agent" as const, label: "New agent" }
      : view === "tasks"
        ? { type: "task" as const, label: "New task" }
        : view === "offices"
          ? { type: "office" as const, label: "New office" }
          : null;
  const searchLabel =
    office || view === "agents"
      ? "Search agents"
      : view === "projects"
        ? "Search projects"
        : view === "engines"
          ? "Search capabilities"
          : view === "memory"
            ? "Search memory"
            : view === "activity"
              ? "Search activity"
              : view === "tasks"
                ? "Search tasks"
                : "Search offices";
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
            <button onClick={() => navigate(null)}>{company.name}</button>
            <ChevronRight size={13} />
            <span>
              {route.chatId
                ? "Chat"
                : office?.name ||
                  destinations.find((d) => d.view === group)?.label ||
                  viewLabels[view]}
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
            <button
              aria-label="Find anything"
              title="Find anything · Cmd/Ctrl K"
              onClick={() => setDialog({ type: "find" })}
            >
              <Search size={17} />
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
          className={`co-content ${!office && view === "map" ? "co-map-mode" : !office && view === "start" ? "co-start-mode" : ""}`}
        >
          {selectedOffice && !office && (
            <p className="co-form-error">
              This office is no longer available. Choose an office below.
            </p>
          )}
          {(office || (view !== "start" && view !== "projects")) && (
            <section className="co-page-heading">
              <div>
                {office && (
                  <button className="co-back" onClick={() => setView("offices")}>
                    <ArrowLeft size={13} />
                    All offices
                  </button>
                )}
                <div className="co-page-title-line">
                  <h1>{office?.name || viewLabels[view]}</h1>
                  {!office && descriptions[view] && (
                    <HelpTip label={`About ${viewLabels[view]}`}>{descriptions[view]}</HelpTip>
                  )}
                </div>
                {office && (
                  <p>
                    {office.agents.length} {office.agents.length === 1 ? "agent" : "agents"}
                  </p>
                )}
              </div>
              {(primary || view === "map") && (
                <div className="co-create-actions">
                  {primary && (
                    <button
                      className="co-button co-button-primary"
                      onClick={() => create(primary.type)}
                    >
                      <Plus size={15} />
                      {primary.label}
                    </button>
                  )}
                  {view === "map" && (
                    <details
                      className="co-create-menu"
                      ref={createMenu}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.currentTarget.open = false;
                          e.currentTarget.querySelector("summary")?.focus();
                        }
                      }}
                    >
                      <summary className="co-button">Create…</summary>
                      <div>
                        {(["task", "project", "office", "agent"] as const).map((type) => (
                          <button key={type} onClick={() => create(type)}>
                            New {type}
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </section>
          )}
          {!office && group === "map" && (
            <nav className="co-page-tabs" aria-label="Company sections">
              {(["map", "offices", "agents"] as const).map((tab) => (
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
          {(office || (view !== "start" && view !== "projects" && view !== "settings")) && (
            <div className="co-section-toolbar">
              {(office || ["tasks", "projects"].includes(view) || group === "map") && (
                <div className="co-section-title">
                  <span className="co-directory-count">
                    {office
                      ? `${office.agents.length} agents`
                      : view === "tasks"
                        ? `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`
                        : view === "projects"
                          ? `${company.projects?.length || 0} projects`
                          : group === "map"
                            ? `${company.offices.length} offices · ${allAgents.length} agents`
                            : "Saved on this device"}
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
              {office && (
                <button
                  className="co-icon-button"
                  aria-label="Edit office"
                  onClick={() => setDialog({ type: "edit-office", office })}
                >
                  <Pencil size={15} />
                </button>
              )}
            </div>
          )}
          {!office && view === "start" ? (
            <CompanyStart
              key={route.chatId || `new:${route.projectId || "company"}:${composerVersion}`}
              selectedChatId={route.chatId}
              initialProjectId={route.projectId}
              openChat={(chatId) => go({ view: "start", chatId })}
              company={company}
              change={setCompany}
              editTask={(task) => setDialog({ type: "inspect-task", taskId: task.id })}
            />
          ) : !office && view === "projects" ? (
            <CompanyProjects
              company={company}
              selectedId={selectedProject}
              select={setSelectedProject}
              edit={(project) => setDialog({ type: "project", project })}
              createTask={(projectId, domain, agentId) =>
                setDialog({ type: "task", projectId, domain, agentId })
              }
              editTask={(task) => setDialog({ type: "inspect-task", taskId: task.id })}
              inspectAgent={(id) => {
                const a = allAgents.find((a) => a.id === id);
                if (a) setDialog({ type: "inspect-agent", officeId: a.office.id, agent: a });
              }}
            />
          ) : !office && view === "engines" ? (
            <EngineLibrary query={query} />
          ) : !office && view === "settings" ? (
            <EngineSettings focus={engineSettingsFocus} />
          ) : !office && view === "memory" ? (
            <CompanyMemory company={company} query={query} createRequest={memoryCreateRequest} />
          ) : !office && view === "activity" ? (
            <CompanyActivity
              runKey={activityKey}
              clearRunKey={() => setActivityKey("")}
              company={company}
              query={query}
            />
          ) : !office && view === "tasks" ? (
            <CompanyTasks
              company={company}
              query={query}
              edit={(task) => setDialog({ type: "inspect-task", taskId: task.id })}
            />
          ) : !office && view === "map" ? (
            <CompanyFloorplan
              company={company}
              query={query}
              openOffice={navigate}
              addOffice={() => setDialog({ type: "office" })}
              addAgent={(officeId) => setDialog({ type: "agent", officeId })}
              inspectAgent={(officeId, agent) =>
                setDialog({ type: "inspect-agent", officeId, agent })
              }
              editAgent={(officeId, agent) => setDialog({ type: "agent", officeId, agent })}
            />
          ) : office || view === "agents" ? (
            <div className="co-agent-grid">
              {filteredAgents.map((a) => (
                <button
                  className={`co-agent-card tone-${a.office.color}`}
                  key={a.id}
                  aria-label={`Inspect ${a.name}`}
                  onClick={() =>
                    setDialog({ type: "inspect-agent", officeId: a.office.id, agent: a })
                  }
                >
                  <span className="co-agent-card-avatar">
                    <Bot size={23} />
                  </span>
                  <span className="co-agent-card-body">
                    <strong>{a.name}</strong>
                    <span>{a.role}</span>
                    <small>{a.office.name}</small>
                  </span>
                  <Pencil size={13} />
                  <footer>
                    <span>{a.engine}</span>
                    <span className="co-idle-dot">Not connected</span>
                  </footer>
                </button>
              ))}
              {!query && !filteredAgents.length && (
                <p className="co-search-empty">No agents yet.</p>
              )}
              {query && !filteredAgents.length && (
                <p className="co-search-empty">No agents match “{query}”.</p>
              )}
            </div>
          ) : (
            <div className="co-office-grid">
              {filteredOffices.map((o, index) => (
                <OfficeCard
                  key={o.id}
                  office={o}
                  index={index}
                  onOpen={() => navigate(o.id)}
                  onAdd={() => setDialog({ type: "agent", officeId: o.id })}
                  onEdit={() => setDialog({ type: "edit-office", office: o })}
                />
              ))}
              {!query && !filteredOffices.length && (
                <p className="co-search-empty">No offices yet.</p>
              )}
              {query && !filteredOffices.length && (
                <p className="co-search-empty">No offices match “{query}”.</p>
              )}
            </div>
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
          expanded={dialog.type === "canvas" || dialog.type === "task"}
          wide={
            dialog.type === "inspect-task" ||
            dialog.type === "project" ||
            dialog.type === "task" ||
            dialog.type === "inspect-agent" ||
            dialog.type === "agent"
          }
          title={
            dialog.type === "remove-entry"
              ? `Remove ${dialog.entry.kind}?`
              : dialog.type === "delete-structure"
                ? `Delete ${dialog.target.kind}?`
                : dialog.type === "find"
                  ? "Find anything"
                  : dialog.type === "navigation"
                    ? "Workspace"
                    : dialog.type === "canvas"
                      ? `${inspectedTask?.title || "Task"} · Workflow map`
                      : dialog.type === "inspect-task"
                        ? inspectedTask?.title || "Task unavailable"
                        : dialog.type === "project"
                          ? dialog.project
                            ? "Edit project"
                            : "Create a project"
                          : dialog.type === "inspect-agent"
                            ? `${dialog.agent.name} · Activity`
                            : dialog.type === "task"
                              ? dialog.task
                                ? "Edit task"
                                : "Create a task"
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
                Remove “{dialog.entry.title.slice(0, 120)}” from your workspace?{" "}
                {dialog.entry.kind === "project"
                  ? "Its chats and tasks will be hidden with it."
                  : ""}
              </p>
              <p>
                You can restore it from Directory → Removed items. Files and Activity history are
                kept. Affected schedules will be paused.
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
                Remove {dialog.entry.kind}
              </button>
            </div>
          )}
          {dialog.type === "delete-structure" && structureImpact && (
            <div className="co-form co-delete-structure">
              <p>
                Permanently delete “{structureImpact.label}”? This cannot be undone. Historical
                Activity, memory, and project files are kept.
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
                  <p>Finish or cancel the active work from Activity before deleting.</p>
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
                edit={() => setDialog({ type: "task", task: inspectedTask })}
                activity={() => openActivity()}
              />
            ) : (
              <p className="co-form">This task is no longer available.</p>
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
              <p className="co-form">This task is no longer available.</p>
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
          {dialog.type === "task" && (
            <TaskForm
              company={company}
              existing={dialog.task}
              initialDomain={dialog.domain}
              initialProjectId={dialog.projectId}
              initialAgentId={dialog.agentId}
              storageError={storageError}
              openResourceSettings={(task, kind, engine) => {
                upsertTask(task);
                openResourceSettings(kind, engine);
              }}
              save={(task) => {
                upsertTask(task);
                setDialog({ type: "inspect-task", taskId: task.id });
              }}
              start={async (task) => {
                const nextCompany = {
                  ...company,
                  tasks: company.tasks?.some((candidate) => candidate.id === task.id)
                    ? company.tasks.map((candidate) =>
                        candidate.id === task.id ? task : candidate,
                      )
                    : [task, ...(company.tasks || [])],
                };
                upsertTask(task);
                await startLive(await taskRequest(nextCompany, task));
                setDialog({ type: "inspect-task", taskId: task.id });
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
