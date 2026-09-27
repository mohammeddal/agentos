import { useEffect, useRef, useState } from "react";
import { ArrowUp, ClipboardList, MessageSquare, Plus, ShieldCheck } from "lucide-react";
import { companyDomains, type Company, type CompanyChat, type CompanyTask } from "./company-model";
import { emptyPrompt, parsePromptDraft, PROMPT_STORAGE, quickTaskError, taskFromPrompt, type PromptDraft } from "./prompt-composer";
import "./company-start.css";
import { WorkDetail } from "./WorkDetail";

export function CompanyStart({ company, change, editTask, activity }: { activity: () => void; company: Company; change: (update: (c: Company) => Company) => void; editTask: (task: CompanyTask) => void }) {
  const [initial] = useState(() => { try { return { draft: parsePromptDraft(localStorage.getItem(PROMPT_STORAGE)), error: "" }; } catch { return { draft: { ...emptyPrompt }, error: "Draft storage could not be read. Your saved draft was left untouched; this composer will use session-only storage." }; } });
  const [draft, setDraft] = useState<PromptDraft>(initial.draft);
  const [storageError, setStorageError] = useState(initial.error);
  const [notice, setNotice] = useState("");
  const [createdTaskId, setCreatedTaskId] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const chat = company.chats?.find(c => c.id === draft.chatId);
  const linkedTask = company.tasks?.find(t => t.id === chat?.taskId);
  const createdTask = company.tasks?.find(t => t.id === createdTaskId);
  const projectMissing = !!draft.projectId && !company.projects?.some(p => p.id === draft.projectId);
  const error = draft.makeTask ? quickTaskError(company, draft) : projectMissing ? "Choose an available project or Company-wide." : null;
  useEffect(() => { if (initial.error) return; try { localStorage.setItem(PROMPT_STORAGE, JSON.stringify(draft)); setStorageError(""); } catch { setStorageError("Draft storage is unavailable. Keep this window open or copy your prompt before leaving."); } }, [draft, initial.error]);
  const update = (values: Partial<PromptDraft>) => { setDraft(d => ({ ...d, ...values })); setNotice(""); setCreatedTaskId(""); };
  function submit() {
    if (submitting.current || !draft.text.trim() || error || (draft.makeTask && linkedTask)) return;
    submitting.current = true;
    try {
      const now = new Date().toISOString();
      if (draft.makeTask) {
        const task = taskFromPrompt(company, draft, crypto.randomUUID(), now);
        change(c => ({ ...c, tasks: [task, ...(c.tasks || [])], ...(chat ? { chats: (c.chats || []).map(item => item.id === chat.id ? { ...item, taskId: task.id } : item) } : {}) }));
        setCreatedTaskId(task.id); setNotice("Task created as Planned. It has not started; human approval is required before execution.");
        setDraft(d => ({ ...d, text: "", chatId: "", makeTask: false }));
      } else {
        const message = { id: crypto.randomUUID(), text: draft.text.trim(), createdAt: now };
        const saved: CompanyChat = chat ? { ...chat, messages: [...chat.messages, message] } : { id: crypto.randomUUID(), engine: draft.engine, ...(draft.projectId ? { projectId: draft.projectId } : {}), createdAt: now, messages: [message] };
        change(c => ({ ...c, chats: chat ? (c.chats || []).map(item => item.id === chat.id ? saved : item) : [saved, ...(c.chats || [])] }));
        setDraft(d => ({ ...d, text: "", chatId: saved.id })); setNotice("Chat draft saved locally. No prompt was sent and no AI response was generated.");
      }
    } finally { submitting.current = false; }
  }
  function openChat(item: CompanyChat) {
    if (draft.text.trim() && !window.confirm("Replace the unsaved composer text with this chat?")) return;
    setDraft({ ...emptyPrompt, chatId: item.id, engine: item.engine, projectId: item.projectId || "" }); setNotice(""); setCreatedTaskId(""); input.current?.focus();
  }
  function newChat() {
    if (draft.text.trim() && !window.confirm("Clear the current composer text and start a new chat?")) return;
    setDraft({ ...emptyPrompt }); setNotice(""); setCreatedTaskId(""); input.current?.focus();
  }
  function convert() {
    if (!chat) return;
    if (draft.text.trim() && !window.confirm("Replace the composer text with this chat’s latest prompt?")) return;
    // One saved user prompt is the source; do not silently truncate a long conversation.
    update({ makeTask: true, text: chat.messages[chat.messages.length - 1]!.text }); input.current?.focus();
  }
  return <section className="co-start" aria-label="Start a chat or task">
    <div className="co-start-main">
      <div className="co-start-intro"><span className="co-section-kicker">START WITH AN IDEA</span><h1>What would you like to work on?</h1><p>A question, a rough idea, or a clear task. Start by writing it down.</p></div>
      {chat && <><WorkDetail key={chat.id} company={company} chat={chat} openTask={editTask} activity={activity} /><div className="co-chat-detail-actions">{!linkedTask && <button className="co-button" onClick={convert}><ClipboardList size={13} />Make latest prompt a task</button>}</div></>}
      <form className="co-prompt-box" onSubmit={e => { e.preventDefault(); submit(); }}>
        <label className="co-prompt-label" htmlFor="company-prompt">{draft.makeTask ? "Describe the task" : chat ? "Continue your draft" : "Your prompt"}</label>
        <textarea ref={input} id="company-prompt" rows={5} maxLength={3000} placeholder={draft.makeTask ? "What should get done?" : "Ask a question or describe what you want to do…"} value={draft.text} onChange={e => update({ text: e.target.value })} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
        <div className="co-prompt-controls"><label className="co-prompt-task-toggle"><input type="checkbox" checked={draft.makeTask} onChange={e => update({ makeTask: e.target.checked, ...(!e.target.checked && chat ? { projectId: chat.projectId || "" } : {}) })} /><ClipboardList size={14} />Make this a task</label><label>Project<select aria-label="Prompt project" disabled={!!chat && !draft.makeTask} value={draft.projectId} onChange={e => update({ projectId: e.target.value })}><option value="">Company-wide</option>{projectMissing && <option value={draft.projectId}>Unavailable project</option>}{(company.projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
        {draft.makeTask ? <div className="co-prompt-task-options"><label>Assign to<select aria-label="Quick task assignee" value={draft.target} onChange={e => update({ target: e.target.value })}><option value="">Choose a domain or agent</option><optgroup label="Domains">{companyDomains(company).map(d => <option key={d} value={`d:${d}`}>{d}</option>)}</optgroup><optgroup label="Agents">{company.offices.flatMap(o => o.agents.map(a => <option key={a.id} value={`a:${a.id}`}>{a.name} · {o.name}</option>))}</optgroup></select></label><span><ShieldCheck size={13} />Your approval required</span><small>Add more assignees, schedules, and handoffs after creating the task.</small></div> : <div className="co-prompt-engine"><label>Preferred engine<select aria-label="Chat engine preference" disabled={!!chat} value={draft.engine} onChange={e => update({ engine: e.target.value })}>{[...new Set(["Codex", "Claude Code", "Gemini", "Choose later", draft.engine])].map(engine => <option key={engine}>{engine}</option>)}</select></label><span>Not connected · Draft only</span></div>}
        <footer><small>⌘ / Ctrl + Enter · {draft.text.length}/3,000</small><button className="co-button co-button-primary" disabled={!draft.text.trim() || !!error || (draft.makeTask && !!linkedTask)}>{draft.makeTask ? "Create task" : "Save chat draft"}<ArrowUp size={16} /></button></footer>
      </form>
      {draft.makeTask && linkedTask && <p className="co-form-note">This chat already has a task. Open its linked task to edit it, or start a new prompt.</p>}
      {draft.makeTask && error && draft.text.trim() && <p className="co-prompt-hint">{error}</p>}{!draft.makeTask && projectMissing && <p role="alert" className="co-form-error">{error}</p>}
      {notice && <div className="co-prompt-result" role="status"><p>{notice}</p>{createdTask && <button className="co-button" onClick={() => editTask(createdTask)}>Open task details</button>}</div>}
      {storageError && <p className="co-form-error" role="alert">{storageError}</p>}
      <p className="co-prompt-hint">This company workspace is not connected to an engine yet. Chats stay as local drafts; tasks stay planned. Nothing is sent automatically when an engine is connected later.</p>
    </div>
    <aside className="co-start-history"><header><h3>Recent chats</h3><button className="co-button" onClick={newChat}><Plus size={13} />New chat</button></header>{!(company.chats || []).length && <p>Your saved prompts will appear here. You can make a prompt a task whenever you’re ready.</p>}{(company.chats || []).map(item => <button className="co-chat-history-item" key={item.id} aria-pressed={chat?.id === item.id} onClick={() => openChat(item)}><MessageSquare size={15} /><span><strong>{item.messages[0]!.text.slice(0, 80)}</strong><small>{item.engine} · {item.messages.length} {item.messages.length === 1 ? "prompt" : "prompts"} · Not sent</small></span></button>)}</aside>
  </section>;
}
