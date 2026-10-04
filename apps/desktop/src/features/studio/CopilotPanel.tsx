import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  FoldVertical,
  History,
  Sparkles,
  Square,
  SquarePen,
  Trash2,
} from "lucide-react";
import type { Company } from "../company/company-model";
import {
  controlLive,
  isActiveRun,
  startLive,
  useLiveRuntime,
  type LiveRequest,
} from "../engines/live-runtime";
import { readProviderPermissions } from "../engines/provider-permissions";
import { useInstalledTools } from "../engines/installed-tools";
import { AssistantMessage } from "../../shared/AssistantMessage";
import type { TaskCanvasGraph } from "../tasks/task-canvas-model";
import {
  applyPlan,
  compactPrompt,
  copilotPrompt,
  mergePatch,
  parsePlan,
  replyText,
  type InstalledTool,
} from "./workflow-copilot";

type Message = {
  id: string;
  role: "user" | "copilot";
  text: string;
  changes?: string[];
  problems?: string[];
  /** A compacted chat: this summary stands in for everything before it. */
  summary?: boolean;
};

const storageKey = (taskId: string) => `agentos:copilot:${taskId}`;
function readMessages(taskId: string): Message[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(taskId)) || "[]");
    return Array.isArray(value) ? (value as Message[]).slice(-60) : [];
  } catch {
    return [];
  }
}
// Earlier chats, kept when you start a new one so you can go back to them.
type PastChat = { id: string; title: string; at: number; messages: Message[] };
const archiveKey = (taskId: string) => `agentos:copilot-archive:${taskId}`;
function readArchive(taskId: string): PastChat[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(archiveKey(taskId)) || "[]");
    return Array.isArray(value) ? (value as PastChat[]) : [];
  } catch {
    return [];
  }
}
const chatTitle = (messages: Message[]) =>
  (messages.find((m) => m.role === "user")?.text || "Summary").slice(0, 70);

// The request in flight is remembered outside the panel, so switching tabs while the engine works
// doesn't lose the answer: it's applied when the panel opens again.
type Pending = { runId: string; kind: "chat" | "compact" };
const pendingKey = (taskId: string) => `agentos:copilot-pending:${taskId}`;
function readPending(taskId: string): Pending | null {
  try {
    const raw = localStorage.getItem(pendingKey(taskId)) || "";
    if (!raw) return null;
    if (!raw.startsWith("{")) return { runId: raw, kind: "chat" };
    const value = JSON.parse(raw) as Pending;
    return value.runId ? value : null;
  } catch {
    return null;
  }
}
function savePending(taskId: string, pending: Pending | null) {
  try {
    if (pending) localStorage.setItem(pendingKey(taskId), JSON.stringify(pending));
    else localStorage.removeItem(pendingKey(taskId));
  } catch {
    /* Still tracked while the panel stays open. */
  }
}

const starters = [
  "What does this workflow produce, and where are the files saved?",
  "Build a workflow that collects today's AI news, verifies it, and drafts 3 Arabic posts.",
  "Add an approval step before anything is published.",
  "Make the first step use notebooklm and write clearer instructions for every step.",
  "Split the writer step into a draft step and a review step.",
];

/**
 * Chat that builds and edits the workflow on the canvas. Each answer is applied as one change,
 * so ⌘Z undoes it.
 */
export function CopilotPanel({
  company,
  taskId,
  graph,
  apply,
  facts,
}: {
  company: Company;
  taskId: string;
  graph: TaskCanvasGraph;
  /** Where files go, schedule, and the latest run, so questions get real answers. */
  facts: string;
  apply: (next: TaskCanvasGraph) => void;
}) {
  const live = useLiveRuntime();
  const [messages, setMessages] = useState<Message[]>(() => readMessages(taskId));
  const [text, setText] = useState("");
  const [engine, setEngine] = useState<"codex" | "claude">("codex");
  const [pending, setPendingState] = useState(() => readPending(taskId));
  const setPending = (next: Pending | null) => {
    savePending(taskId, next);
    setPendingState(next);
  };
  const [archive, setArchive] = useState(() => readArchive(taskId));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const historyMenu = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const codex = useInstalledTools("codex");
  const claude = useInstalledTools("claude");
  const tools: InstalledTool[] = [
    ...codex.map((t) => ({ ...t, engine: "codex" as const })),
    ...claude.map((t) => ({ ...t, engine: "claude" as const })),
  ];
  const transcript = useRef<HTMLDivElement>(null);
  const run = pending ? live.runs.find((r) => r.request.id === pending.runId) : undefined;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pending?.runId]);
  const elapsed = run ? Math.max(0, Math.round((now - run.createdAt) / 1000)) : 0;

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(taskId), JSON.stringify(messages.slice(-60)));
    } catch {
      /* The conversation still works for this session. */
    }
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [messages, taskId]);
  useEffect(() => {
    try {
      localStorage.setItem(archiveKey(taskId), JSON.stringify(archive.slice(0, 12)));
    } catch {
      /* Past chats stay available for this session. */
    }
  }, [archive, taskId]);
  useEffect(() => {
    if (!historyOpen) return;
    const close = (event: PointerEvent) => {
      if (!historyMenu.current?.contains(event.target as Node)) setHistoryOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setHistoryOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [historyOpen]);
  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  // When the engine answers, apply its plan to the canvas as one undoable change.
  useEffect(() => {
    if (!pending) return;
    if (!run) {
      // Runs are loaded but this one is gone (history was cleared): stop waiting for it.
      if (live.runs.length) {
        setPending(null);
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "copilot",
            text: "That request was lost. Send it again.",
          },
        ]);
      }
      return;
    }
    if (isActiveRun(run)) return;
    setPending(null);
    if (pending.kind === "compact") {
      const summary = replyText(run.output);
      if (run.status === "completed" && summary) {
        setMessages([{ id: crypto.randomUUID(), role: "copilot", text: summary, summary: true }]);
      } else {
        setError(
          run.status === "canceled"
            ? "Compacting stopped. The chat is unchanged."
            : `Couldn't compact the chat: ${run.error || "the engine didn't answer"}. The chat is unchanged.`,
        );
      }
      return;
    }
    if (run.status !== "completed") {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "copilot",
          text:
            run.status === "canceled"
              ? "Stopped."
              : run.status === "interrupted"
                ? "The app closed before I finished. Send it again."
                : run.error || "The engine didn't answer.",
        },
      ]);
      return;
    }
    const plan = parsePlan(run.output);
    if (!plan) {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "copilot", text: replyText(run.output) || run.output },
      ]);
      return;
    }
    // Apply to the canvas as it is now, so edits made while waiting are kept where possible.
    const result = applyPlan(company, graph, mergePatch(company, graph, plan), tools);
    if (result.changes.length) apply(result.graph);
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "copilot",
        text: replyText(run.output) || plan.summary || "Updated the workflow.",
        changes: result.changes,
        problems: result.problems,
      },
    ]);
  }, [run?.status, pending?.runId, !!live.runs.length]);

  // A workflow created from a goal on Home starts building as soon as it opens.
  useEffect(() => {
    const key = `agentos:copilot-autostart:${taskId}`;
    let goal: string | null = null;
    try {
      goal = localStorage.getItem(key);
      if (goal) localStorage.removeItem(key);
    } catch {
      /* Nothing to start. */
    }
    if (goal && !messages.length) void send(goal);
  }, [taskId]);

  async function send(message = text) {
    const request = message.trim();
    if (!request || pending) return;
    setError("");
    setText("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: request }]);
    const id = crypto.randomUUID();
    const live: LiveRequest = {
      id,
      // A new key per request: each starts a fresh engine conversation (recent turns go in the
      // prompt), so the saved conversation never grows too large to reopen.
      key: `copilot:${taskId}:${id}`,
      title: `Workflow copilot · ${request.slice(0, 80)}`,
      mode: "chat",
      folder: "",
      context: "",
      providerPermissions: readProviderPermissions(),
      steps: [
        {
          id: "chat",
          label: "Workflow copilot",
          engine,
          prompt: copilotPrompt(company, graph, tools, request, facts, messages),
          attachments: [],
          agentId: "",
          after: [],
          condition: "success",
          approval: false,
        },
      ],
    };
    try {
      await startLive(live);
      setPending({ runId: id, kind: "chat" });
    } catch (cause) {
      setError(String(cause).replace(/^Error: /, ""));
    }
  }

  /** Keeps the current chat in history and starts an empty one. */
  function newChat() {
    if (pending) return;
    if (messages.length)
      setArchive((past) => [
        { id: crypto.randomUUID(), title: chatTitle(messages), at: Date.now(), messages },
        ...past,
      ]);
    setMessages([]);
    setError("");
  }
  function openPast(chat: PastChat) {
    if (pending) return;
    setArchive((past) => [
      ...(messages.length
        ? [{ id: crypto.randomUUID(), title: chatTitle(messages), at: Date.now(), messages }]
        : []),
      ...past.filter((c) => c.id !== chat.id),
    ]);
    setMessages(chat.messages);
    setHistoryOpen(false);
    setError("");
  }
  function clearChat() {
    if (pending) return;
    if (!confirmClear) return setConfirmClear(true);
    setConfirmClear(false);
    setMessages([]);
    setError("");
  }
  /** Replaces the chat with a short summary the copilot keeps using as context. */
  async function compact() {
    if (pending || messages.length < 3) return;
    setError("");
    const id = crypto.randomUUID();
    const name = graph.nodes.find((n) => n.kind === "task")?.title || "this workflow";
    try {
      await startLive({
        id,
        key: `copilot:${taskId}:${id}`,
        title: `Workflow copilot · compact chat`,
        mode: "chat",
        folder: "",
        context: "",
        providerPermissions: readProviderPermissions(),
        steps: [
          {
            id: "chat",
            label: "Compact chat",
            engine,
            prompt: compactPrompt(name, messages),
            attachments: [],
            agentId: "",
            after: [],
            condition: "success",
            approval: false,
          },
        ],
      });
      setPending({ runId: id, kind: "compact" });
    } catch (cause) {
      setError(String(cause).replace(/^Error: /, ""));
    }
  }

  return (
    <div className="st-copilot">
      <div className="st-copilot-bar">
        <div className="st-copilot-history" ref={historyMenu}>
          <button
            type="button"
            aria-expanded={historyOpen}
            aria-haspopup="menu"
            disabled={!archive.length || !!pending}
            title={archive.length ? "Earlier chats" : "No earlier chats yet"}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <History size={13} /> <span>Chats</span> <ChevronDown size={12} />
          </button>
          {historyOpen && (
            <div className="st-copilot-menu" role="menu">
              {archive.map((chat) => (
                <button key={chat.id} type="button" role="menuitem" onClick={() => openPast(chat)}>
                  <span>{chat.title}</span>
                  <small>
                    {new Date(chat.at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    · {chat.messages.length} messages
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={!!pending || messages.length < 3}
          aria-label="Compact chat"
          title="Replace this chat with a short summary the copilot keeps using"
          onClick={() => void compact()}
        >
          <FoldVertical size={13} /> <span>Compact</span>
        </button>
        <button
          type="button"
          disabled={!!pending || !messages.length}
          aria-label="New chat"
          title="Keep this chat under Chats and start an empty one"
          onClick={newChat}
        >
          <SquarePen size={13} /> <span>New chat</span>
        </button>
        <button
          type="button"
          data-danger={confirmClear || undefined}
          disabled={!!pending || !messages.length}
          aria-label={confirmClear ? "Confirm clear chat" : "Clear chat"}
          title="Delete this chat's messages. The workflow isn't changed."
          onClick={clearChat}
        >
          <Trash2 size={13} /> <span>{confirmClear ? "Click to confirm" : "Clear"}</span>
        </button>
      </div>
      <div className="st-copilot-log" ref={transcript}>
        {!messages.length && (
          <div className="st-copilot-empty">
            <Sparkles size={18} />
            <strong>Build this workflow by chatting</strong>
            <p>
              Describe the goal or tell me what each step should do. Changes appear on the canvas.
            </p>
            {(graph.nodes.length <= 1 && graph.nodes[0]?.prompt.trim()
              ? ["Build the steps for this workflow from its outcome.", ...starters.slice(1)]
              : starters
            ).map((starter) => (
              <button key={starter} type="button" onClick={() => void send(starter)}>
                {starter}
              </button>
            ))}
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className="st-copilot-msg"
            data-role={message.role}
            data-summary={message.summary || undefined}
          >
            {message.summary && <small>Summary of the earlier chat</small>}
            {message.role === "copilot" ? (
              <AssistantMessage text={message.text} />
            ) : (
              <p>{message.text}</p>
            )}
            {!!message.changes?.length && (
              <ul className="st-copilot-changes">
                {message.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            )}
            {!!message.problems?.length && (
              <ul className="st-copilot-problems">
                {message.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
            {!!message.changes?.length && <small>Applied to the canvas · ⌘Z to undo</small>}
          </div>
        ))}
        {pending && (
          <div className="st-copilot-msg" data-role="copilot">
            {pending.kind === "chat" && run && replyText(run.output) ? (
              <AssistantMessage text={replyText(run.output.split("```agentos-workflow")[0]!)} />
            ) : null}
            <p className="st-copilot-thinking">
              {pending.kind === "compact"
                ? `Compacting the chat… ${elapsed}s`
                : !run || !run.output
                  ? `Thinking… ${elapsed}s`
                  : run.output.includes("```agentos-workflow")
                    ? `Preparing the changes… ${elapsed}s`
                    : `Writing… ${elapsed}s`}
            </p>
          </div>
        )}
        {error && <p className="st-error">{error}</p>}
      </div>
      <form
        className="st-copilot-input"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          rows={3}
          value={text}
          placeholder="e.g. Add a step after the collector that checks sources, using notebooklm"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div>
          <select
            aria-label="Copilot engine"
            value={engine}
            onChange={(event) => setEngine(event.target.value as "codex" | "claude")}
          >
            <option value="codex">Codex</option>
            <option value="claude">Claude Code</option>
          </select>
          {pending ? (
            <button
              type="button"
              className="st-copilot-send"
              aria-label="Stop"
              onClick={() => void controlLive(pending.runId).catch(() => undefined)}
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              className="st-copilot-send"
              aria-label="Send"
              disabled={!text.trim()}
            >
              <ArrowUp size={14} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
