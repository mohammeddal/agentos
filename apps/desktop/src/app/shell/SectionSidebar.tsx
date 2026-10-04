import { useState } from "react";
import {
  Archive,
  BookOpen,
  Building2,
  ChevronRight,
  GitBranch,
  Plug,
  Plus,
  Search,
} from "lucide-react";
import type { Company, CompanyChat, CompanyTask } from "../../features/company/company-model";
import { workflowOfficeId } from "../../features/company/company-map-state";
import {
  directoryEntries,
  type DirectoryEntry,
  type Lifecycle,
} from "../../features/company/company-directory";
import { isActiveRun, useLiveRuntime, type LiveRun } from "../../features/engines/live-runtime";
import { Actions } from "../WorkspaceDirectory";
import type { WorkspaceRoute, WorkspaceView } from "../navigation";

export type ActivityFilter = "needs" | "running" | "finished" | "failed" | "all";
export const activityFilters: { id: ActivityFilter; label: string }[] = [
  { id: "needs", label: "Needs you" },
  { id: "running", label: "Running" },
  { id: "finished", label: "Finished" },
  { id: "failed", label: "Failed" },
  { id: "all", label: "All runs" },
];
/** Runs the user sees in Activity; copilot design chats are internal. */
export const userRuns = (runs: LiveRun[]) =>
  runs.filter((r) => !r.request.key.startsWith("copilot:"));
export function matchesFilter(run: LiveRun, filter: ActivityFilter) {
  if (filter === "needs") return run.approvals.length > 0;
  if (filter === "running") return isActiveRun(run);
  if (filter === "finished") return run.status === "completed";
  if (filter === "failed") return run.status === "failed";
  return true;
}

function statusOf(runs: LiveRun[], key: string) {
  const latest = runs
    .filter((r) => r.request.key === key)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latest) return undefined;
  if (latest.approvals.length) return "approval";
  if (isActiveRun(latest)) return "working";
  return latest.status === "failed" ? "failed" : latest.status === "completed" ? "done" : undefined;
}

function dayGroup(at: string): string {
  const date = new Date(at);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const time = date.getTime();
  if (time >= start) return "Today";
  if (time >= start - 86_400_000) return "Yesterday";
  if (time >= start - 6 * 86_400_000) return "Previous 7 days";
  return "Older";
}

/** Company-wide or one project: filters what the sidebars list and where new work goes. */
function ScopeSwitcher({
  company,
  scope,
  setScope,
  newProject,
  editProject,
}: {
  company: Company;
  scope: string;
  setScope: (id: string) => void;
  newProject: () => void;
  editProject: (id: string) => void;
}) {
  return (
    <div className="sh-scope">
      <select
        aria-label="Scope"
        value={scope}
        onChange={(event) =>
          event.target.value === "__new" ? newProject() : setScope(event.target.value)
        }
      >
        <option value="">{company.name} · all work</option>
        {(company.projects || []).map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
        <option value="__new">+ New project…</option>
      </select>
      {scope && (
        <button className="sh-link" onClick={() => editProject(scope)}>
          Edit
        </button>
      )}
    </div>
  );
}

type SidebarProps = {
  view: WorkspaceView;
  route: WorkspaceRoute;
  company: Company;
  storedCompany: Company;
  scope: string;
  setScope: (id: string) => void;
  newProject: () => void;
  editProject: (id: string) => void;
  go: (route: WorkspaceRoute) => void;
  newWorkflow: (officeId?: string) => void;
  focusOffice: (officeId: string) => void;
  newChat: () => void;
  lifecycle: (entry: DirectoryEntry, lifecycle: Lifecycle) => void;
  activityFilter: ActivityFilter;
  setActivityFilter: (filter: ActivityFilter) => void;
};

export function SectionSidebar(props: SidebarProps) {
  const { view } = props;
  if (view === "settings" || view === "tasks") return null;
  return (
    <aside className="sh-sidebar" aria-label="Section">
      {(view === "map" || view === "start") && (
        <ScopeSwitcher
          company={props.company}
          scope={props.scope}
          setScope={props.setScope}
          newProject={props.newProject}
          editProject={props.editProject}
        />
      )}
      {view === "map" && <HomeList {...props} />}
      {view === "start" && <ChatList {...props} />}
      {(view === "activity" || view === "inbox") && <ActivityList {...props} />}
      {(view === "memory" || view === "engines") && (
        <div className="sh-group">
          <h4>Library</h4>
          <button
            className="sh-row"
            aria-current={view === "memory" || undefined}
            onClick={() => props.go({ view: "memory" })}
          >
            <BookOpen size={14} /> <span>Memory</span>
          </button>
          <button
            className="sh-row"
            aria-current={view === "engines" || undefined}
            onClick={() => props.go({ view: "engines" })}
          >
            <Plug size={14} /> <span>Capabilities</span>
          </button>
        </div>
      )}
    </aside>
  );
}

function RowMenu({
  entry,
  lifecycle,
}: {
  entry: DirectoryEntry | undefined;
  lifecycle: SidebarProps["lifecycle"];
}) {
  if (!entry) return null;
  return (
    <Actions label={`Actions for ${entry.title}`}>
      <button onClick={() => lifecycle(entry, "archived")}>Archive</button>
      <button className="co-dir-danger" onClick={() => lifecycle(entry, "removed")}>
        Delete
      </button>
    </Actions>
  );
}

function HomeList({
  focusOffice,
  company,
  scope,
  route,
  go,
  newWorkflow,
  lifecycle,
  storedCompany,
}: SidebarProps) {
  const live = useLiveRuntime();
  const [closed, setClosed] = useState<string[]>([]);
  const entries = directoryEntries(storedCompany);
  const tasks = (company.tasks || []).filter((t) => !scope || t.projectId === scope);
  const groups: { id: string; name: string; tasks: CompanyTask[] }[] = [
    ...company.offices.map((office) => ({
      id: office.id,
      name: office.name,
      tasks: tasks.filter((t) => workflowOfficeId(company, t) === office.id),
    })),
    {
      id: "",
      name: "Other workflows",
      tasks: tasks.filter(
        (t) => !company.offices.some((o) => o.id === workflowOfficeId(company, t)),
      ),
    },
  ].filter((group) => group.id || group.tasks.length);
  return (
    <div className="sh-group sh-scroll">
      <div className="sh-group-head">
        <h4>Offices & workflows</h4>
        <button aria-label="New workflow" title="New workflow" onClick={() => newWorkflow()}>
          <Plus size={14} />
        </button>
      </div>
      {groups.map((group) => {
        const open = !closed.includes(group.id);
        return (
          <div key={group.id || "other"} className="sh-tree">
            <div className="sh-row-wrap">
              <button
                className="sh-caret-button"
                aria-label={open ? `Collapse ${group.name}` : `Expand ${group.name}`}
                aria-expanded={open}
                onClick={() =>
                  setClosed((list) =>
                    open ? [...list, group.id] : list.filter((id) => id !== group.id),
                  )
                }
              >
                <ChevronRight size={12} className="sh-caret" />
              </button>
              <button
                className="sh-row sh-row-parent"
                title={group.id ? "Show on the map" : undefined}
                onClick={() => group.id && focusOffice(group.id)}
              >
                <Building2 size={14} />
                <span>{group.name}</span>
                <small>{group.tasks.length || ""}</small>
              </button>
              {group.id && (
                <button
                  className="sh-row-add-icon"
                  aria-label={`New workflow in ${group.name}`}
                  title="New workflow"
                  onClick={() => newWorkflow(group.id)}
                >
                  <Plus size={13} />
                </button>
              )}
            </div>
            {open &&
              group.tasks.map((task) => (
                <div key={task.id} className="sh-row-wrap">
                  <button
                    className="sh-row sh-row-child"
                    aria-current={route.taskId === task.id || undefined}
                    onClick={() => go({ view: "tasks", taskId: task.id })}
                  >
                    <GitBranch size={13} />
                    <span>{task.title}</span>
                    <i data-state={statusOf(live.runs, `task:${task.id}`)} />
                  </button>
                  <RowMenu
                    entry={entries.find((e) => e.kind === "task" && e.id === task.id)}
                    lifecycle={lifecycle}
                  />
                </div>
              ))}
          </div>
        );
      })}
      <ArchivedLink
        storedCompany={storedCompany}
        lifecycle={lifecycle}
        kinds={["task", "project"]}
      />
    </div>
  );
}

function ChatList({ company, scope, route, go, newChat, lifecycle, storedCompany }: SidebarProps) {
  const live = useLiveRuntime();
  const [query, setQuery] = useState("");
  const entries = directoryEntries(storedCompany);
  const chats = (company.chats || [])
    .filter((c) => !scope || c.projectId === scope)
    .filter((c) =>
      c.messages
        .map((m) => m.text)
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        Date.parse(b.messages.at(-1)?.createdAt || b.createdAt) -
        Date.parse(a.messages.at(-1)?.createdAt || a.createdAt),
    );
  const groups = new Map<string, CompanyChat[]>();
  for (const chat of chats) {
    const group = dayGroup(chat.messages.at(-1)?.createdAt || chat.createdAt);
    groups.set(group, [...(groups.get(group) || []), chat]);
  }
  return (
    <div className="sh-group sh-scroll">
      <button className="sh-primary" onClick={newChat}>
        <Plus size={14} /> New chat
      </button>
      <label className="sh-search">
        <Search size={13} />
        <input
          aria-label="Search chats"
          placeholder="Search chats"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {[...groups].map(([group, list]) => (
        <div key={group}>
          <h4>{group}</h4>
          {list.map((chat) => (
            <div key={chat.id} className="sh-row-wrap">
              <button
                className="sh-row"
                aria-current={route.chatId === chat.id || undefined}
                onClick={() => go({ view: "start", chatId: chat.id })}
              >
                <span>{chat.messages[0]?.text || "New chat"}</span>
                <i data-state={statusOf(live.runs, `chat:${chat.id}`)} />
              </button>
              <RowMenu
                entry={entries.find((e) => e.kind === "chat" && e.id === chat.id)}
                lifecycle={lifecycle}
              />
            </div>
          ))}
        </div>
      ))}
      {!chats.length && (
        <p className="sh-empty">{query ? "No matching chats." : "No chats yet."}</p>
      )}
      <ArchivedLink storedCompany={storedCompany} lifecycle={lifecycle} kinds={["chat"]} />
    </div>
  );
}

function ActivityList({ activityFilter, setActivityFilter }: SidebarProps) {
  const live = useLiveRuntime();
  const runs = userRuns(live.runs);
  return (
    <div className="sh-group">
      <h4>Activity</h4>
      {activityFilters.map((filter) => {
        const count =
          filter.id === "needs"
            ? runs.reduce((n, r) => n + r.approvals.length, 0)
            : runs.filter((r) => matchesFilter(r, filter.id)).length;
        return (
          <button
            key={filter.id}
            className="sh-row"
            aria-current={activityFilter === filter.id || undefined}
            onClick={() => setActivityFilter(filter.id)}
          >
            <span>{filter.label}</span>
            <small data-alert={(filter.id === "needs" && count > 0) || undefined}>
              {count || ""}
            </small>
          </button>
        );
      })}
    </div>
  );
}

/** Archived and deleted items, restorable in place. */
function ArchivedLink({
  storedCompany,
  lifecycle,
  kinds,
}: {
  storedCompany: Company;
  lifecycle: SidebarProps["lifecycle"];
  kinds: DirectoryEntry["kind"][];
}) {
  const [open, setOpen] = useState(false);
  const hidden = directoryEntries(storedCompany).filter(
    (e) => kinds.includes(e.kind) && e.lifecycle !== "active",
  );
  if (!hidden.length) return null;
  return (
    <div className="sh-archived">
      <button className="sh-row" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Archive size={13} /> <span>Archived & deleted</span> <small>{hidden.length}</small>
      </button>
      {open &&
        hidden.map((entry) => (
          <div key={`${entry.kind}:${entry.id}`} className="sh-row-wrap">
            <span className="sh-row sh-row-child" title={entry.title}>
              <span>{entry.title}</span>
              <small>{entry.lifecycle}</small>
            </span>
            <button className="sh-link" onClick={() => lifecycle(entry, "active")}>
              Restore
            </button>
          </div>
        ))}
    </div>
  );
}
