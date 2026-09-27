import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, ArrowRight, ArrowUp, Bot, Brain, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clipboard, Clock3, Command, Eye, File, Folder, FolderOpen, LayoutGrid, ListChecks, Loader2, Maximize2, MessageSquare, Pencil, Pin, Plus, Radio, RefreshCw, RotateCcw, Save, Search, Settings2, ShieldCheck, Sparkles, Square, Trash2, X } from "lucide-react";
import type { AgentProfile, Decision, LiveRun, MemoryKind, MemoryRecord, Mission, RoleId, RoutePreview, SkillProfile, StudioState } from "../../shared/studio-types";
import { OperationsWorld } from "./OperationsWorld";
import "./studio.css";

const roles = [
  { id: "detective" as const, name: "Investigator", job: "Evidence & diagnosis", color: "#5899b1", short: "Traces evidence across the workspace and connected data systems before a change is proposed." },
  { id: "builder" as const, name: "Builder", job: "Code & implementation", color: "#dd9c61", short: "Handles implementation requests. Any runtime permission request appears beside the task." },
  { id: "reviewer" as const, name: "Reviewer", job: "Quality & review", color: "#8a9a78", short: "Examines code, checks assumptions, and reports what needs attention." },
  { id: "historian" as const, name: "Historian", job: "Context & history", color: "#a38db7", short: "Traces changes and finds the context behind your workspace." }
];
const emptyState: StudioState = { connected: false, authenticated: false, detail: "Connecting…", workspaces: [], runs: [], missions: [], agents: [], skills: [], memories: [] };
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/studio/${path}`, { headers: { "X-StaffForge-Client": "studio", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result as T;
}
const active = (run?: LiveRun) => !!run && (run.status === "running" || run.status === "waiting");
type CapabilityDraft = { name: string; description: string; instructions: string };

export function Studio() {
  const [state, setState] = useState(emptyState);
  const [connectionError, setConnectionError] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [requestMode, setRequestMode] = useState<"mission" | "quick">("mission");
  const [studioMode, setStudioMode] = useState<"operate" | "build">("operate");
  const [missionCriteria, setMissionCriteria] = useState("Root cause is supported by evidence\nRecovery action is safe and approved when required\nData health and downstream impact are verified");
  const [workspace, setWorkspace] = useState("project");
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"answer" | "activity">("answer");
  const [agent, setAgent] = useState<RoleId>("detective");
  const [inspectedAgentId, setInspectedAgentId] = useState<string | null>(null);
  const [runWith, setRunWith] = useState("auto");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [skillsMenu, setSkillsMenu] = useState(false);
  const [manage, setManage] = useState<"agent" | "skill" | null>(null);
  const [help, setHelp] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(() => new URLSearchParams(window.location.search).has("memory"));
  const [worldOpen, setWorldOpen] = useState(() => new URLSearchParams(window.location.search).has("world"));
  const [historyFilter, setHistoryFilter] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [copied, setCopied] = useState(false);
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [capabilityDraft, setCapabilityDraft] = useState<CapabilityDraft | undefined>();
  const composer = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const run = state.runs.find(item => item.id === selected);
  const mission = state.missions.find(item => item.id === selectedMissionId);
  const missionTask = run?.missionId ? state.missions.find(item => item.id === run.missionId)?.tasks.find(item => item.id === run.missionTaskId) : undefined;
  const activeRuns = state.runs.filter(item => active(item));
  const visibleMissions = state.missions.filter((item, index, items) => items.findIndex(candidate => candidate.objective === item.objective) === index);
  const backgroundRuns = activeRuns.filter(item => item.id !== selected);
  const currentWorkspace = state.workspaces.find(item => item.id === workspace);
  const ready = state.connected && state.authenticated;

  useEffect(() => {
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try { const next = await api<StudioState>("state"); if (!stopped) { setState(next); setConnectionError(""); } }
      catch { if (!stopped) setConnectionError("Local server is unavailable. Start pnpm dev, then reconnect."); }
      if (!stopped) timer = setTimeout(refresh, 800);
    }
    void refresh(); return () => { stopped = true; clearTimeout(timer); };
  }, []);
  useEffect(() => {
    const saved = sessionStorage.getItem("staffforge:run"); if (saved) setSelected(saved);
    function key(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") { event.preventDefault(); composer.current?.focus(); }
      if (event.key === "Escape") { setWorkspaceMenu(false); setSkillsMenu(false); setHelp(false); setMemoryOpen(false); setManage(null); setWorldOpen(false); }
    }
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => { if (selected) sessionStorage.setItem("staffforge:run", selected); else sessionStorage.removeItem("staffforge:run"); }, [selected]);
  useEffect(() => { if (run?.role) { setAgent(run.role); setInspectedAgentId(run.agentId.startsWith("built-in:") ? null : run.agentId); } }, [run?.role, run?.agentId]);
  useEffect(() => { if (run?.status === "completed" || run?.status === "waiting" || run?.status === "failed") { setTab("answer"); resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); } }, [run?.status]);
  useEffect(() => {
    if (!objective.trim() || run || requestMode === "mission") { setRoutePreview(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => { void api<RoutePreview>("route", { objective, agentId: runWith }).then(preview => { if (!cancelled) setRoutePreview(preview); }).catch(() => { if (!cancelled) setRoutePreview(null); }); }, 280);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [objective, runWith, run, requestMode]);

  async function submit(text = objective) {
    if (!text.trim() || busy || activeRuns.length >= 4) return;
    setBusy(true); setError("");
    try {
      const created = await api<LiveRun>("run", { objective: text, workspace, agentId: runWith, skillIds });
      setState(previous => ({ ...previous, runs: [created, ...previous.runs.filter(item => item.id !== created.id)] }));
      setSelected(created.id); setAgent(created.role); setTab("answer"); setObjective("");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not start the request."); }
    finally { setBusy(false); }
  }
  async function submitMission() {
    if (!objective.trim() || busy || activeRuns.length > 2) return;
    setBusy(true); setError("");
    try {
      const created = await api<Mission>("missions/create", { objective, workspace, acceptanceCriteria: missionCriteria.split("\n").map(item => item.trim()).filter(Boolean) });
      setState(previous => ({ ...previous, missions: [created, ...previous.missions.filter(item => item.id !== created.id)] }));
      setSelectedMissionId(created.id); setSelected(null); setObjective("");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not start the mission."); }
    finally { setBusy(false); }
  }
  async function createCapability(kind: "agent" | "skill", values: { name: string; description: string; instructions: string }) {
    setBusy(true); setError("");
    try {
      const created = kind === "agent" ? await api<AgentProfile>("agents/create", values) : await api<SkillProfile>("skills/create", values);
      const next = await api<StudioState>("state"); setState(next);
      if (kind === "agent") setRunWith(created.id); else setSkillIds(previous => [...new Set([...previous, created.id])]);
      setManage(null);
    } catch (error) { setError(error instanceof Error ? error.message : `Could not create the ${kind}.`); }
    finally { setBusy(false); }
  }
  async function action(path: string, body: unknown) {
    setError(""); setBusy(true);
    try { await api(path, body); setState(await api<StudioState>("state")); }
    catch (error) { setError(error instanceof Error ? error.message : "Action failed."); }
    finally { setBusy(false); }
  }
  async function repeat(previous: LiveRun) {
    if (busy || activeRuns.length >= 4) return;
    setBusy(true); setError("");
    try {
      const created = await api<LiveRun>("run", { objective: previous.objective, workspace, agentId: previous.agentId, skillIds: previous.skillIds });
      setState(current => ({ ...current, runs: [created, ...current.runs.filter(item => item.id !== created.id)] }));
      setSelected(created.id); setAgent(created.role); setTab("answer");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not run this request again."); }
    finally { setBusy(false); }
  }
  function saveAsSkill(previous: LiveRun) {
    const shortName = previous.objective.replace(/[^a-zA-Z0-9 ]+/g, "").trim().split(/\s+/).slice(0, 5).join(" ") || "Reusable workflow";
    setCapabilityDraft({
      name: shortName,
      description: `Repeat the verified workflow used for: ${previous.objective}`.slice(0, 500),
      instructions: `Use this workflow when the user asks for a similar outcome.\n\n1. Confirm the target workspace and success criteria.\n2. Follow the evidence-backed approach from the original task.\n3. Keep consequential actions behind explicit approval.\n4. Verify the result and return the artifact, evidence, and any unresolved issues.\n\nOriginal outcome:\n${previous.answer}`.slice(0, 16000)
    });
    setManage("skill");
  }
  function newTask() { setSelected(null); setSelectedMissionId(null); setTab("answer"); setError(""); setObjective(""); composer.current?.focus(); }
  function switchStudioMode(mode: "operate" | "build") {
    setStudioMode(mode); setRequestMode("mission");
    setMissionCriteria(mode === "operate"
      ? "Root cause is supported by evidence\nRecovery action is safe and approved when required\nData health and downstream impact are verified"
      : "Architecture and data contract are clear\nImplementation and data tests pass\nIndependent review finds no blocking issue");
  }
  const selectedRole = roles.find(item => item.id === agent)!;
  const owner = roles.find(item => item.id === run?.role);
  const customAgents = state.agents.filter(item => item.source !== "built-in");
  const selectedAgent = runWith === "auto" ? null : state.agents.find(item => item.id === runWith);
  const selectedSkills = state.skills.filter(item => skillIds.includes(item.id));
  const inspectedProfile = inspectedAgentId ? state.agents.find(item => item.id === inspectedAgentId) : state.agents.find(item => item.id === `built-in:${agent}`);
  const inspectedRuns = state.runs.filter(item => (!item.missionId || !!item.displayObjective) && (inspectedAgentId ? item.agentId === inspectedAgentId : item.role === agent));
  const inspectedActive = inspectedRuns.filter(item => active(item));
  const inspectedPast = inspectedRuns.filter(item => !active(item)).slice(0, 5);
  function inspectRole(id: RoleId) { setAgent(id); setInspectedAgentId(null); }
  function openRun(id: string) { const target = state.runs.find(item => item.id === id); setSelected(id); if (target?.missionId) setSelectedMissionId(target.missionId); setTab("answer"); }
  const statusLabel = run?.phase === "planning" ? "Planning" : run?.phase === "verifying" ? "Verifying" : run?.status === "waiting" ? "Needs you" : run?.status === "running" ? "Working" : run?.status === "completed" ? "Complete" : run?.status === "cancelled" ? "Stopped" : "Needs attention";

  return <div className="studio-shell">
    <aside className="studio-sidebar">
      <a className="studio-brand" href="/" aria-label="Back to data canvas"><span className="studio-logomark"><span/><span/><span/></span><strong>DataGuild</strong></a>
      <div className="workspace-control"><button className="workspace-select" onClick={() => setWorkspaceMenu(value => !value)} aria-expanded={workspaceMenu}><span className="workspace-monogram">{workspace === "desktop" ? "D" : "dg"}</span><span><strong>{currentWorkspace?.name ?? "dataGuild"}</strong><small>Local workspace</small></span><ChevronDown size={14}/></button>{workspaceMenu && <div className="workspace-options">{state.workspaces.map(item => <button key={item.id} onClick={() => { setWorkspace(item.id); setWorkspaceMenu(false); newTask(); }}><Folder size={15}/><span>{item.name}<small>{item.path}</small></span>{item.id === workspace && <Check size={14}/>}</button>)}</div>}</div>
      <button className="new-task" onClick={newTask}><Plus size={17}/>Start mission<span>⌘ K</span></button>
      <div className="side-section"><span>CONTROL ROOM</span><button className="sidebar-current" onClick={newTask}><LayoutGrid size={16}/>World<small>{activeRuns.length || ""}</small></button><button className="memory-nav" onClick={() => setMemoryOpen(true)}><Brain size={16}/>Runbooks & memory<small>{state.memories.filter(item => item.scope === currentWorkspace?.path).length}</small></button></div>
      {!!visibleMissions.length && <><div className="history-heading"><span>MISSIONS</span><small>{visibleMissions.filter(item => !["completed", "failed", "cancelled"].includes(item.status)).length || ""}</small></div><div className="mission-history">{visibleMissions.slice(0,5).map(item => <button key={item.id} className={selectedMissionId === item.id ? "chosen" : ""} onClick={() => { setSelectedMissionId(item.id); setSelected(null); }}><span className={`mission-history-mark mission-history-mark--${item.status}`}>{item.status === "completed" ? <Check size={10}/> : <span/>}</span><span><strong>{item.objective}</strong><small>{item.stage} · {item.status}</small></span></button>)}</div></>}
      <div className="history-heading"><span>RECENT REQUESTS</span><button aria-label="Search request history" title="Search requests" onClick={() => setShowSearch(value => !value)}><Search size={14}/></button></div>
      {showSearch && <input className="history-search" aria-label="Search requests" placeholder="Find a request…" value={historyFilter} onChange={event => setHistoryFilter(event.target.value)}/>} 
      <div className="request-history">{state.runs.filter(item => !item.missionId && item.objective.toLowerCase().includes(historyFilter.toLowerCase())).map(item => <button key={item.id} className={selected === item.id ? "chosen" : ""} onClick={() => { setSelectedMissionId(null); setSelected(item.id); setTab("answer"); }}><span className={`history-dot history-dot--${item.status}`}/><span><strong>{item.objective}</strong><small>{item.agentName} · {item.phase === "needs-you" ? "Needs you" : item.phase}</small></span>{item.status === "waiting" && <span className="needs-you-dot">!</span>}</button>)}{!state.runs.some(item => !item.missionId) && <p>Quick requests will appear here.</p>}{state.runs.some(item => !item.missionId) && !state.runs.some(item => !item.missionId && item.objective.toLowerCase().includes(historyFilter.toLowerCase())) && <p>No matching requests.</p>}</div>
      <div className="sidebar-foot"><div className={`runtime-indicator ${ready && !connectionError ? "is-connected" : ""}`}><i/><span>{ready && !connectionError ? "Codex connected" : "Codex unavailable"}<small>{ready ? "Your account · local execution" : "Check your connection"}</small></span></div><button onClick={() => setHelp(true)}><CircleHelp size={16}/>How it works<ArrowRight size={14}/></button><div className="local-user"><span>M</span><div><strong>My workspace</strong><small>On this Mac</small></div><ShieldCheck size={16}/></div></div>
    </aside>
    <main className="studio-main">
      <header className="studio-topbar"><div className="topbar-context"><a href="/">Data canvas</a><ChevronRight size={13}/><strong>Project orchestration</strong></div><div className="studio-mode" role="tablist" aria-label="Studio mode"><button role="tab" aria-selected={studioMode === "operate"} className={studioMode === "operate" ? "selected" : ""} onClick={() => switchStudioMode("operate")}>Operate</button><button role="tab" aria-selected={studioMode === "build"} className={studioMode === "build" ? "selected" : ""} onClick={() => switchStudioMode("build")}>Build</button></div><span className="room-capacity"><strong>{activeRuns.length}</strong><span>of 4 agents active</span></span><span className="local-pill"><span/>{ready ? "Local Codex connected" : "Runtime unavailable"}</span><button className="memory-trigger" onClick={() => setMemoryOpen(true)}><Brain size={15}/><span>{state.memories.filter(item => item.scope === currentWorkspace?.path).length} memories</span></button><button className="help-trigger" aria-label="How DataGuild works" onClick={() => setHelp(true)}><CircleHelp size={18}/></button></header>
      <div className="studio-content">
        <div className="studio-heading"><div className="page-overline">{studioMode.toUpperCase()} · {currentWorkspace?.name?.toUpperCase() ?? "LOCAL WORKSPACE"}</div><div><h1>{mission ? mission.objective : studioMode === "operate" ? "See the system. Resolve what matters." : "Build from source to verified insight."}</h1><span className="today">{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}<span> / </span>LIVE</span></div><p>{mission ? "Evidence, agents, decisions, and verification remain connected to the same mission." : studioMode === "operate" ? "Investigate failures across your stack, approve recovery, and verify the data outcome." : "Plan, implement, review, and deliver a new data product through one connected system."}</p></div>
        {(connectionError || !ready) && <div className="connection-banner" role="status"><Radio size={17}/><span>{connectionError || state.detail}<small>Desktop listings use your local filesystem directly.</small></span><button disabled={busy} onClick={() => void action("reconnect", {})}><RefreshCw size={14}/>Reconnect</button></div>}
        {backgroundRuns.length > 0 && <div className="active-run-stack" aria-label="Other active requests"><header><span><Loader2 size={14} className="rotating"/>{backgroundRuns.length} other request{backgroundRuns.length === 1 ? "" : "s"} active</span><em>{activeRuns.length}/4 capacity</em></header>{backgroundRuns.slice(0,3).map(item => <button key={item.id} className="running-banner" onClick={() => openRun(item.id)}><AgentAvatar color={roles.find(role => role.id === item.role)?.color ?? "#5899b1"}/><span>{item.status === "waiting" ? "Needs your attention" : `${item.agentName} · ${item.phase}`}<strong>{item.displayObjective ?? item.objective}</strong></span><ArrowRight size={18}/></button>)}</div>}
        <div className="studio-grid">
          <section className="work-column">
            <div className="request-panel"><div className="panel-caption"><span><MessageSquare size={15}/>{run ? missionTask ? "MISSION TASK" : "YOUR REQUEST" : mission ? "MISSION CONTROL" : studioMode === "operate" ? "RECOVERY CONTROL" : "BUILD CONTROL"}</span><span className="quiet-number">01</span></div>
              {run ? <><h2 className="request-title">{missionTask?.title ?? run.objective}</h2>{missionTask && <p className="mission-task-context">{mission?.objective ?? state.missions.find(item => item.id === run.missionId)?.objective}</p>}<div className="request-meta"><span><FolderOpen size={13}/>{run.workspace.split("/").at(-1)}</span><span><Clock3 size={13}/>{new Date(run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span className={`request-status request-status--${run.status}`}>{active(run) ? <span className="status-pulse"/> : <Check size={11}/>} {statusLabel}</span></div><TaskLifecycle run={run}/></> : mission ? <MissionOverview mission={mission}/> : <><div className="request-mode" role="tablist" aria-label="Request type"><button role="tab" aria-selected={requestMode === "mission"} className={requestMode === "mission" ? "selected" : ""} onClick={() => setRequestMode("mission")}><CheckCheck size={14}/><span><strong>{studioMode === "operate" ? "Recovery mission" : "Delivery mission"}</strong><small>Evidence · action · verification</small></span></button><button role="tab" aria-selected={requestMode === "quick"} className={requestMode === "quick" ? "selected" : ""} onClick={() => setRequestMode("quick")}><ArrowUp size={14}/><span><strong>Quick request</strong><small>One agent · direct answer</small></span></button></div><div className="welcome-copy"><h2>{requestMode === "mission" ? studioMode === "operate" ? "What needs to be restored?" : "What should the team deliver?" : "What do you need right now?"}</h2><p>{requestMode === "mission" ? studioMode === "operate" ? "DataGuild will trace evidence, prepare a safe action, and verify recovery." : "DataGuild will plan the work, coordinate implementation, and require independent review." : "Send one focused request to an agent, with optional skills."}</p></div></>}
              {!run && !mission && requestMode === "mission" && <form className="request-composer mission-composer" onSubmit={event => { event.preventDefault(); void submitMission(); }}>
                <textarea ref={composer} aria-label="Mission outcome" placeholder={studioMode === "operate" ? "Example: Find why fct_orders is late, recover it safely, and verify downstream dashboards" : "Example: Build a customer revenue pipeline with tests, independent review, and a verified release"} value={objective} onChange={event => setObjective(event.target.value)} maxLength={8000}/>
                <label className="criteria-field"><span>DONE MEANS</span><textarea aria-label="Acceptance criteria" value={missionCriteria} onChange={event => setMissionCriteria(event.target.value)} rows={3}/></label>
                <div className="mission-launch"><span><span>2</span> agents start in parallel <i/> then build <i/> then verify</span><button disabled={busy || activeRuns.length > 2 || !objective.trim()}>{busy ? <Loader2 size={15} className="rotating"/> : <ArrowRight size={15}/>}Start mission</button></div>
              </form>}
              {!run && !mission && requestMode === "quick" && <form className="request-composer" onSubmit={event => { event.preventDefault(); void submit(); }}>
                <textarea ref={composer} aria-label="Your request" placeholder="What files do I have on my Desktop?" value={objective} onChange={event => setObjective(event.target.value)} maxLength={8000} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }}/>
                <div className="capability-controls">
                  <label className="agent-picker"><Bot size={14}/><span>Run with</span><select aria-label="Run with agent" value={runWith} onChange={event => setRunWith(event.target.value)}><option value="auto">Auto · visible routing</option>{state.agents.map(item => <option key={item.id} value={item.id}>{item.name} · {item.source}</option>)}</select><ChevronDown size={12}/></label>
                  <div className="skill-picker"><button type="button" aria-expanded={skillsMenu} onClick={() => setSkillsMenu(value => !value)}><Sparkles size={14}/><span>{selectedSkills.length ? `${selectedSkills.length} skill${selectedSkills.length === 1 ? "" : "s"}` : "Add skills"}</span><ChevronDown size={12}/></button>{skillsMenu && <div className="skill-menu"><header><strong>Skills for this request</strong><button type="button" onClick={() => void action("capabilities/refresh", {})}><RefreshCw size={12}/>Refresh</button></header>{state.skills.map(skill => <label key={skill.id}><input type="checkbox" checked={skillIds.includes(skill.id)} onChange={() => setSkillIds(previous => previous.includes(skill.id) ? previous.filter(id => id !== skill.id) : [...previous, skill.id])}/><span><strong>{skill.name}</strong><small>{skill.description}</small></span><em>{skill.source}</em></label>)}{!state.skills.length && <p>No personal or project skills found yet.</p>}<footer><button type="button" onClick={() => { setSkillsMenu(false); setManage("skill"); }}><Plus size={12}/>New project skill</button></footer></div>}</div>
                  <button className="manage-capabilities" type="button" title="Add an agent or skill" onClick={() => { setSkillsMenu(false); setWorkspaceMenu(false); setManage("agent"); }}><Settings2 size={14}/><span>Manage</span></button>
                  <button className="send-request" disabled={busy || activeRuns.length >= 4 || !objective.trim()} aria-label="Send request"><ArrowUp size={18}/></button>
                </div>
                <div className={`routing-preview ${routePreview ? "routing-preview--ready" : ""}`}><span><FolderOpen size={12}/>{currentWorkspace?.name ?? "dataGuild"}</span><span>{routePreview ? <><strong>{routePreview.agentName}</strong> · {routePreview.reason}</> : selectedAgent ? `${selectedAgent.name} will own this request.` : "Auto chooses by intent and records why."}</span><span className="composer-key">↵ to send</span></div>
                {routePreview && <div className="preflight"><span><ShieldCheck size={12}/>{routePreview.access}</span><span><Eye size={12}/>{routePreview.review}</span></div>}
                {selectedSkills.length > 0 && <div className="selected-skills">{selectedSkills.map(skill => <button key={skill.id} type="button" onClick={() => setSkillIds(previous => previous.filter(id => id !== skill.id))}>{skill.name}<X size={10}/></button>)}</div>}
              </form>}
              {!run && !mission && requestMode === "quick" && <div className="suggestion-list"><span>A PLACE TO START</span>{["What files do I have on my Desktop?", "Explain what this project does", "Review the README for missing setup steps"].map((text, index) => <button key={text} disabled={activeRuns.length >= 4 || busy} onClick={() => void submit(text)}>{index === 0 ? <Folder size={15}/> : index === 1 ? <Command size={15}/> : <ShieldCheck size={15}/>}<span>{text}</span><ArrowUp size={13}/></button>)}</div>}
            </div>
            {run && <div className="execution-panel" ref={resultRef}>
              <div className="execution-header"><div><AgentAvatar color={owner?.color ?? "#5899b1"}/><span><strong>{run.agentName}</strong><small>{run.action}</small></span></div>{active(run) && <button className="stop-button" disabled={busy} onClick={() => void action("stop", { runId: run.id })}><Square size={11}/>Stop</button>}{run.status === "completed" && <span className="answer-ready"><CheckCheck size={15}/>Answer ready</span>}</div>
              <div className="run-routing"><Bot size={13}/><span><strong>{run.agentName}</strong> · {run.routingReason}</span>{run.skillNames.map(name => <em key={name}><Sparkles size={10}/>{name}</em>)}</div>
              {run.decisions.map(decision => <DecisionCard key={decision.id} decision={decision} busy={busy} onDecide={(allow, answers) => action("decision", { runId: run.id, decisionId: decision.id, allow, answers })}/>)}
              <div className="result-tabs" role="tablist" aria-label="Request result"><button role="tab" aria-selected={tab === "answer"} className={tab === "answer" ? "selected" : ""} onClick={() => setTab("answer")}>Answer{run.status === "completed" && <i/>}</button><button role="tab" aria-selected={tab === "activity"} className={tab === "activity" ? "selected" : ""} onClick={() => setTab("activity")}>Activity<span>{run.activities.length}</span></button><span className="source-label">{run.source === "filesystem" ? "Local filesystem" : "Live Codex"}</span></div>
              {tab === "answer" ? <div className="answer-body" role="tabpanel" aria-live="polite">
                {run.answer && <><RichAnswer text={run.answer}/>{run.files && <FileResults run={run}/>}<EvidenceCard run={run}/><div className="answer-footer"><span><Check size={13}/>{run.source === "filesystem" ? "Read from your Mac" : "Returned by Codex"}</span><div>{!run.missionId && <><button onClick={() => void repeat(run)} disabled={busy || activeRuns.length >= 4}><RotateCcw size={13}/>Run again</button><button onClick={() => saveAsSkill(run)}><Save size={13}/>Save as skill</button></>}<button onClick={() => { void navigator.clipboard.writeText(run.answer + (run.files ? "\n\n" + run.files.map(file => file.name).join("\n") : "")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => setError("Clipboard access was unavailable.")); }}><Clipboard size={13}/>{copied ? "Copied" : "Copy"}</button></div></div></>}
                {run.error && <div className="execution-error"><strong>We couldn’t complete this request.</strong><p>{run.error}</p>{!run.missionId && <button onClick={() => void submit(run.objective)} disabled={busy || activeRuns.length >= 4}><RefreshCw size={14}/>Try again</button>}</div>}
                {!run.answer && !run.error && active(run) && <div className="working-state"><span className={run.status === "running" ? "working-orbit" : "waiting-orbit"}>{run.status === "running" ? <Loader2 className="rotating" size={24}/> : <ShieldCheck size={24}/>}</span><strong>{run.status === "waiting" ? "Your decision keeps this moving." : `${run.agentName} is on it.`}</strong><p>{run.status === "waiting" ? "Review the request above. You can allow it once or decline." : run.action}</p><span>The answer will appear right here.</span></div>}
                {run.status === "cancelled" && !run.answer && <div className="working-state"><Square size={24}/><strong>Request stopped.</strong><p>You can inspect the activity or start a new request.</p></div>}
              </div> : <div className="activity-list" role="tabpanel">{run.activities.map(item => <details key={item.id}><summary><span className={`activity-indicator activity-indicator--${item.state}`}>{item.state === "working" && active(run) ? <Loader2 size={13} className="rotating"/> : item.state === "error" ? <X size={13}/> : <Check size={13}/>}</span><span>{item.label}</span><time>{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><ChevronDown size={12}/></summary><pre>{item.detail}</pre></details>)}</div>}
            </div>}
            {run && !active(run) && <div className="next-request"><span>What’s next?</span><form onSubmit={event => { event.preventDefault(); void submit(); }}><input aria-label="Next request" placeholder="Ask another question…" value={objective} onChange={event => setObjective(event.target.value)}/><button disabled={busy || activeRuns.length >= 4 || !objective.trim()} aria-label="Send next request"><ArrowUp size={17}/></button></form><small>Starts independently in {currentWorkspace?.name ?? "dataGuild"} · {activeRuns.length}/4 active</small></div>}
            {error && <div className="action-error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={14}/></button></div>}
            {!run && <div className="workflow-note"><span><span>1</span> Tell us the task</span><ChevronRight size={12}/><span><span>2</span> Follow the work</span><ChevronRight size={12}/><span><span>3</span> Get your answer</span></div>}
          </section>
          <aside className="team-column">
            <div className="team-panel">
              <header><div><span className="panel-eyebrow">YOUR DATA SYSTEM</span><h2>{currentWorkspace?.name ?? "Your workspace"}</h2><p>{activeRuns.length ? `${activeRuns.length} agent workstream${activeRuns.length === 1 ? "" : "s"} moving through the topology.` : "Connected systems, visible agents, one outcome."}</p></div><div className="team-header-actions"><span className={`team-live ${activeRuns.length ? "has-work" : ""}`}><i/>{activeRuns.length ? `${activeRuns.length} IN MOTION` : "SYSTEM READY"}</span><button className="world-expand" onClick={() => setWorldOpen(true)}><Maximize2 size={12}/>Expand</button></div></header>
              <OperationsWorld selected={agent} runs={activeRuns} mission={mission} projectName={currentWorkspace?.name ?? "Your workspace"} onSelect={inspectRole}/>
              <div className="world-caption"><span><span className="tiny-square"/> {activeRuns.length ? `${activeRuns.filter(item => item.status === "waiting").length ? `${activeRuns.filter(item => item.status === "waiting").length} need you · ` : ""}${activeRuns.length} request${activeRuns.length === 1 ? "" : "s"} in motion` : "Topology preview · connect live systems next"}</span><span>Codex execution is live locally</span></div>
              {mission && <MissionBoard mission={mission} runs={state.runs} onOpen={openRun}/>} 
              <ProjectWorkstream runs={activeRuns} onOpen={openRun}/>
              <div className="roster-heading"><span>TEAM SEATS</span><small>Choose a character to inspect their work</small></div>
              <div className="team-roster">{roles.map(role => { const assigned = run?.role === role.id; const roleRuns = activeRuns.filter(item => item.role === role.id); const lead = roleRuns.find(item => item.status === "waiting") ?? roleRuns[0]; return <button key={role.id} className={agent === role.id && !inspectedAgentId ? "agent-selected" : ""} onClick={() => inspectRole(role.id)}><AgentAvatar color={role.color}/><span><strong>{lead?.agentName ?? role.name}</strong><small>{role.job}{roleRuns.length > 1 ? ` · ${roleRuns.length} instances` : ""}</small></span><span className={`agent-status ${lead ? "agent-status--active" : ""}`}>{lead ? roleRuns.some(item => item.status === "waiting") ? "Needs you" : roleRuns.length > 1 ? `${roleRuns.length} working` : lead.phase : assigned && run.status === "completed" ? "Done" : "Available"}{lead && <i/>}</span></button>; })}</div>
              <AgentWorkPanel profile={inspectedProfile} role={selectedRole} current={inspectedActive} past={inspectedPast} onOpen={openRun}/>
              <div className="custom-capabilities"><header><span>YOUR CODEX SETUP</span><button onClick={() => { setCapabilityDraft(undefined); setManage("agent"); }}><Plus size={11}/>Add</button></header>{customAgents.length ? customAgents.slice(0,3).map(item => <button key={item.id} className={inspectedAgentId === item.id ? "selected" : ""} onClick={() => { setAgent(item.role); setInspectedAgentId(item.id); }}><AgentAvatar color={roles.find(role => role.id === item.role)?.color ?? "#5899b1"}/><span><strong>{item.name}</strong><small>{item.source} agent</small></span><ChevronRight size={12}/></button>) : <p>No custom agents yet. Add one here or place a TOML file in <code>.codex/agents</code>.</p>}<small>{state.skills.length} personal or project skill{state.skills.length === 1 ? "" : "s"} detected</small></div>
            </div>
            <div className="trust-note"><ShieldCheck size={17}/><div><strong>Parallel, with guardrails.</strong><p>Up to four independent requests can run together. Change tasks targeting the same workspace are serialized to prevent file conflicts.</p></div></div>
          </aside>
        </div>
        <footer className="studio-footer"><span>Built for the way you work.</span><span><span/>Files on your Mac · Live local runtime</span></footer>
      </div>
    </main>
    {help && <div className="studio-backdrop" onClick={event => { if (event.target === event.currentTarget) setHelp(false); }}><section className="help-dialog" role="dialog" aria-modal="true" aria-label="How DataGuild works"><button autoFocus aria-label="Close help" onClick={() => setHelp(false)}><X size={18}/></button><span className="panel-eyebrow">A QUICK TOUR</span><h2>From a system signal to a verified outcome.</h2><ol><li><strong>Choose Operate or Build.</strong><p>Start a recovery mission for an existing problem or a delivery mission for something new.</p></li><li><strong>Watch evidence move through the topology.</strong><p>Up to four Codex agents can investigate, implement, review, and document work independently.</p></li><li><strong>Decide and verify in one place.</strong><p>Permission requests stay with their mission. Results, evidence, and reviewed memory remain available after restart.</p></li></ol><div className="help-limit"><strong>Safe concurrency</strong><p>Read-only work can run freely in parallel. DataGuild serializes change-oriented tasks in the same workspace to prevent file conflicts.</p></div></section></div>}
    {memoryOpen && <MemoryDialog records={state.memories.filter(item => item.scope === currentWorkspace?.path)} busy={busy} onClose={() => setMemoryOpen(false)} onOpenRun={id => { setMemoryOpen(false); openRun(id); }} onUpdate={(id, changes) => action("memory/update", { id, ...changes })} onDelete={id => action("memory/delete", { id })}/>} 
    {manage && <CapabilityDialog key={`${manage}-${capabilityDraft?.name ?? "blank"}`} kind={manage} draft={manage === "skill" ? capabilityDraft : undefined} busy={busy} onClose={() => { setManage(null); setCapabilityDraft(undefined); }} onSwitch={kind => { setCapabilityDraft(undefined); setManage(kind); }} onCreate={values => createCapability(manage, values)}/>} 
    {worldOpen && <div className="world-overlay" role="dialog" aria-modal="true" aria-label="DataGuild living topology">
      <header><a className="studio-brand" href="#" onClick={event => { event.preventDefault(); setWorldOpen(false); }}><span className="studio-logomark"><span/><span/><span/></span><strong>DataGuild</strong></a><div><span>LIVING TOPOLOGY</span><strong>{currentWorkspace?.name ?? "Your workspace"}</strong></div><span className="world-overlay-live"><i/>{activeRuns.length ? `${activeRuns.length} agents live` : "System ready"}</span><button aria-label="Close world view" onClick={() => setWorldOpen(false)}><X size={18}/></button></header>
      <OperationsWorld selected={agent} runs={activeRuns} mission={mission} projectName={currentWorkspace?.name ?? "Your workspace"} onSelect={inspectRole}/>
      <aside className="world-overlay-inspector"><span className="panel-eyebrow">PROJECT INTELLIGENCE</span><h2>{mission?.objective ?? "Ready for the next mission"}</h2><div className="world-overlay-metrics"><span><strong>{activeRuns.length}</strong><small>active</small></span><span><strong>{state.agents.length}</strong><small>agents</small></span><span><strong>{state.skills.length}</strong><small>skills</small></span></div><div className="world-overlay-agents">{roles.map(role => { const roleRuns = activeRuns.filter(item => item.role === role.id); return <button key={role.id} onClick={() => inspectRole(role.id)}><AgentAvatar color={role.color}/><span><strong>{role.name}</strong><small>{roleRuns[0]?.action ?? role.job}</small></span><em>{roleRuns.length ? "LIVE" : "READY"}</em></button>; })}</div><button className="world-overlay-create" onClick={() => { setWorldOpen(false); newTask(); }}><Plus size={14}/>Start a new outcome</button></aside>
    </div>}
  </div>;
}

type MemoryFilter = MemoryKind | "review" | "all";
const memoryKinds: Array<{ id: MemoryFilter; label: string }> = [
  { id: "review", label: "Needs review" }, { id: "all", label: "All memory" }, { id: "workspace-fact", label: "Facts" }, { id: "decision", label: "Decisions" },
  { id: "preference", label: "Preferences" }, { id: "lesson", label: "Lessons" }, { id: "artifact", label: "Artifacts" }
];

function MemoryDialog({ records, busy, onClose, onOpenRun, onUpdate, onDelete }: {
  records: MemoryRecord[]; busy: boolean; onClose: () => void; onOpenRun: (id: string) => void;
  onUpdate: (id: string, changes: { title?: string; value?: string; pinned?: boolean; approve?: boolean; resolveConflict?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<MemoryFilter>("review");
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(30);
  useEffect(() => { setVisibleLimit(30); }, [kind, query]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const siblings = root.current?.parentElement ? [...root.current.parentElement.children].filter(element => element !== root.current) : [];
    siblings.forEach(element => { element.setAttribute("inert", ""); element.setAttribute("aria-hidden", "true"); });
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !root.current) return;
      const focusable = [...root.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]!; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleTab); return () => { document.removeEventListener("keydown", handleTab); document.body.style.overflow = previousOverflow; siblings.forEach(element => { element.removeAttribute("inert"); element.removeAttribute("aria-hidden"); }); previous?.focus(); };
  }, []);
  const filtered = records.filter(record => (kind === "review" ? record.status === "review" : kind === "all" || record.kind === kind) && `${record.title} ${record.value} ${record.sourceObjective}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  const conflicts = records.filter(record => record.status === "conflicted").length;
  const reviewCount = records.filter(record => record.status === "review").length;
  const trustedCount = records.filter(record => record.status === "active").length;
  return <div ref={root} className="memory-overlay" role="dialog" aria-modal="true" aria-label="Project memory">
    <header className="memory-topbar"><div><span className="memory-mark"><Brain size={18}/></span><span><strong>Project memory</strong><small>Durable context, grounded in completed work</small></span></div><div className="memory-path"><span/>.staffforge/memory/*.md</div><button aria-label="Close project memory" onClick={onClose}><X size={18}/></button></header>
    <div className="memory-layout">
      <aside className="memory-sidebar"><span className="panel-eyebrow">MEMORY WORKFLOW</span>{memoryKinds.map(item => <button key={item.id} aria-pressed={kind === item.id} className={kind === item.id ? "selected" : ""} onClick={() => setKind(item.id)}><span>{item.label}</span><small>{item.id === "review" ? reviewCount : item.id === "all" ? records.length : records.filter(record => record.kind === item.id).length}</small></button>)}<div className="memory-policy"><ShieldCheck size={16}/><strong>Review before reuse</strong><p>Low-confidence extractions stay out of agent context until you keep or edit them. Raw actions remain in the request ledger.</p></div></aside>
      <main className="memory-main"><div className="memory-heading"><div><span className="panel-eyebrow">LOCAL PROJECT KNOWLEDGE</span><h1>{memoryKinds.find(item => item.id === kind)?.label}</h1><p>{kind === "review" ? "Keep useful findings or remove noise. Unreviewed entries are never sent to agents." : "Only trusted and pinned entries are retrieved automatically. Conflicts remain excluded until resolved."}</p></div><div className="memory-stats"><span><strong>{trustedCount}</strong><small>trusted</small></span><span className={reviewCount ? "needs-review" : ""}><strong>{reviewCount}</strong><small>review</small></span><span className={conflicts ? "has-conflicts" : ""}><strong>{conflicts}</strong><small>conflicts</small></span></div></div>
        <label className="memory-search"><Search size={15}/><input autoFocus aria-label="Search project memory" placeholder="Search facts, sources, and decisions…" value={query} onChange={event => setQuery(event.target.value)}/><kbd>LOCAL</kbd></label>
        {filtered.length ? <><div className="memory-list">{filtered.slice(0, visibleLimit).map(record => <MemoryCard key={record.id} record={record} busy={busy} onOpenRun={onOpenRun} onUpdate={onUpdate} onDelete={onDelete}/>)}</div>{visibleLimit < filtered.length && <button className="memory-load-more" onClick={() => setVisibleLimit(limit => limit + 30)}>Show {Math.min(30, filtered.length - visibleLimit)} more <span>{visibleLimit}/{filtered.length}</span></button>}</> : <div className="memory-empty"><span><Brain size={25}/></span><h2>{records.length ? kind === "review" ? "Review queue cleared." : "No matching memories." : "Memory starts with completed work."}</h2><p>{records.length ? kind === "review" ? "Only trusted memory will be used in future work." : "Try another search or memory type." : "Finish a request and StaffForge will extract durable, source-linked facts here—not the entire conversation."}</p></div>}
      </main>
    </div>
  </div>;
}

function MemoryCard({ record, busy, onOpenRun, onUpdate, onDelete }: {
  record: MemoryRecord; busy: boolean; onOpenRun: (id: string) => void;
  onUpdate: (id: string, changes: { title?: string; value?: string; pinned?: boolean; approve?: boolean; resolveConflict?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false); const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(record.title); const [value, setValue] = useState(record.value);
  useEffect(() => { if (!editing) { setTitle(record.title); setValue(record.value); } }, [record.title, record.value, editing]);
  const kindLabel = memoryKinds.find(item => item.id === record.kind)?.label ?? record.kind;
  return <article aria-label={`${kindLabel}: ${record.title}`} className={`memory-card memory-card--${record.status} ${record.status === "conflicted" ? "is-conflicted" : ""}`}>
    <div className="memory-card-rail"><span className={`memory-kind memory-kind--${record.kind}`}>{kindLabel}</span>{record.status === "review" && <span className="memory-review-state"><Clock3 size={11}/>Review</span>}{record.status === "conflicted" && <span className="memory-conflict"><AlertTriangle size={11}/>Conflict</span>}{record.status === "superseded" && <span className="memory-superseded">Superseded</span>}</div>
    <div className="memory-card-body">{editing ? <div className="memory-editor"><input aria-label="Memory title" value={title} maxLength={100} onChange={event => setTitle(event.target.value)}/><textarea aria-label="Memory value" value={value} maxLength={1600} rows={4} onChange={event => setValue(event.target.value)}/><div><button onClick={() => { setEditing(false); setTitle(record.title); setValue(record.value); }}>Cancel</button><button disabled={busy || !title.trim() || !value.trim()} onClick={() => void onUpdate(record.id, { title, value }).then(() => setEditing(false))}><Check size={12}/>Save & trust</button></div></div> : <><h2>{record.title}</h2><p>{record.value}</p></>}
      <footer><button className="memory-source" onClick={() => onOpenRun(record.sourceRunIds.at(-1) ?? "")}><span>{record.sourceAgent.slice(0,1)}</span><span><strong>{record.sourceAgent}</strong><small>{record.sourceObjective}</small></span><ChevronRight size={12}/></button><div className="memory-meta"><span>{Math.round(record.confidence * 100)}% confidence</span><span>{new Date(record.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span></div></footer>
    </div>
    <div className="memory-actions">{record.status === "review" && <button className="approve-memory" disabled={busy} onClick={() => void onUpdate(record.id, { approve: true })}><Check size={12}/>Keep</button>}<button className={record.pinned ? "is-pinned" : ""} title={record.pinned ? "Unpin memory" : "Pin memory"} aria-label={record.pinned ? "Unpin memory" : "Pin memory"} disabled={busy} onClick={() => void onUpdate(record.id, { pinned: !record.pinned })}><Pin size={13}/></button><button title="Edit memory" aria-label="Edit memory" onClick={() => setEditing(true)}><Pencil size={13}/></button>{record.status === "conflicted" && <button className="resolve-memory" disabled={busy} onClick={() => void onUpdate(record.id, { resolveConflict: true })}>Use this version</button>}{confirming ? <button className="confirm-delete" disabled={busy} onBlur={() => setConfirming(false)} onClick={() => void onDelete(record.id)}>Delete?</button> : <button title="Delete memory" aria-label="Delete memory" onClick={() => setConfirming(true)}><Trash2 size={13}/></button>}</div>
  </article>;
}

function MissionOverview({ mission }: { mission: Mission }) {
  const complete = mission.tasks.filter(task => task.status === "completed").length;
  const status = mission.status === "waiting" ? "Needs your decision" : mission.status === "completed" ? mission.delivery?.verified ? "Verified delivery" : "Delivered with issues" : mission.status === "failed" ? "Mission needs attention" : `${mission.stage} in progress`;
  return <section className="mission-overview">
    <div className="mission-overview-status"><span className={`mission-status mission-status--${mission.status}`}><i/>{status}</span><em>{complete}/{mission.tasks.length} stages complete</em></div>
    <h2>{mission.objective}</h2>
    <div className="mission-progress"><span style={{ width: `${Math.max(6, complete / mission.tasks.length * 100)}%` }}/></div>
    <div className="mission-criteria"><span>ACCEPTANCE CRITERIA</span>{mission.acceptanceCriteria.map(criterion => <p key={criterion}><Check size={11}/>{criterion}</p>)}</div>
    {mission.error && <div className="mission-error"><X size={15}/><span><strong>Mission paused</strong>{mission.error}</span></div>}
    {mission.delivery && <div className={`mission-delivery ${mission.delivery.verified ? "verified" : "unverified"}`}><header><span>{mission.delivery.verified ? <CheckCheck size={16}/> : <ShieldCheck size={16}/>}<strong>{mission.delivery.verified ? "Verified delivery" : "Review found issues"}</strong></span><em>{mission.delivery.verified ? "PASS" : "NEEDS ATTENTION"}</em></header><RichAnswer text={mission.delivery.summary}/></div>}
  </section>;
}

function MissionBoard({ mission, runs, onOpen }: { mission: Mission; runs: LiveRun[]; onOpen: (id: string) => void }) {
  return <section className="mission-board">
    <header><div><span>MISSION PLAN</span><strong>Evidence moves forward</strong></div><em>{mission.kind === "change" ? "BUILD MISSION" : "ANALYSIS MISSION"}</em></header>
    <div className="mission-task-grid">{mission.tasks.map((task, index) => {
      const role = roles.find(item => item.id === task.role)!; const run = runs.find(item => item.id === task.runId);
      const label = task.status === "waiting" ? "Needs you" : task.status === "running" ? run?.action ?? "Working" : task.status;
      return <div className={`mission-task mission-task--${task.status}`} key={task.id}>
        {index > 0 && <span className="mission-connector"><ChevronRight size={11}/></span>}
        <button disabled={!task.runId} onClick={() => task.runId && onOpen(task.runId)}>
          <span className="mission-task-top"><span className="mission-step">0{index + 1}</span><span className="mission-task-state">{task.status === "running" ? <Loader2 size={11} className="rotating"/> : task.status === "waiting" ? <ShieldCheck size={11}/> : task.status === "completed" ? <Check size={11}/> : task.status === "failed" || task.status === "cancelled" ? <X size={11}/> : <i/>}{label}</span></span>
          <span className="mission-owner"><AgentAvatar color={role.color}/><span><strong>{task.title}</strong><small>{role.name}</small></span></span>
          <p>{task.description}</p>
          <footer>{task.dependsOn.length ? `${task.dependsOn.length} dependency${task.dependsOn.length > 1 ? "ies" : ""}` : "Starts immediately"}<ArrowRight size={11}/></footer>
        </button>
      </div>;
    })}</div>
  </section>;
}

function TaskLifecycle({ run }: { run: LiveRun }) {
  const steps = [
    { id: "assigned", label: "Assigned" },
    { id: "planning", label: "Plan" },
    { id: "working", label: "Work" },
    { id: "needs-you", label: "Approval" },
    { id: "verifying", label: "Verify" },
    { id: "done", label: "Handoff" }
  ] as const;
  const order: Record<string, number> = { assigned: 0, planning: 1, working: 2, "needs-you": 3, verifying: 4, done: 5, failed: -1 };
  const current = order[run.phase] ?? 0;
  const usedApproval = run.decisions.length > 0 || run.activities.some(item => /allowed|declined|approval/i.test(`${item.label} ${item.detail}`));
  const usedVerification = run.activities.some(item => /test|verify|review|check/i.test(`${item.label} ${item.detail}`));
  return <div className={`task-lifecycle ${run.phase === "failed" ? "task-lifecycle--failed" : ""}`} aria-label={`Task phase: ${run.phase}`}>
    {steps.map((step, index) => { const skipped = run.phase === "done" && ((step.id === "needs-you" && !usedApproval) || (step.id === "verifying" && !usedVerification)); const complete = !skipped && (current > index || run.phase === "done"); return <div key={step.id} className={run.phase === step.id ? "current" : skipped ? "skipped" : complete ? "complete" : ""}><span>{skipped ? "—" : complete ? <Check size={9}/> : index + 1}</span><small>{step.label}</small></div>; })}
  </div>;
}

function EvidenceCard({ run }: { run: LiveRun }) {
  const checks = run.activities.filter(item => /test|verify|review|check|read|command finished/i.test(`${item.label} ${item.detail}`) && item.state === "done");
  const duration = Math.max(1, Math.round((new Date(run.finishedAt ?? new Date()).getTime() - new Date(run.startedAt).getTime()) / 1000));
  return <section className="evidence-card" aria-label="Work evidence"><header><span><ListChecks size={14}/>WORK LEDGER</span><em>Saved locally</em></header><div><span><strong>{run.activities.length}</strong><small>recorded events</small></span><span><strong>{checks.length}</strong><small>evidence checks</small></span><span><strong>{duration}s</strong><small>elapsed</small></span></div><p>{checks.length ? checks.slice(-2).map(item => item.label).join(" · ") : run.source === "filesystem" ? "Read directly from the selected local directory." : "Open Activity to inspect the commands, tools, and progress behind this result."}</p></section>;
}

function ProjectWorkstream({ runs, onOpen }: { runs: LiveRun[]; onOpen: (id: string) => void }) {
  const phaseProgress: Record<string, number> = { assigned: 12, planning: 28, working: 58, "needs-you": 72, verifying: 86, done: 100, failed: 100 };
  return <section className="project-workstream" aria-label="Live project workstream">
    <header><div><span>LIVE WORKSTREAM</span><strong>{runs.length ? `${runs.length} task${runs.length === 1 ? "" : "s"} moving now` : "No active work"}</strong></div><em>{runs.length}/4 CAPACITY</em></header>
    {runs.length ? <div className="workstream-grid">{runs.slice(0,4).map((item, index) => { const role = roles.find(entry => entry.id === item.role) ?? roles[0]!; return <button key={item.id} onClick={() => onOpen(item.id)} className={item.status === "waiting" ? "needs-attention" : ""}>
      <div className="workstream-owner"><span className="seat-number">0{index + 1}</span><AgentAvatar color={role.color}/><span><strong>{item.agentName}</strong><small>{item.status === "waiting" ? "Waiting for you" : item.action}</small></span><i style={{ background: role.color }}/></div>
      <p>{item.displayObjective ?? item.objective}</p>
      <div className="workstream-progress"><span style={{ width: `${phaseProgress[item.phase] ?? 10}%`, background: role.color }}/></div>
      <footer><span>{item.intent === "write" ? "CHANGE TASK" : "READ TASK"}</span><span>{item.phase.replace("needs-you", "approval")}<ChevronRight size={12}/></span></footer>
    </button>; })}</div> : <div className="workstream-empty"><span className="empty-orbit"><i/><i/><i/></span><div><strong>The floor is quiet.</strong><p>Start two requests to watch different agents investigate, build, and review the same workspace at once.</p></div><button onClick={() => document.querySelector<HTMLTextAreaElement>('[aria-label="Your request"]')?.focus()}><Plus size={13}/>Start a request</button></div>}
  </section>;
}

function AgentWorkPanel({ profile, role, current, past, onOpen }: { profile: AgentProfile | undefined; role: (typeof roles)[number]; current: LiveRun[]; past: LiveRun[]; onOpen: (id: string) => void }) {
  const name = profile?.name ?? role.name;
  return <section className="agent-work-panel" aria-label={`${name} work`}>
    <header><span><i style={{ background: role.color }}/><strong>{name}</strong></span><em>{profile?.source === "project" ? "PROJECT AGENT" : profile?.source === "personal" ? "PERSONAL AGENT" : "AGENT WORK"}</em></header>
    <p>{profile?.description ?? role.short}</p>
    {current.length ? <div className="agent-current-list">{current.map(item => <button key={item.id} className="agent-current-work" onClick={() => onOpen(item.id)}><span className="live-work-mark"><Loader2 size={12} className={item.status === "running" ? "rotating" : ""}/></span><span><small>{item.status === "waiting" ? "WAITING FOR YOU" : `WORKING NOW · ${item.intent.toUpperCase()}`}</small><strong>{item.displayObjective ?? item.objective}</strong><em>{item.action}</em></span><ChevronRight size={13}/></button>)}</div> : <div className="agent-idle"><span/><p>Not working right now.</p></div>}
    <div className="agent-history-heading"><span>PREVIOUS WORK</span><small>{past.length ? `${past.length} shown` : "This session"}</small></div>
    <div className="agent-work-history">{past.map(item => <button key={item.id} onClick={() => onOpen(item.id)}><span className={`history-dot history-dot--${item.status}`}/><span><strong>{item.displayObjective ?? item.objective}</strong><small>{item.status === "completed" ? "Completed" : item.status === "cancelled" ? "Stopped" : "Needs attention"} · {new Date(item.finishedAt ?? item.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{item.skillNames.length ? ` · ${item.skillNames.join(", ")}` : ""}</small></span><ChevronRight size={12}/></button>)}{!past.length && <p className="agent-no-history">No completed work yet. Requests assigned to {name} will appear here.</p>}</div>
  </section>;
}

function CapabilityDialog({ kind, draft, busy, onClose, onSwitch, onCreate }: { kind: "agent" | "skill"; draft?: CapabilityDraft | undefined; busy: boolean; onClose: () => void; onSwitch: (kind: "agent" | "skill") => void; onCreate: (values: { name: string; description: string; instructions: string }) => Promise<void> }) {
  const [name, setName] = useState(draft?.name ?? ""); const [description, setDescription] = useState(draft?.description ?? ""); const [instructions, setInstructions] = useState(draft?.instructions ?? "");
  useEffect(() => { setName(draft?.name ?? ""); setDescription(draft?.description ?? ""); setInstructions(draft?.instructions ?? ""); }, [kind, draft]);
  const agent = kind === "agent";
  return <div className="studio-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="capability-dialog" role="dialog" aria-modal="true" aria-label={agent ? "Add an agent" : "Add a skill"}><button className="dialog-close" aria-label="Close" onClick={onClose}><X size={18}/></button><span className="panel-eyebrow">YOUR CODEX SETUP</span><h2>Add a project {kind}.</h2><p>This creates a standard Codex file inside this project, so it also works outside StaffForge.</p><div className="capability-tabs"><button className={agent ? "selected" : ""} onClick={() => onSwitch("agent")}><Bot size={14}/>Agent</button><button className={!agent ? "selected" : ""} onClick={() => onSwitch("skill")}><Sparkles size={14}/>Skill</button></div><form onSubmit={event => { event.preventDefault(); void onCreate({ name, description, instructions }); }}><label>Name<input autoFocus value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder={agent ? "Design reviewer" : "release-notes"}/></label><label>Description<small>This is what Auto uses to decide when it fits.</small><textarea value={description} maxLength={agent ? 400 : 500} onChange={event => setDescription(event.target.value)} placeholder={agent ? "Reviews product interfaces for hierarchy, accessibility, and polish." : "Create concise release notes from verified project changes."}/></label><label>Instructions<small>Define the workflow, boundaries, and expected result.</small><textarea className="instruction-field" value={instructions} maxLength={agent ? 12000 : 16000} onChange={event => setInstructions(event.target.value)} placeholder={agent ? "Inspect the real implementation. Lead with concrete findings…" : "1. Read the change history.\n2. Group changes by user impact…"}/></label><footer><span>{agent ? ".codex/agents/name.toml" : ".codex/skills/name/SKILL.md"}</span><button type="button" onClick={onClose}>Cancel</button><button className="create-capability" disabled={busy || !name.trim() || !description.trim() || !instructions.trim()}>{busy ? <Loader2 size={14} className="rotating"/> : <Plus size={14}/>}Create {kind}</button></footer></form></section></div>;
}

function AgentAvatar({ color }: { color: string }) {
  return <span className="agent-avatar" style={{ "--agent-color": color } as CSSProperties} aria-hidden="true"><span className="avatar-antenna"/><span className="avatar-head"><i/><i/></span><span className="avatar-shoulders"/></span>;
}

// Deliberately render text as React nodes; runtime answers cannot inject HTML.
function RichAnswer({ text }: { text: string }) {
  const inline = (value: string) => value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith("**") ? <strong key={index}>{part.slice(2,-2)}</strong> : part.startsWith("`") ? <code key={index}>{part.slice(1,-1)}</code> : part);
  return <div className="answer-text">{text.split(/(```[\s\S]*?```)/g).map((block, index) => block.startsWith("```") ? <pre key={index}><code>{block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "").trimEnd()}</code></pre> : <div key={index}>{block.split(/\n\n+/).filter(Boolean).map((paragraph, part) => /^#{1,4} /.test(paragraph) ? <h3 key={part}>{inline(paragraph.replace(/^#{1,4} /,""))}</h3> : <p key={part}>{inline(paragraph)}</p>)}</div>)}</div>;
}

function FileResults({ run }: { run: LiveRun }) {
  const [search, setSearch] = useState("");
  const files = run.files?.filter(file => file.name.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <div className="file-results"><div className="file-results-header"><span><FolderOpen size={15}/>Desktop<small>{run.files?.length} items</small></span><label><Search size={13}/><input aria-label="Filter Desktop files" placeholder="Filter files…" value={search} onChange={event => setSearch(event.target.value)}/></label></div><div className="file-table"><div className="file-table-label"><span>NAME</span><span>TYPE</span></div>{files.map(file => <div key={file.name} className="file-row"><span>{file.kind === "folder" ? <Folder size={17} fill="#dde8e4"/> : <File size={16}/>}<span>{file.name}</span></span><small>{file.kind}</small></div>)}{!files.length && <p className="no-files">{search ? "No files match your search." : "No visible items in this folder."}</p>}</div><div className="file-path">{run.directory}</div></div>;
}

function DecisionCard({ decision, busy, onDecide }: { decision: Decision; busy: boolean; onDecide: (allow: boolean, answers?: Record<string, string>) => Promise<void> }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return <div className="inline-decision" role="alert" aria-live="assertive" aria-label="Your decision is needed"><div><ShieldCheck size={19}/><span><strong>{decision.title}</strong><p>{decision.reason}</p></span><span className="decision-label">NEEDS YOU</span></div>{decision.kind === "question" ? decision.questions?.map(question => <label key={question.id}>{question.question}{question.options.length > 0 && <div className="question-options" role="group" aria-label={question.question}>{question.options.map(option => <button key={option} aria-pressed={answers[question.id] === option} className={answers[question.id] === option ? "chosen" : ""} onClick={() => setAnswers(previous => ({ ...previous, [question.id]: option }))}>{option}</button>)}</div>}<input aria-label={`Answer: ${question.question}`} value={answers[question.id] ?? ""} onChange={event => setAnswers(previous => ({ ...previous, [question.id]: event.target.value }))}/></label>) : <pre>{decision.details}</pre>}<footer><span>Applies to this action only</span>{decision.kind === "approval" && <button disabled={busy} onClick={() => void onDecide(false)}>Decline</button>}<button className="allow-button" disabled={busy || (decision.kind === "question" && !decision.questions?.every(question => answers[question.id]?.trim()))} onClick={() => void onDecide(true, answers)}><Check size={14}/>{decision.kind === "question" ? "Send answer" : "Allow once"}</button></footer></div>;
}

function OfficeWorld({ selected, runs, onSelect }: { selected: RoleId; runs: LiveRun[]; onSelect: (id: RoleId) => void }) {
  const positions = [{ x: 178, y: 148 }, { x: 351, y: 148 }, { x: 128, y: 261 }, { x: 321, y: 261 }];
  return <div className="office-world"><svg viewBox="0 0 500 380" aria-hidden="true"><defs><linearGradient id="floor" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e5e9e4"/><stop offset="1" stopColor="#cbd4cd"/></linearGradient><linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#e9eee8"/><stop offset="1" stopColor="#d5dfd7"/></linearGradient><linearGradient id="desk" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#eedbbd"/><stop offset="1" stopColor="#d1b48d"/></linearGradient><filter id="officeShadow"><feGaussianBlur stdDeviation="7"/></filter><filter id="littleShadow"><feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#1b3c32" floodOpacity=".2"/></filter></defs>
      <ellipse cx="251" cy="324" rx="199" ry="30" fill="#16372d" opacity=".1" filter="url(#officeShadow)"/>
      <path d="M38 211 236 96 468 229 270 345Z" fill="#a9b7ad"/><path d="M38 203 236 89 468 222 270 337Z" fill="url(#floor)"/><path d="M38 203v8l232 134v-8Z" fill="#bbc8bf"/>
      <path d="M38 203V95L236-19V89Z" fill="url(#wall)"/><path d="M236-19 468 115v107L236 89Z" fill="#eff2ed"/>
      <path d="m41 183 193-111m-193 92 193-111m-193 92 193-111" stroke="#c7d3ca" strokeWidth="1" opacity=".6"/>
      <path d="m82 228 198-114m-151 141 198-114m-151 141 198-114m-151 141 198-114M87 174l233 134M137 145l232 134M186 117l232 134" stroke="#b7c6bd" strokeWidth=".8"/>
      <path d="M263 31 341 76v52L263 83Z" fill="#c5d6ce" stroke="#aabfb3" strokeWidth="3"/><path d="m271 44 62 36v36l-62-36Z" fill="#719c8d"/><path d="m275 59 43 25m-43-15 29 17" stroke="#dbebe1" strokeWidth="3" strokeLinecap="round"/>
      <g transform="translate(66 108)"><path d="M0 0 74-43v54L0 54Z" fill="#c0d6d6" stroke="#f7fbf7" strokeWidth="5"/><path d="M36-20v50M0 27l74-43" stroke="#f7fbf7" strokeWidth="3"/><path d="m3 46 62-72" stroke="#eaf7f4" strokeWidth="15" opacity=".45"/></g>
      <g transform="translate(411 173)"><ellipse cy="9" rx="18" ry="8" fill="#9faf9f"/><path d="m-12-19 3 26q9 8 18 0l3-26" fill="#caad83"/><ellipse cy="-19" rx="12" ry="6" fill="#dac5a3"/><path d="M0-14v-47" stroke="#58816a" strokeWidth="3"/><ellipse cx="-9" cy="-49" rx="9" ry="18" transform="rotate(-30 -9 -49)" fill="#769c7a"/><ellipse cx="9" cy="-40" rx="9" ry="18" transform="rotate(34 9 -40)" fill="#527d61"/><ellipse cy="-64" rx="8" ry="14" fill="#97b18a"/></g>
      {roles.map((role, index) => { const point = positions[index]!; return runs.some(run => run.role === role.id) ? <path key={`flow-${role.id}`} className="collab-line" d={`M${point.x + 5} ${point.y + 48} Q${(point.x + 250) / 2} ${(point.y + 275) / 2 + 24} 250 275`} stroke={role.color}/> : null; })}
      {roles.map((role, index) => { const point = positions[index]!; const roleRuns = runs.filter(run => run.role === role.id); const lead = roleRuns.find(run => run.status === "waiting") ?? roleRuns[0]; const isWorking = !!lead; const visualState = lead?.visualState; return <g key={role.id} transform={`translate(${point.x} ${point.y})`}>
        <ellipse cx="1" cy="39" rx="58" ry="25" fill={isWorking ? role.color : "#7f9786"} opacity={isWorking ? ".22" : ".08"}/>
        <path d="M-42 7v29m71-13v28" stroke="#8d9b90" strokeWidth="5"/><path d="M-53-5 0-36 59-2 6 29Z" fill="url(#desk)"/><path d="m-53-5 59 34v6l-59-34Z" fill="#b89b76"/><path d="m6 29 53-31v6L6 35Z" fill="#ceb28e"/>
        <path d="m-18-30 31 18v-28l-31-18Z" fill="#445b53" stroke="#344a43" strokeWidth="2"/><path d="m-14-32 23 13v-18l-23-13Z" fill={isWorking ? "#b4eacb" : "#85a798"}/><path d="m-10-32 12 7m-12-1 7 4" stroke="#dbf3de" strokeWidth="2"/>
        <path d="m-2-19 8 4v12l-8-5Z" fill="#53695d"/><path d="m-11-4 14-8 16 9-14 8Z" fill="#657a6a"/><path d="m13 9 15-9 17 10-15 9Z" fill="#ebeee2"/>
        <g transform="translate(-39 4)"><ellipse cy="-8" rx="5" ry="3" fill="#f3e9d7"/><path d="M-5-8v8q5 5 10 0v-8" fill="#e5d8bf"/><path d="M5-7q8 1 1 8" stroke="#e5d8bf" strokeWidth="2" fill="none"/></g>
        <g className={`office-bot ${isWorking ? `${visualState ?? "working"} working` : "idle"}`} transform="translate(7 32)" filter="url(#littleShadow)">
          <ellipse cy="26" rx="20" ry="9" fill="#365046" opacity=".17"/><path d="M-10 10v12m19-12v12" stroke="#526960" strokeWidth="7" strokeLinecap="round"/>
          <rect x="-15" y="-8" width="30" height="28" rx="10" fill={role.color}/><path d="M-17-2 -21 11M17-2l5 10" stroke={role.color} strokeWidth="8" strokeLinecap="round"/>
          <rect x="-19" y="-38" width="38" height="32" rx="13" fill={role.color}/><path d="M0-39v-7" stroke="#d7e3d9" strokeWidth="3"/><circle cy="-49" r="3.5" fill={isWorking ? "#dbf98b" : "#f4e8c9"}/>
          <rect x="-13" y="-28" width="26" height="11" rx="5.5" fill="#243e37"/><circle cx="-5" cy="-23" r="2" fill="#edfff4"/><circle cx="5" cy="-23" r="2" fill="#edfff4"/><rect x="-6" y="1" width="12" height="5" rx="2" fill="#ebf2df" opacity=".8"/>
        </g>
        {selected === role.id && <path d="M-10 67 7 76 24 66" stroke="#3b6c58" strokeWidth="2" fill="none"/>}
      </g>; })}
      <g className={`project-core ${runs.length ? "project-core--active" : ""}`} transform="translate(250 273)"><ellipse cy="24" rx="31" ry="12" fill="#345147" opacity=".15"/><path d="m-28 0 28-16 31 18L3 19Z" fill="#536b62"/><path d="m-28 0v22L3 39V19Z" fill="#354c43"/><path d="M3 19 31 2v22L3 39Z" fill="#425b50"/><path d="m-15-2 15-8 17 10L2 9Z" fill={runs.length ? "#dff3a5" : "#9cae9f"}/><path d="M-7 1 1 5l8-5" fill="none" stroke="#40594e" strokeWidth="2"/><circle cx="1" cy="-18" r="4" fill={runs.length ? "#d9f679" : "#bdc9be"}/></g>
    </svg>{roles.map((role,index) => { const point = positions[index]!; const roleRuns = runs.filter(run => run.role === role.id); const lead = roleRuns.find(run => run.status === "waiting") ?? roleRuns[0]; return <button key={role.id} className={`office-hit ${lead ? "office-hit--active" : ""}`} style={{ left: `${(point.x + 7) / 5}%`, top: `${(point.y + 15) / 3.8}%` }} onClick={() => onSelect(role.id)} aria-label={`Meet ${role.name}`} title={`${role.name} · ${lead?.visualState ?? "available"}`}><span>{role.name}{lead && <><i/><em>{lead.visualState}</em>{roleRuns.length > 1 && <b>×{roleRuns.length}</b>}</>}</span></button>; })}</div>;
}
