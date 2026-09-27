import { useEffect, useRef, useState } from "react";
import { ArrowUp, ClipboardList, ShieldCheck, SlidersHorizontal } from "lucide-react";
import {
  companyDomains,
  taskParticipants,
  type Company,
  type CompanyChat,
  type CompanyTask,
} from "../company/company-model";
import {
  emptyPrompt,
  parsePromptDraft,
  PROMPT_STORAGE,
  quickTaskError,
  taskFromPrompt,
  type PromptDraft,
} from "./prompt-composer";
import "./company-start.css";
import { ChatConversation } from "./ChatConversation";
import { chatRequest, isActiveRun, startLive, useLiveRuntime } from "../engines/live-runtime";
import { EngineSetup } from "../engines/LiveExecution";
import { ModelPicker } from "../engines/ModelPicker";
import { engineId } from "../engines/live-runtime";
import { AttachmentEditor } from "../attachments/Attachments";
import { HelpTip } from "../../shared/HelpTip";

export function CompanyStart({
  company,
  change,
  editTask,
  activity,
  selectedChatId,
  initialProjectId,
  openChat,
}: {
  selectedChatId?: string | undefined;
  initialProjectId?: string | undefined;
  openChat: (id: string) => void;
  activity: (runKey?: string) => void;
  company: Company;
  change: (update: (c: Company) => Company) => void;
  editTask: (task: CompanyTask) => void;
}) {
  const selectedChat = company.chats?.find((c) => c.id === selectedChatId);
  const storageKey = selectedChatId
    ? `${PROMPT_STORAGE}:chat:${selectedChatId}`
    : initialProjectId
      ? `${PROMPT_STORAGE}:project:${initialProjectId}`
      : PROMPT_STORAGE;
  const [initial] = useState(() => {
    try {
      const legacy = parsePromptDraft(localStorage.getItem(PROMPT_STORAGE));
      if (legacy.chatId && !localStorage.getItem(`${PROMPT_STORAGE}:chat:${legacy.chatId}`))
        localStorage.setItem(`${PROMPT_STORAGE}:chat:${legacy.chatId}`, JSON.stringify(legacy));
      const saved = localStorage.getItem(storageKey);
      let draft = parsePromptDraft(saved);
      if (selectedChat) {
        if (!saved || draft.chatId !== selectedChat.id)
          draft = {
            ...emptyPrompt,
            engine: selectedChat.engine,
            modelChoice: selectedChat.modelChoice || {},
          };
        draft = { ...draft, chatId: selectedChat.id, projectId: selectedChat.projectId || "" };
      } else {
        if (draft.chatId) draft = { ...emptyPrompt };
        draft = { ...draft, chatId: "", projectId: initialProjectId || draft.projectId };
      }
      return { draft, error: "" };
    } catch {
      return {
        draft: {
          ...emptyPrompt,
          chatId: selectedChat?.id || "",
          engine: selectedChat?.engine || emptyPrompt.engine,
          modelChoice: selectedChat?.modelChoice || {},
          projectId: selectedChat?.projectId || initialProjectId || "",
        },
        error:
          "Draft storage could not be read. Your saved draft was left untouched; this composer will use session-only storage.",
      };
    }
  });
  const [draft, setDraft] = useState<PromptDraft>(initial.draft);
  const [storageError, setStorageError] = useState(initial.error);
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const live = useLiveRuntime();
  const [createdTaskId, setCreatedTaskId] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const chat = company.chats?.find((c) => c.id === draft.chatId);
  const running = live.runs.some((r) => r.request.key === `chat:${draft.chatId}` && isActiveRun(r));
  const linkedTask = company.tasks?.find((t) => t.id === chat?.taskId);
  const createdTask = company.tasks?.find((t) => t.id === createdTaskId);
  const projectMissing =
    !!draft.projectId && !company.projects?.some((p) => p.id === draft.projectId);
  const taskEngines = [
    ...new Set(
      taskParticipants(company, {
        kind: draft.target.startsWith("d:") ? "domains" : "agents",
        targets: [draft.target.slice(2)],
      }).map((a) => a.engine),
    ),
  ];
  const error = draft.makeTask
    ? quickTaskError(company, draft)
    : projectMissing
      ? "Choose an available project or Company-wide."
      : null;
  useEffect(() => {
    if (initial.error) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setStorageError("");
    } catch {
      setStorageError(
        "Draft storage is unavailable. Keep this window open or copy your prompt before leaving.",
      );
    }
  }, [draft, initial.error, storageKey]);
  const update = (values: Partial<PromptDraft>) => {
    setDraft((d) => ({ ...d, ...values }));
    setNotice("");
    setCreatedTaskId("");
  };
  async function submit() {
    if (
      (!!selectedChatId && !selectedChat) ||
      submitting.current ||
      attaching ||
      running ||
      !draft.text.trim() ||
      error ||
      (draft.makeTask && linkedTask)
    )
      return;
    submitting.current = true;
    setSending(true);
    try {
      const now = new Date().toISOString();
      if (draft.makeTask) {
        const task = taskFromPrompt(company, draft, crypto.randomUUID(), now);
        change((c) => ({
          ...c,
          tasks: [task, ...(c.tasks || [])],
          ...(chat
            ? {
                chats: (c.chats || []).map((item) =>
                  item.id === chat.id ? { ...item, taskId: task.id } : item,
                ),
              }
            : {}),
        }));
        setCreatedTaskId(task.id);
        setNotice(
          "Task created as Planned. It has not started; human approval is required before execution.",
        );
        setDraft((d) => ({
          ...d,
          text: "",
          attachments: [],
          chatId: selectedChatId || "",
          makeTask: false,
        }));
      } else {
        const message = {
          id: crypto.randomUUID(),
          text: draft.text.trim(),
          createdAt: now,
          attachments: draft.attachments || [],
        };
        const saved: CompanyChat = chat
          ? { ...chat, modelChoice: draft.modelChoice || {}, messages: [...chat.messages, message] }
          : {
              id: crypto.randomUUID(),
              engine: draft.engine,
              modelChoice: draft.modelChoice || {},
              ...(draft.projectId ? { projectId: draft.projectId } : {}),
              createdAt: now,
              messages: [message],
            };
        const request = await chatRequest(company, saved, message.text, message.id);
        await startLive(request);
        change((c) => ({
          ...c,
          chats: chat
            ? (c.chats || []).map((item) => (item.id === chat.id ? saved : item))
            : [saved, ...(c.chats || [])],
        }));
        setDraft((d) => ({ ...d, text: "", attachments: [], chatId: saved.id }));
        setNotice("");
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ ...draft, text: "", attachments: [], chatId: selectedChatId || "" }),
          );
        } catch {
          setStorageError("The message was sent, but draft storage is unavailable.");
        }
        if (!selectedChatId) openChat(saved.id);
      }
    } catch (e) {
      setNotice(String(e).replace(/^Error: /, ""));
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }
  function convert() {
    if (!chat) return;
    if (
      (draft.text.trim() || draft.attachments?.length) &&
      !window.confirm("Replace the composer text with this chat’s latest prompt?")
    )
      return;
    // One saved user prompt is the source; do not silently truncate a long conversation.
    const latest = chat.messages[chat.messages.length - 1]!;
    update({ makeTask: true, text: latest.text, attachments: latest.attachments || [] });
    input.current?.focus();
  }
  return (
    <section
      className={`co-start ${chat ? "co-start-conversation" : ""}`}
      aria-label="Start a chat or task"
    >
      <div className="co-start-main">
        <div className="co-start-intro">
          <h1>
            {chat ? chat.messages[0]?.text || "Conversation" : "What would you like to work on?"}
          </h1>
          {chat && <p>Continue here. Steps, approvals, and logs are in Activity.</p>}
        </div>
        {!live.native || live.engines.some((e) => !e.installed) ? (
          <details className="co-start-setup">
            <summary>Engine setup</summary>
            <EngineSetup />
          </details>
        ) : null}
        {selectedChatId && !selectedChat && (
          <p role="alert">
            This chat is archived, removed, or unavailable. Restore it from the sidebar directory.
          </p>
        )}
        {chat && (
          <>
            <ChatConversation chat={chat} activity={() => activity(`chat:${chat.id}`)} />
            <div className="co-chat-detail-actions">
              {!linkedTask && (
                <button className="co-button" onClick={convert}>
                  <ClipboardList size={13} />
                  Make latest prompt a task
                </button>
              )}
            </div>
          </>
        )}
        <form
          className="co-prompt-box"
          onKeyDown={(e) => {
            // A native select's Enter key must not trigger implicit form submission.
            if (e.key === "Enter" && e.target instanceof HTMLSelectElement) e.preventDefault();
          }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="co-prompt-label-row">
            <label className="co-prompt-label" htmlFor="company-prompt">
              {draft.makeTask
                ? "Describe the task"
                : chat
                  ? "Continue the conversation"
                  : "Your prompt"}
            </label>
            <HelpTip label="About prompts and privacy" align="end">
              History stays on this Mac. Sending shares this prompt and its attachments with the
              selected provider.
            </HelpTip>
          </div>
          <AttachmentEditor
            value={draft.attachments || []}
            onChange={(attachments) => update({ attachments })}
            onBusy={setAttaching}
            disabled={sending || running}
          >
            <textarea
              ref={input}
              id="company-prompt"
              rows={3}
              maxLength={3000}
              placeholder={
                draft.makeTask
                  ? "What should get done?"
                  : "Ask a question or describe what you want to do…"
              }
              value={draft.text}
              disabled={sending}
              onChange={(e) => update({ text: e.target.value })}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </AttachmentEditor>
          <div className="co-prompt-controls">
            <label className="co-prompt-task-toggle">
              <input
                type="checkbox"
                checked={draft.makeTask}
                onChange={(e) =>
                  update({
                    makeTask: e.target.checked,
                    ...(!e.target.checked && chat ? { projectId: chat.projectId || "" } : {}),
                  })
                }
              />
              <ClipboardList size={14} />
              Make this a task
            </label>
            {!!company.projects?.length || projectMissing ? (
              <label>
                Project
                <select
                  aria-label="Prompt project"
                  disabled={!!chat && !draft.makeTask}
                  value={draft.projectId}
                  onChange={(e) => update({ projectId: e.target.value })}
                >
                  <option value="">Company-wide</option>
                  {projectMissing && <option value={draft.projectId}>Unavailable project</option>}
                  {(company.projects || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {draft.makeTask ? (
            <div className="co-prompt-task-options">
              <label>
                Assign to
                <select
                  aria-label="Quick task assignee"
                  value={draft.target}
                  onChange={(e) => update({ target: e.target.value })}
                >
                  <option value="">Choose a domain or agent</option>
                  <optgroup label="Domains">
                    {companyDomains(company).map((d) => (
                      <option key={d} value={`d:${d}`}>
                        {d}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Agents">
                    {company.offices.flatMap((o) =>
                      o.agents.map((a) => (
                        <option key={a.id} value={`a:${a.id}`}>
                          {a.name} · {o.name}
                        </option>
                      )),
                    )}
                  </optgroup>
                </select>
              </label>
              <span>
                <ShieldCheck size={13} />
                Your approval required
              </span>
              <HelpTip label="About quick tasks" align="end">
                Create the task first, then use its editor or Workflow map for more assignees,
                schedules, and handoffs.
              </HelpTip>
            </div>
          ) : (
            <div className="co-prompt-provider">
              <div className="co-prompt-engine">
                <label>
                  Engine
                  <select
                    aria-label="Chat engine preference"
                    disabled={!!chat}
                    value={draft.engine}
                    onChange={(e) => update({ engine: e.target.value, modelChoice: {} })}
                  >
                    {[...new Set(["Codex", "Claude Code", draft.engine])].map((engine) => (
                      <option key={engine}>{engine}</option>
                    ))}
                  </select>
                </label>
                <span>{live.native ? "Read-only chat" : "Mac app required to send"}</span>
              </div>
              <details className="co-prompt-options">
                <summary>
                  <SlidersHorizontal size={14} /> Model & effort{" "}
                  <span>
                    {draft.modelChoice?.model || "Recommended model"} ·{" "}
                    {draft.modelChoice?.effort || "Default effort"}
                  </span>
                </summary>
                {["Codex", "Claude Code"].includes(draft.engine) && (
                  <ModelPicker
                    engine={engineId(draft.engine)}
                    value={draft.modelChoice}
                    onChange={(modelChoice) => update({ modelChoice })}
                    label="Chat"
                    disabled={sending || running}
                  />
                )}
              </details>
            </div>
          )}
          {draft.makeTask &&
            taskEngines
              .filter((e) => ["Codex", "Claude Code"].includes(e))
              .map((engine) => (
                <div key={engine} className="co-prompt-options">
                  <small>{engine} · Task default</small>
                  <ModelPicker
                    engine={engineId(engine)}
                    value={draft.modelDefaults?.[engineId(engine)]}
                    label={`${engine} task default`}
                    onChange={(choice) =>
                      update({
                        modelDefaults: { ...draft.modelDefaults, [engineId(engine)]: choice },
                      })
                    }
                  />
                </div>
              ))}
          <footer>
            <small>
              {draft.makeTask
                ? "Saved as a plan · Won’t run until you start it"
                : "⌘ / Ctrl + Enter to send"}
              {draft.text.length > 2700 ? ` · ${draft.text.length}/3,000` : ""}
            </small>
            <button
              className="co-button co-button-primary"
              disabled={
                (!!selectedChatId && !selectedChat) ||
                sending ||
                attaching ||
                running ||
                (!draft.makeTask && !live.native) ||
                !draft.text.trim() ||
                !!error ||
                (draft.makeTask && !!linkedTask)
              }
            >
              {sending
                ? "Starting…"
                : running
                  ? "Engine working…"
                  : draft.makeTask
                    ? "Create task"
                    : "Send message"}
              <ArrowUp size={16} />
            </button>
          </footer>
        </form>
        {draft.makeTask && linkedTask && (
          <p className="co-form-note">
            This chat already has a task. Open its linked task to edit it, or start a new prompt.
          </p>
        )}
        {draft.makeTask && error && draft.text.trim() && <p className="co-prompt-hint">{error}</p>}
        {!draft.makeTask && projectMissing && (
          <p role="alert" className="co-form-error">
            {error}
          </p>
        )}
        {notice && (
          <div className="co-prompt-result" role="status">
            <p>{notice}</p>
            {createdTask && (
              <button className="co-button" onClick={() => editTask(createdTask)}>
                Open task details
              </button>
            )}
          </div>
        )}
        {storageError && (
          <p className="co-form-error" role="alert">
            {storageError}
          </p>
        )}
      </div>
    </section>
  );
}
