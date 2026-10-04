import {
  Activity,
  AudioLines,
  BookOpen,
  CircleHelp,
  House,
  MessageSquare,
  Moon,
  Search,
  Settings2,
  Sun,
} from "lucide-react";
import { primaryView, type WorkspaceView } from "../navigation";

const items: { view: WorkspaceView; label: string; icon: typeof House; key: string }[] = [
  { view: "map", label: "Home", icon: House, key: "1" },
  { view: "start", label: "Chat", icon: MessageSquare, key: "2" },
  { view: "activity", label: "Activity", icon: Activity, key: "3" },
  { view: "memory", label: "Library", icon: BookOpen, key: "4" },
];

/** The always-visible icon bar: the app's sections, plus search, theme, help, and settings. */
export function AppRail({
  view,
  needsYou,
  theme,
  navigate,
  find,
  help,
  toggleTheme,
}: {
  view: WorkspaceView;
  needsYou: number;
  theme: "light" | "dark";
  navigate: (view: WorkspaceView) => void;
  find: () => void;
  help: () => void;
  toggleTheme: () => void;
}) {
  const current = primaryView(view);
  return (
    <nav className="sh-rail" aria-label="Sections">
      <button className="sh-rail-brand" aria-label="AgentOS home" onClick={() => navigate("map")}>
        <AudioLines size={20} />
      </button>
      {items.map(({ view: target, label, icon: Icon, key }) => (
        <button
          key={target}
          className="sh-rail-item"
          aria-label={label}
          aria-current={current === target ? "page" : undefined}
          title={`${label} · ⌃${key}`}
          onClick={() => navigate(target)}
        >
          <Icon size={18} />
          {target === "activity" && needsYou > 0 && <em>{needsYou > 9 ? "9+" : needsYou}</em>}
          <span>{label}</span>
        </button>
      ))}
      <span className="sh-rail-spacer" />
      <button
        className="sh-rail-item"
        aria-label="Search or run a command"
        title="Search · ⌘K"
        onClick={find}
      >
        <Search size={17} />
      </button>
      <button
        className="sh-rail-item"
        aria-label={theme === "light" ? "Dark appearance" : "Light appearance"}
        title="Toggle appearance"
        onClick={toggleTheme}
      >
        {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
      </button>
      <button className="sh-rail-item" aria-label="Help" title="Help" onClick={help}>
        <CircleHelp size={17} />
      </button>
      <button
        className="sh-rail-item"
        aria-label="Settings"
        aria-current={current === "settings" ? "page" : undefined}
        title="Settings"
        onClick={() => navigate("settings")}
      >
        <Settings2 size={17} />
      </button>
    </nav>
  );
}
