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

export function CompanyStart({
  company,
  change,
  editTask,
  selectedChatId,
  initialProjectId,
  openChat,
  lifecycleChat,
}: {
  selectedChatId?: string | undefined;
  initialProjectId?: string | undefined;
  openChat: (id: string) => void;
  lifecycleChat?: (chat: CompanyChat, lifecycle: "archived" | "removed") => void;
  company: Company;
  change: (update: (c: Company) => Company) => void;
  editTask: (task: CompanyTask) => void;
}) {
  const selectedChat = company.chats?.find((c) => c.id === selectedChatId);
  const selectedProject = company.projects?.find(
    (project) => project.id === (selectedChat?.projectId || initialProjectId),
  );
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  useEffect(() => {
    if (!input.current) return;
    input.current.style.height = "auto";
    input.current.style.height = `${Math.min(input.current.scrollHeight, 220)}px`;
  }, [draft.text]);
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
          "Workflow created as Planned. It has not started; human approval is required before execution.",
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
          engine: draft.engine,
          modelChoice: draft.modelChoice || {},
        };
        const saved: CompanyChat = chat
          ? {
              ...chat,
              engine: draft.engine,
              modelChoice: draft.modelChoice || {},
              messages: [...chat.messages, message],
            }
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
  return (
    <section
      className={`co-start ${chat ? "co-start-conversation" : ""}`}
      aria-label="Start a chat or workflow"
    >
      <div className="co-start-main">
        <div className="co-start-intro">
          <h1>
            {chat
              ? chat.messages[0]?.text || "Conversation"
              : selectedProject
                ? `What would you like to work on in ${selectedProject.name}?`
                : "What would you like to work on?"}
          </h1>
        </div>
        {selectedChatId && !selectedChat && (
          <p role="alert">
            This chat is archived, removed, or unavailable. Restore it from the sidebar directory.
          </p>
        )}
        {chat && (
          <ChatConversation
            chat={chat}
            archive={() => lifecycleChat?.(chat, "archived")}
            remove={() => lifecycleChat?.(chat, "removed")}
          />
        )}
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
          <AttachmentEditor
            value={draft.attachments || []}
            onChange={(attachments) => update({ attachments })}
            onBusy={setAttaching}
            disabled={sending || running}
            compact
            actions={
              <>
                <details
                  className="co-composer-settings"
                  open={settingsOpen}
                  onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setSettingsOpen(false);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setSettingsOpen(false);
                      event.currentTarget.querySelector("summary")?.focus();
                    }
                  }}
                >
                  <summary
                    aria-label="Chat settings"
                    title="Chat settings"
                    onClick={(event) => {
                      if (settingsOpen) return;
                      const root = event.currentTarget.parentElement;
                      requestAnimationFrame(() =>
                        root?.querySelector<HTMLSelectElement>("select")?.focus(),
                      );
                    }}
                  >
                    <SlidersHorizontal size={15} />
                    <span>{draft.engine}</span>
                  </summary>
                  {settingsOpen && (
                    <div className="co-composer-settings-panel">
                      <header>
                        <strong>Chat settings</strong>
                        <small>
                          {draft.modelChoice?.model || "Recommended model"} ·{" "}
                          {draft.modelChoice?.effort || "Default effort"}
                        </small>
                      </header>
                      <label>
                        Engine
                        <select
                          aria-label="Chat engine preference"
                          disabled={sending || running}
                          value={draft.engine}
                          onChange={(e) => update({ engine: e.target.value, modelChoice: {} })}
                        >
                          {[...new Set(["Codex", "Claude Code", draft.engine])].map((engine) => (
                            <option key={engine}>{engine}</option>
                          ))}
                        </select>
                      </label>
                      {!draft.makeTask && ["Codex", "Claude Code"].includes(draft.engine) && (
                        <ModelPicker
                          engine={engineId(draft.engine)}
                          value={draft.modelChoice}
                          onChange={(modelChoice) => update({ modelChoice })}
                          label="Chat"
                          disabled={sending || running}
                        />
                      )}
                      <label className="co-prompt-task-toggle">
                        <input
                          type="checkbox"
                          checked={draft.makeTask}
                          onChange={(e) =>
                            update({
                              makeTask: e.target.checked,
                              ...(!e.target.checked && chat
                                ? { projectId: chat.projectId || "" }
                                : {}),
                            })
                          }
                        />
                        <ClipboardList size={14} />
                        Create as a workflow
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
                            {projectMissing && (
                              <option value={draft.projectId}>Unavailable project</option>
                            )}
                            {(company.projects || []).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {draft.makeTask && (
                        <div className="co-prompt-task-options">
                          <label>
                            Assign to
                            <select
                              aria-label="Quick workflow assignee"
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
                            Your approval is required before execution
                          </span>
                        </div>
                      )}
                      {draft.makeTask &&
                        taskEngines
                          .filter((engine) => ["Codex", "Claude Code"].includes(engine))
                          .map((engine) => (
                            <div key={engine} className="co-prompt-options">
                              <small>{engine} · Workflow default</small>
                              <ModelPicker
                                engine={engineId(engine)}
                                value={draft.modelDefaults?.[engineId(engine)]}
                                label={`${engine} task default`}
                                onChange={(choice) =>
                                  update({
                                    modelDefaults: {
                                      ...draft.modelDefaults,
                                      [engineId(engine)]: choice,
                                    },
                                  })
                                }
                              />
                            </div>
                          ))}
                      {!live.native || live.engines.some((engine) => !engine.installed) ? (
                        <details className="co-start-setup">
                          <summary>Engine setup</summary>
                          <EngineSetup />
                        </details>
                      ) : null}
                      <p className="co-composer-privacy">
                        History stays on this Mac. Sending shares this prompt and its attachments
                        with the selected provider.
                      </p>
                    </div>
                  )}
                </details>
                {draft.text.length > 2700 && (
                  <span className="co-composer-count">{draft.text.length}/3,000</span>
                )}
                <button
                  className="co-composer-send"
                  aria-label={draft.makeTask ? "Create workflow" : "Send message"}
                  title={
                    sending
                      ? "Starting…"
                      : running
                        ? "Engine working…"
                        : draft.makeTask
                          ? "Create workflow"
                          : "Send · Enter"
                  }
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
                  <ArrowUp size={16} />
                </button>
              </>
            }
          >
            <textarea
              ref={input}
              id="company-prompt"
              rows={1}
              maxLength={3000}
              placeholder={
                draft.makeTask
                  ? "Describe the workflow…"
                  : chat
                    ? "Reply…"
                    : selectedProject
                      ? `Ask AgentOS anything in ${selectedProject.name}…`
                      : "Ask AgentOS anything…"
              }
              value={draft.text}
              disabled={sending}
              onChange={(e) => update({ text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </AttachmentEditor>
        </form>
      </div>
    </section>
  );
}
