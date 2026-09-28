import {
  AudioLines,
  BookOpen,
  Building2,
  CircleHelp,
  MessageSquare,
  Moon,
  Search,
  Settings2,
  Sun,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { destinations, primaryView, type WorkspaceView } from "./navigation";
import { isActiveRun, useLiveRuntime } from "../features/engines/live-runtime";
import { WorkspaceDirectory, type DirectoryProps } from "./WorkspaceDirectory";
const icons = {
  start: MessageSquare,
  map: Building2,
  memory: BookOpen,
};

export function WorkspaceNavigation({
  view,
  theme,
  navigate,
  find,
  rename,
  engineSettings,
  help,
  toggleTheme,
  mobile = false,
  directory,
  openRun,
}: {
  view: WorkspaceView;
  theme: "light" | "dark";
  navigate: (view: WorkspaceView) => void;
  find: () => void;
  rename: () => void;
  engineSettings: () => void;
  help: () => void;
  toggleTheme: () => void;
  mobile?: boolean;
  directory: DirectoryProps;
  openRun: (runKey: string) => void;
}) {
  const live = useLiveRuntime();
  const pending = live.runs.reduce((n, r) => n + r.approvals.length, 0);
  const active = live.runs.filter(isActiveRun).length;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsId = useId();
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !settingsRef.current?.contains(event.target))
        setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [settingsOpen]);

  function runSettingsAction(action: () => void) {
    action();
    setSettingsOpen(false);
  }

  return (
    <aside className={`co-sidebar ${mobile ? "co-mobile-navigation" : ""}`}>
      <button className="co-brand" onClick={() => navigate("start")} aria-label="AgentOS home">
        <AudioLines size={25} />
        AgentOS<span className="co-alpha">alpha</span>
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
            </button>
          );
        })}
      </nav>
      <WorkspaceDirectory {...directory} />
      <div className="co-sidebar-bottom">
        {(pending > 0 || active > 0 || !live.native) && (
          <button
            className="co-sidebar-status"
            onClick={() => {
              // Open the chat or workflow that needs attention; its page shows the run.
              const run = live.runs.find((r) => r.approvals.length) || live.runs.find(isActiveRun);
              if (run) openRun(run.request.key);
              else navigate("engines");
            }}
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
        <div
          ref={settingsRef}
          className="co-workspace-settings"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setSettingsOpen(false);
              settingsTriggerRef.current?.focus();
            }
          }}
        >
          <button
            ref={settingsTriggerRef}
            type="button"
            className="co-workspace-settings-trigger"
            aria-expanded={settingsOpen}
            aria-controls={settingsId}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings2 size={16} /> Settings & help
          </button>
          {settingsOpen && (
            <div id={settingsId} className="co-workspace-settings-menu" role="menu">
              <button className="co-help" role="menuitem" onClick={() => runSettingsAction(rename)}>
                <Building2 size={16} />
                <span>Rename company</span>
              </button>
              <button
                className="co-help"
                role="menuitem"
                onClick={() => runSettingsAction(engineSettings)}
              >
                <Settings2 size={16} />
                <span>Engines & notifications</span>
              </button>
              <button className="co-help" role="menuitem" onClick={() => runSettingsAction(help)}>
                <CircleHelp size={16} />
                <span>Getting started</span>
              </button>
              <button
                className="co-theme-toggle"
                role="menuitem"
                onClick={() => runSettingsAction(toggleTheme)}
                aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              >
                {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
                <span>{theme === "light" ? "Dark appearance" : "Light appearance"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
