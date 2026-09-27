import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react";
import type { Company } from "../features/company/company-model";
import {
  activeCompany,
  directoryEntries,
  type DirectoryEntry,
  type DirectoryKind,
  type Lifecycle,
} from "../features/company/company-directory";
import "./workspace-directory.css";

function Actions({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open || !trigger.current || !popup.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const height = popup.current.offsetHeight;
    const width = popup.current.offsetWidth;
    setPosition({
      left: Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8)),
      top: Math.max(
        8,
        anchor.bottom + height + 8 < window.innerHeight
          ? anchor.bottom + 4
          : anchor.top - height - 4,
      ),
    });
    popup.current.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    const dismiss = () => setOpen(false);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);
  return (
    <div
      className="co-dir-actions"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
        if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const buttons = Array.from(
            popup.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [],
          );
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="co-dir-more"
        aria-label={`${label} actions`}
        title={`${label} actions`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div
          className="co-dir-popup"
          ref={popup}
          style={position}
          role="group"
          aria-label={`${label} actions`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
export type DirectoryProps = {
  company: Company;
  selectedChat?: string | undefined;
  selectedProject?: string | undefined;
  selectedTask?: string | undefined;
  openEntry: (entry: DirectoryEntry) => void;
  createEntry: (kind: DirectoryKind, projectId?: string) => void;
  lifecycle: (entry: DirectoryEntry, state: Lifecycle) => void;
};
export function WorkspaceDirectory({
  company,
  selectedChat,
  selectedProject,
  selectedTask,
  openEntry,
  createEntry,
  lifecycle,
}: DirectoryProps) {
  const [mode, setMode] = useState<Lifecycle>("active");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [limit, setLimit] = useState(20);
  const active = directoryEntries(activeCompany(company));
  const all = directoryEntries(company);
  const matches = (e: DirectoryEntry) => e.title.toLowerCase().includes(query.toLowerCase());
  const projects = active.filter(
    (e) =>
      e.kind === "project" &&
      (matches(e) || active.some((c) => c.projectId === e.id && matches(c))),
  );
  const entries = active.filter((e) => e.kind !== "project" && !e.projectId && matches(e));
  const hidden = all.filter((e) => e.lifecycle === mode && matches(e));
  function switchMode(next: Lifecycle) {
    setMode(next);
    setLimit(20);
    setQuery("");
  }
  function actions(entry: DirectoryEntry) {
    return (
      <Actions label={entry.title}>
        {entry.lifecycle === "active" ? (
          <>
            {entry.kind === "project" && (
              <>
                <button onClick={() => createEntry("chat", entry.id)}>New chat in project</button>
                <button onClick={() => createEntry("task", entry.id)}>New task in project</button>
              </>
            )}
            {entry.kind !== "project" && (
              <button onClick={() => createEntry(entry.kind, entry.projectId)}>
                New {entry.kind}
              </button>
            )}
            <button onClick={() => lifecycle(entry, "archived")}>Archive {entry.kind}</button>
          </>
        ) : (
          <button onClick={() => lifecycle(entry, "active")}>Restore {entry.kind}</button>
        )}
        {entry.lifecycle !== "removed" && (
          <button className="co-dir-danger" onClick={() => lifecycle(entry, "removed")}>
            Remove {entry.kind}…
          </button>
        )}
      </Actions>
    );
  }
  function row(entry: DirectoryEntry) {
    const Icon =
      entry.kind === "chat" ? MessageSquare : entry.kind === "task" ? ClipboardList : FolderOpen;
    const selected =
      entry.kind === "chat"
        ? selectedChat === entry.id
        : entry.kind === "task"
          ? selectedTask === entry.id
          : selectedProject === entry.id;
    return (
      <div className="co-dir-row" key={`${entry.kind}:${entry.id}`}>
        <button
          className="co-dir-item"
          title={entry.title}
          aria-label={`Open ${entry.kind}: ${entry.title}`}
          aria-current={selected ? "page" : undefined}
          disabled={mode !== "active"}
          onClick={() => openEntry(entry)}
        >
          <Icon size={14} />
          <span>{entry.title}</span>
        </button>
        {actions(entry)}
      </div>
    );
  }
  return (
    <section className="co-directory" aria-label="Projects, chats and tasks">
      <header>
        <span>
          {mode === "active" ? "Workspace directory" : mode === "archived" ? "Archived" : "Removed"}
        </span>
        <Actions label="Directory">
          <button onClick={() => createEntry("project")}>New project</button>
          <button onClick={() => createEntry("chat")}>New chat</button>
          <button onClick={() => createEntry("task")}>New task</button>
          <hr />
          <button onClick={() => switchMode("active")}>Active items</button>
          <button onClick={() => switchMode("archived")}>Archived items</button>
          <button onClick={() => switchMode("removed")}>Removed items</button>
        </Actions>
      </header>
      <input
        className="co-dir-search"
        aria-label="Filter directory"
        placeholder="Find a chat, task, project…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(20);
        }}
      />
      {mode !== "active" ? (
        <>
          <button className="co-dir-back" onClick={() => switchMode("active")}>
            ← Active workspace
          </button>
          <p className="co-dir-note">
            {mode === "removed"
              ? "Recoverable removal. Files and Activity history are kept."
              : "Restore items whenever you need them. Project archives include their chats and tasks."}
          </p>
          {hidden.slice(0, limit).map(row)}
          {!hidden.length && <p className="co-dir-note">No {mode} items.</p>}
          {hidden.length > limit && (
            <button className="co-dir-back" onClick={() => setLimit(limit + 20)}>
              Show more
            </button>
          )}
        </>
      ) : (
        <>
          <div className="co-dir-section-title">
            <span>Projects</span>
          </div>
          {projects.map((project) => {
            const open = !collapsed.includes(project.id) || !!query;
            const children = active.filter(
              (e) => e.projectId === project.id && (matches(e) || matches(project)),
            );
            return (
              <div className="co-dir-project" key={project.id}>
                <div className="co-dir-row">
                  <button
                    className="co-dir-chevron"
                    aria-label={`${open ? "Collapse" : "Expand"} ${project.title}`}
                    aria-expanded={open}
                    onClick={() =>
                      setCollapsed((c) =>
                        open ? [...c, project.id] : c.filter((id) => id !== project.id),
                      )
                    }
                  >
                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  <button
                    className="co-dir-item"
                    title={project.title}
                    aria-label={`Open project: ${project.title}`}
                    aria-current={selectedProject === project.id ? "page" : undefined}
                    onClick={() => openEntry(project)}
                  >
                    <FolderOpen size={14} />
                    <span>{project.title}</span>
                  </button>
                  {actions(project)}
                </div>
                {open && (
                  <div className="co-dir-children">
                    {children.slice(0, limit).map(row)}
                    {!children.length && (
                      <button
                        className="co-dir-empty"
                        onClick={() => createEntry("chat", project.id)}
                      >
                        + Start a chat
                      </button>
                    )}
                    {children.length > limit && (
                      <button className="co-dir-back" onClick={() => setLimit(limit + 20)}>
                        Show more
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!projects.length && (
            <p className="co-dir-note">{query ? "No matching projects." : "No projects."}</p>
          )}
          <div className="co-dir-section-title">
            <span>Chats & tasks</span>
            <Actions label="Chats and tasks">
              <button onClick={() => createEntry("chat")}>New chat</button>
              <button onClick={() => createEntry("task")}>New task</button>
            </Actions>
          </div>
          {entries.slice(0, limit).map(row)}
          {!entries.length && (
            <p className="co-dir-note">{query ? "No matching items." : "No chats or tasks."}</p>
          )}
          {entries.length > limit && (
            <button className="co-dir-back" onClick={() => setLimit(limit + 20)}>
              Show more
            </button>
          )}
          <button className="co-dir-back" onClick={() => switchMode("archived")}>
            <Archive size={12} /> Archived
          </button>
        </>
      )}
    </section>
  );
}
