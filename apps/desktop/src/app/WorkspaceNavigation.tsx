import {
  Activity,
  AudioLines,
  BookOpen,
  Building2,
  CircleHelp,
  ClipboardList,
  MessageSquare,
  Moon,
  Search,
  Settings2,
  Sun,
} from "lucide-react";
import { destinations, primaryView, type WorkspaceView } from "./navigation";
import { isActiveRun, useLiveRuntime } from "../features/engines/live-runtime";
import { WorkspaceDirectory, type DirectoryProps } from "./WorkspaceDirectory";
const icons = {
  start: MessageSquare,
  tasks: ClipboardList,
  map: Building2,
  activity: Activity,
  memory: BookOpen,
};

export function WorkspaceNavigation({
  view,
  companyName,
  theme,
  navigate,
  find,
  rename,
  help,
  toggleTheme,
  mobile = false,
  directory,
}: {
  view: WorkspaceView;
  companyName: string;
  theme: "light" | "dark";
  navigate: (view: WorkspaceView) => void;
  find: () => void;
  rename: () => void;
  help: () => void;
  toggleTheme: () => void;
  mobile?: boolean;
  directory: DirectoryProps;
}) {
  const live = useLiveRuntime();
  const pending = live.runs.reduce((n, r) => n + r.approvals.length, 0);
  const active = live.runs.filter(isActiveRun).length;
  return (
    <aside className={`co-sidebar ${mobile ? "co-mobile-navigation" : ""}`}>
      <button className="co-brand" onClick={() => navigate("start")} aria-label="AgentOS home">
        <AudioLines size={25} />
        AgentOS<span className="co-alpha">alpha</span>
      </button>
      <button className="co-workspace-name" onClick={rename} title="Rename company">
        <Building2 size={15} />
        <span>{companyName}</span>
      </button>
      <button
        className="co-find-trigger"
        onClick={find}
        aria-label="Find anything in workspace"
        title="Find anything · Cmd/Ctrl K"
      >
        <Search size={16} />
        <span>Find anything</span>
        <kbd>⌘ K</kbd>
      </button>
      <nav aria-label="Workspace">
        {destinations.map((d) => {
          const Icon = icons[d.view];
          return (
            <button
              key={d.view}
              title={`${d.label} · ${d.description}`}
              aria-label={d.label}
              aria-current={
                primaryView(view) === d.view && !directory.selectedChat ? "page" : undefined
              }
              className={primaryView(view) === d.view && !directory.selectedChat ? "selected" : ""}
              onClick={() => navigate(d.view)}
            >
              <Icon size={18} />
              <span>{d.label}</span>
              {d.view === "activity" && (pending > 0 || active > 0) && (
                <b
                  className="co-nav-count"
                  aria-label={pending ? `${pending} approvals needed` : `${active} active runs`}
                >
                  {pending || active}
                </b>
              )}
            </button>
          );
        })}
      </nav>
      <WorkspaceDirectory {...directory} />
      <div className="co-sidebar-bottom">
        {(pending > 0 || active > 0 || !live.native) && (
          <button
            className="co-sidebar-status"
            onClick={() => navigate(pending || active ? "activity" : "engines")}
          >
            {pending
              ? `${pending} approval${pending === 1 ? "" : "s"} needed`
              : active
                ? `${active} active run${active === 1 ? "" : "s"}`
                : live.native
                  ? "Local engines · Connection settings"
                  : "Browser preview · Open Mac app"}
          </button>
        )}
        <details
          className="co-workspace-settings"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              event.currentTarget.open = false;
          }}
        >
          <summary>
            <Settings2 size={16} /> Settings & help
          </summary>
          <div onClick={(event) => event.currentTarget.parentElement?.removeAttribute("open")}>
            <button className="co-help" onClick={() => navigate("engines")}>
              <Settings2 size={16} />
              <span>Engines & notifications</span>
            </button>
            <button className="co-help" onClick={help}>
              <CircleHelp size={16} />
              <span>Getting started</span>
            </button>
            <button
              className="co-theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
              <span>{theme === "light" ? "Dark appearance" : "Light appearance"}</span>
            </button>
          </div>
        </details>
      </div>
    </aside>
  );
}
