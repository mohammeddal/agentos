import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles, Square } from "lucide-react";
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
  copilotPrompt,
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

const starters = [
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
}: {
  company: Company;
  taskId: string;
  graph: TaskCanvasGraph;
  apply: (next: TaskCanvasGraph) => void;
}) {
  const live = useLiveRuntime();
  const [messages, setMessages] = useState<Message[]>(() => readMessages(taskId));
  const [text, setText] = useState("");
  const [engine, setEngine] = useState<"codex" | "claude">("codex");
  const [pending, setPending] = useState<{ runId: string; graph: TaskCanvasGraph } | null>(null);
  const [error, setError] = useState("");
  const codex = useInstalledTools("codex");
  const claude = useInstalledTools("claude");
  const tools: InstalledTool[] = [
    ...codex.map((t) => ({ ...t, engine: "codex" as const })),
    ...claude.map((t) => ({ ...t, engine: "claude" as const })),
  ];
  const transcript = useRef<HTMLDivElement>(null);
  const run = pending ? live.runs.find((r) => r.request.id === pending.runId) : undefined;

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(taskId), JSON.stringify(messages.slice(-60)));
    } catch {
      /* The conversation still works for this session. */
    }
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [messages, taskId]);

  // When the engine answers, apply its plan to the canvas as one undoable change.
  useEffect(() => {
    if (!pending || !run || isActiveRun(run)) return;
    setPending(null);
    if (run.status !== "completed") {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "copilot",
          text: run.status === "canceled" ? "Stopped." : run.error || "The engine didn't answer.",
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
    const result = applyPlan(company, graph, plan, tools);
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
  }, [run?.status, pending?.runId]);

  async function send(message = text) {
    const request = message.trim();
    if (!request || pending) return;
    setError("");
    setText("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: request }]);
    const id = crypto.randomUUID();
    const live: LiveRequest = {
      id,
      key: `copilot:${taskId}`,
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
          prompt: copilotPrompt(company, graph, tools, request),
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
      setPending({ runId: id, graph });
    } catch (cause) {
      setError(String(cause).replace(/^Error: /, ""));
    }
  }

  return (
    <div className="st-copilot">
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
          <div key={message.id} className="st-copilot-msg" data-role={message.role}>
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
            <p className="st-copilot-thinking">Designing the workflow…</p>
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
