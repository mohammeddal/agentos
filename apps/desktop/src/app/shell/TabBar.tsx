import { useEffect, useState } from "react";
import { GitBranch, MessageSquare, Plus, Search, SquareTerminal, X } from "lucide-react";
import type { Company } from "../../features/company/company-model";
import { isActiveRun, useLiveRuntime } from "../../features/engines/live-runtime";
import type { WorkspaceRoute } from "../navigation";

export type OpenTab = { kind: "workflow" | "chat"; id: string };
const TABS = "agentos:open-tabs:v1";

/** Open workflows and chats, remembered across launches, like documents in Figma. */
export function useOpenTabs(company: Company, route: WorkspaceRoute) {
  const [tabs, setTabs] = useState<OpenTab[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(TABS) || "[]");
      return Array.isArray(value)
        ? value.filter(
            (t): t is OpenTab =>
              !!t && (t.kind === "workflow" || t.kind === "chat") && typeof t.id === "string",
          )
        : [];
    } catch {
      return [];
    }
  });
  const current: OpenTab | null =
    route.taskId && route.taskId !== "new"
      ? { kind: "workflow", id: route.taskId }
      : route.chatId
        ? { kind: "chat", id: route.chatId }
        : null;
  // Opening a workflow or chat adds a tab; removed items drop out.
  const valid = tabs.filter((tab) =>
    tab.kind === "workflow"
      ? company.tasks?.some((t) => t.id === tab.id)
      : company.chats?.some((c) => c.id === tab.id),
  );
  const next =
    current && !valid.some((t) => t.kind === current.kind && t.id === current.id)
      ? [...valid, current].slice(-12)
      : valid;
  useEffect(() => {
    if (next.length !== tabs.length || next.some((t, i) => t.id !== tabs[i]?.id)) setTabs(next);
    try {
      localStorage.setItem(TABS, JSON.stringify(next));
    } catch {
      /* Tabs still work for this session. */
    }
  }, [JSON.stringify(next)]);
  const close = (tab: OpenTab) =>
    setTabs((list) => list.filter((t) => !(t.kind === tab.kind && t.id === tab.id)));
  return { tabs: next, current, close };
}

export function tabRoute(tab: OpenTab): WorkspaceRoute {
  return tab.kind === "workflow"
    ? { view: "tasks", taskId: tab.id }
    : { view: "start", chatId: tab.id };
}

export function TabBar({
  company,
  tabs,
  current,
  open,
  close,
  newChat,
  find,
  title,
  terminalOpen,
  toggleTerminal,
}: {
  company: Company;
  tabs: OpenTab[];
  current: OpenTab | null;
  open: (tab: OpenTab) => void;
  close: (tab: OpenTab) => void;
  newChat: () => void;
  find: () => void;
  /** Name of the current section when no tab is active. */
  title: string;
  terminalOpen: boolean;
  toggleTerminal: () => void;
}) {
  const live = useLiveRuntime();
  const label = (tab: OpenTab) =>
    tab.kind === "workflow"
      ? company.tasks?.find((t) => t.id === tab.id)?.title || "Workflow"
      : company.chats?.find((c) => c.id === tab.id)?.messages[0]?.text || "Chat";
  const state = (tab: OpenTab) => {
    const run = live.runs.find(
      (r) =>
        r.request.key === `${tab.kind === "workflow" ? "task" : "chat"}:${tab.id}` &&
        isActiveRun(r),
    );
    return run ? (run.approvals.length ? "approval" : "working") : undefined;
  };
  return (
    <header className="sh-tabs">
      <span className="sh-tabs-title" data-active={!current || undefined}>
        {title}
      </span>
      <div className="sh-tab-list" role="tablist" aria-label="Open workflows and chats">
        {tabs.map((tab, index) => {
          const active = current?.kind === tab.kind && current.id === tab.id;
          const Icon = tab.kind === "workflow" ? GitBranch : MessageSquare;
          return (
            <div key={`${tab.kind}:${tab.id}`} className="sh-tab" data-active={active || undefined}>
              <button
                role="tab"
                aria-selected={active}
                title={`${label(tab)}${index < 9 ? ` · ⌘${index + 1}` : ""}`}
                onClick={() => open(tab)}
                onAuxClick={(event) => event.button === 1 && close(tab)}
              >
                <Icon size={13} />
                <span>{label(tab)}</span>
                {state(tab) && <i data-state={state(tab)} />}
              </button>
              <button
                className="sh-tab-close"
                aria-label={`Close ${label(tab)}`}
                onClick={() => close(tab)}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
        <button
          className="sh-tab-new"
          aria-label="New chat"
          title="New chat · ⌘T"
          onClick={newChat}
        >
          <Plus size={14} />
        </button>
      </div>
      <button className="sh-tabs-find" onClick={find} aria-label="Search or run a command">
        <Search size={13} />
        <span>Search or run…</span>
        <kbd>⌘K</kbd>
      </button>
      <button
        className="sh-tabs-icon"
        aria-label={terminalOpen ? "Close terminal" : "Open terminal"}
        aria-pressed={terminalOpen}
        title="Terminal · ⌘J"
        onClick={toggleTerminal}
      >
        <SquareTerminal size={15} />
      </button>
    </header>
  );
}
