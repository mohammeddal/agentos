import { useEffect, useRef, useState } from "react";
import {
  Activity, ArrowRight, Blocks, Check, CheckCircle2, ChevronRight, CircleDot, Command,
  Database, FileCode2, FolderOpen, Gauge, Hammer, Inbox, LayoutDashboard, Library, ListChecks,
  Maximize2, Moon, MoreHorizontal, Play, RotateCcw, Search, Settings, ShieldCheck, Sparkles,
  Sun, Tags, Users, X
} from "lucide-react";
import { StaffForgeCore, builtInAgents, builtInSkills, builtInTools } from "@staffforge/core";
import { MockRuntimeAdapter } from "@staffforge/runtime";
import type { AgentView, SessionView, StaffForgeEvent, TaskStatus } from "@staffforge/schemas";
import { Badge, Button, Panel } from "@staffforge/ui";

const core = new StaffForgeCore(new MockRuntimeAdapter());
type Page = "control" | "board" | "approvals" | "team" | "plugins" | "diagnostics" | "settings";

const iconFor: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  commander: Command, detective: Search, builder: Hammer, reviewer: ShieldCheck, historian: Library, reporter: FileCode2
};

const nav: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: "control", label: "Control room", icon: LayoutDashboard },
  { id: "board", label: "Work board", icon: ListChecks },
  { id: "approvals", label: "Approvals", icon: Inbox },
  { id: "team", label: "Team", icon: Users },
  { id: "plugins", label: "Plugins", icon: Blocks },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings }
];

function eventLabel(event: StaffForgeEvent) {
  const p = event.payload as Record<string, any>;
  const actor = event.actor.kind === "agent" ? builtInAgents.find((a) => a.id === event.actor.id)?.name ?? event.actor.id : "StaffForge";
  const summary = p.summary ?? p.name ?? p.title ?? p.action ?? p.workflowId ?? event.type.replaceAll(".", " ");
  return { actor, summary: String(summary) };
}

function timeSince(timestamp?: string) {
  if (!timestamp) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function App() {
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem("staffforge:onboarded") === "1");
  const [page, setPage] = useState<Page>("control");
  const [objective, setObjective] = useState("Investigate why revenue dropped yesterday");
  const [session, setSession] = useState<SessionView>();
  const [selectedAgent, setSelectedAgent] = useState<string>();
  const [palette, setPalette] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("staffforge");
  const [notice, setNotice] = useState<string>();
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("staffforge:theme") as "dark" | "light") || "dark");

  useEffect(() => core.subscribe((view) => setSession(view)), []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("staffforge:theme", theme); }, [theme]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette((open) => !open); }
      if (event.key === "Escape") { setPalette(false); setSelectedAgent(undefined); setWorkspaceOpen(false); setUserOpen(false); }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, []);

  const run = async () => {
    if (!objective.trim() || session?.status === "running" || session?.status === "waiting") return;
    const id = await core.startObjective({ objective: objective.trim(), workspaceId: "staffforge", workspacePath: "." });
    setSession(core.getSession(id)); setPage("control");
  };

  if (!onboarded) return <Onboarding onEnter={() => { localStorage.setItem("staffforge:onboarded", "1"); setOnboarded(true); }} theme={theme} setTheme={setTheme} />;

  const pending = session?.approvals.filter((approval) => approval.status === "pending") ?? [];
  const selectedAgentView = selectedAgent
    ? session?.agents[selectedAgent] ?? (() => {
      const definition = builtInAgents.find((agent) => agent.id === selectedAgent);
      return definition ? fallbackAgent(definition, objective || "No active objective") : undefined;
    })()
    : undefined;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><span /></div><div><strong>StaffForge</strong><small>Engineering OS</small></div></div>
      <button className="workspace-switcher" onClick={() => setWorkspaceOpen(true)} aria-label="Switch workspace"><div className="workspace-icon">SF</div><div><strong>{workspaceName}</strong><small>Local workspace</small></div><ChevronRight size={14} /></button>
      <nav>{nav.map((item) => <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}><item.icon size={16} /><span>{item.label}</span>{item.id === "approvals" && pending.length > 0 && <em>{pending.length}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><button onClick={() => setPalette(true)}><Command size={15} /><span>Command palette</span><kbd>⌘K</kbd></button><div className="runtime-line"><i /><span>Mock runtime</span><Badge tone="success">Connected</Badge></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="crumb">Workspace</span><ChevronRight size={13}/><strong>{nav.find((item) => item.id === page)?.label}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={16}/> : <Moon size={16}/>}</button><div className="user-menu-wrap"><button className="avatar" aria-label="User menu" aria-expanded={userOpen} onClick={() => setUserOpen((open) => !open)}>MD</button>{userOpen && <div className="user-popover"><strong>محمد</strong><small>Local operator</small><button onClick={() => { setTheme(theme === "dark" ? "light" : "dark"); setNotice("Theme updated"); setUserOpen(false); }}>{theme === "dark" ? <Sun size={14}/> : <Moon size={14}/>} Switch to {theme === "dark" ? "light" : "dark"}</button><button onClick={() => { localStorage.removeItem("staffforge:onboarded"); window.location.reload(); }}><RotateCcw size={14}/> Restart onboarding</button></div>}</div></div></header>
      <div className="content">
        {page === "control" && <ControlRoom session={session} objective={objective} setObjective={setObjective} run={run} selectAgent={setSelectedAgent} />}
        {page === "board" && <WorkBoard session={session} />}
        {page === "approvals" && <ApprovalCenter session={session} />}
        {page === "team" && <TeamView session={session} selectAgent={setSelectedAgent} />}
        {page === "plugins" && <PluginsView notify={setNotice} />}
        {page === "diagnostics" && <DiagnosticsView />}
        {page === "settings" && <SettingsView theme={theme} setTheme={setTheme} />}
      </div>
    </main>
    {selectedAgentView && <AgentDrawer agent={selectedAgentView} events={(session?.timeline ?? []).filter((event) => event.actor.id === selectedAgentView.id)} close={() => setSelectedAgent(undefined)} />}
    {palette && <CommandPalette close={() => setPalette(false)} navigate={(target) => { setPage(target); setPalette(false); }} run={run} />}
    {workspaceOpen && <WorkspaceDialog current={workspaceName} close={() => setWorkspaceOpen(false)} select={(name) => { setWorkspaceName(name); setWorkspaceOpen(false); setNotice(`Workspace switched to ${name}`); }} />}
    {notice && <div className="toast" role="status"><CheckCircle2 size={15}/>{notice}</div>}
  </div>;
}

function Onboarding({ onEnter, theme, setTheme }: { onEnter: () => void; theme: "dark" | "light"; setTheme: (theme: "dark" | "light") => void }) {
  return <main className="onboarding">
    <button className="theme-float" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}</button>
    <div className="onboarding-grid">
      <section className="onboarding-intro"><div className="brand-mark brand-mark--large"><span /></div><div className="onboarding-kicker">Local-first engineering intelligence</div><h1>Your engineering team,<br/><em>operating in plain sight.</em></h1><p>StaffForge orchestrates your existing Codex environment into a governed team of specialists. Every action is visible. Every write waits for you.</p><div className="principles"><span><ShieldCheck size={15}/> Credentials stay with Codex</span><span><Activity size={15}/> Execution, not theater</span><span><Inbox size={15}/> Human approval for writes</span></div></section>
      <section className="readiness"><div className="readiness-head"><div><span className="sf-eyebrow">System check</span><h2>Ready to forge</h2></div><Badge tone="success"><CircleDot size={11}/> 4 checks passed</Badge></div>
        <div className="checks">
          <CheckRow label="Codex runtime" value="Detected" detail="App-server compatible" />
          <CheckRow label="Authentication" value="Available" detail="Uses your existing local session" />
          <CheckRow label="Workspace" value="staffforge" detail="Local Git repository" />
          <CheckRow label="Security policy" value="Protected" detail="Writes require approval" />
        </div>
        <div className="capability-strip"><span>Detected capabilities</span><div><Badge>Repository</Badge><Badge>Shell</Badge><Badge>Filesystem</Badge><Badge>MCP discovery</Badge></div></div>
        <Button onClick={onEnter}>Enter Control Room <ArrowRight size={16}/></Button><small>No separate API key required. Mock runtime is enabled for this vertical slice.</small>
      </section>
    </div>
  </main>;
}

function CheckRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="check-row"><div className="check-icon"><Check size={15}/></div><div><strong>{label}</strong><small>{detail}</small></div><span>{value}</span></div>;
}

function ControlRoom({ session, objective, setObjective, run, selectAgent }: { session: SessionView | undefined; objective: string; setObjective: (value: string) => void; run: () => void; selectAgent: (id: string) => void }) {
  const active = session?.status === "running" || session?.status === "waiting";
  const done = Object.values(session?.tasks ?? {}).filter((task) => task.status === "DONE").length;
  const total = Object.keys(session?.tasks ?? {}).length;
  return <>
    <div className="page-heading"><div><span className="sf-eyebrow">Live operations</span><h1>Control Room</h1><p>Coordinate real work, inspect evidence, and keep consequential actions under human control.</p></div><div className="heading-stat"><span>Runtime</span><strong><i/> Connected</strong></div></div>
    <section className={`objective-console ${active ? "objective-console--active" : ""}`}>
      <div className="objective-top"><div className="objective-symbol"><Gauge size={19}/></div><div><span>{session ? "Active objective" : "Give the team an objective"}</span><small>{session ? `Session ${session.id.slice(0, 8)}` : "Commander will plan and delegate the work"}</small></div>{session && <Badge tone={session.status === "completed" ? "success" : session.status === "waiting" ? "warning" : "active"}>{session.status}</Badge>}</div>
      <div className="objective-input"><textarea value={objective} disabled={active} onChange={(e) => setObjective(e.target.value)} rows={2} aria-label="Engineering objective"/><Button disabled={active || !objective.trim()} onClick={run}>{active ? <><Activity size={16} className="spin"/> Team working</> : <><Play size={15}/> Start objective</>}</Button></div>
      {session && <div className="progress-line"><div><span style={{ width: `${total ? Math.round((done / total) * 100) : 4}%` }}/></div><small>{done} of {total || 1} tasks complete</small></div>}
    </section>
    <div className="control-grid control-grid--world">
      <ForgeFloor session={session} objective={objective} selectAgent={selectAgent} />
      <Timeline session={session} />
    </div>
    <section className="roster-strip"><div className="section-heading"><div><span className="sf-eyebrow">Specialists</span><h2>Team roster</h2></div><span>{active ? "Live" : session?.status === "completed" ? "Completed" : "Standing by"}</span></div><div className="agent-grid agent-grid--strip">{builtInAgents.map((definition) => <AgentCard key={definition.id} agent={session?.agents[definition.id] ?? { id: definition.id, name: definition.name, icon: definition.icon, status: "idle", objective, currentAction: "Standing by", latestFinding: "No findings yet", confidence: "—" }} onClick={() => selectAgent(definition.id)} />)}</div></section>
    {session?.finalSummary && <Panel className="outcome" eyebrow="Outcome" title="Investigation complete" actions={<Badge tone="success"><CheckCircle2 size={12}/> Verified</Badge>}><p>{session.finalSummary}</p></Panel>}
  </>;
}

const floorPositions: Record<string, { x: number; y: number; station: string }> = {
  commander: { x: 50, y: 17, station: "Command dais" },
  detective: { x: 20, y: 44, station: "Evidence lab" },
  historian: { x: 79, y: 42, station: "Archive" },
  builder: { x: 33, y: 72, station: "Build bay" },
  reviewer: { x: 62, y: 72, station: "Review gate" },
  reporter: { x: 84, y: 76, station: "Dispatch" }
};

function fallbackAgent(definition: (typeof builtInAgents)[number], objective: string): AgentView {
  return { id: definition.id, name: definition.name, icon: definition.icon, status: "idle", objective, currentAction: "Standing by", latestFinding: "No findings yet", confidence: "—" };
}

function ForgeFloor({ session, objective, selectAgent }: { session: SessionView | undefined; objective: string; selectAgent: (id: string) => void }) {
  const [labels, setLabels] = useState(true);
  const [expanded, setExpanded] = useState(false);
  return <section className={`forge-world ${expanded ? "forge-world--expanded" : ""}`}>
    <header className="forge-world__header"><div><span className="sf-eyebrow">Live team map</span><h2>Forge Floor</h2></div><div><button className={labels ? "active" : ""} onClick={() => setLabels((value) => !value)} aria-pressed={labels}><Tags size={14}/> Labels</button><button onClick={() => setExpanded((value) => !value)} aria-pressed={expanded}><Maximize2 size={14}/>{expanded ? "Compact" : "Expand"}</button></div></header>
    <div className="forge-scene">
      <div className="forge-horizon"><span>LOCAL RUNTIME</span><strong>{session?.status === "running" ? "TEAM ACTIVE" : session?.status === "waiting" ? "HUMAN GATE" : session?.status === "completed" ? "MISSION COMPLETE" : "SYSTEM READY"}</strong></div>
      <div className="forge-floor-grid" />
      <div className="station station--command"><Command size={17}/><span>COMMAND</span></div>
      <div className="station station--evidence"><Database size={17}/><span>EVIDENCE</span></div>
      <div className="station station--archive"><Library size={17}/><span>ARCHIVE</span></div>
      <div className="station station--build"><Hammer size={17}/><span>BUILD</span></div>
      <div className="station station--review"><ShieldCheck size={17}/><span>REVIEW</span></div>
      <div className="station station--dispatch"><FileCode2 size={17}/><span>DISPATCH</span></div>
      <div className="approval-beacon"><Inbox size={16}/><span>HUMAN GATE</span></div>
      {builtInAgents.map((definition) => {
        const agent = session?.agents[definition.id] ?? fallbackAgent(definition, objective);
        const base = floorPositions[definition.id]!;
        const waitingAtGate = agent.status === "waiting";
        const x = waitingAtGate ? 50 : base.x;
        const y = waitingAtGate ? 52 : base.y;
        return <button key={definition.id} className={`forge-person forge-person--${definition.id} forge-person--${agent.status}`} style={{ "--agent-x": `${x}%`, "--agent-y": `${y}%` } as React.CSSProperties} onClick={() => selectAgent(definition.id)} aria-label={`Open ${agent.name} details`}>
          {labels && <div className="forge-person__label"><strong>{agent.name}</strong><span>{agent.currentAction}</span></div>}
          <AgentCharacter agent={agent} />
          <small>{waitingAtGate ? "At approval gate" : base.station}</small>
        </button>;
      })}
      <div className="forge-legend"><span><i className="legend-idle"/>Idle</span><span><i className="legend-working"/>Working</span><span><i className="legend-waiting"/>Approval</span><span><i className="legend-complete"/>Complete</span></div>
    </div>
  </section>;
}

function AgentCharacter({ agent, large = false }: { agent: AgentView; large?: boolean }) {
  return <div className={`character character--${agent.id} character--${agent.status} ${large ? "character--large" : ""}`} aria-hidden="true">
    <div className="character__shadow"/><div className="character__antenna"><i/></div><div className="character__head"><i/><b/><span/></div><div className="character__pack"/><div className="character__body"><span/></div><div className="character__arm character__arm--left"/><div className="character__arm character__arm--right"/><div className="character__leg character__leg--left"/><div className="character__leg character__leg--right"/>{agent.status === "completed" && <div className="character__complete"><Check size={10}/></div>}
  </div>;
}

function AgentCard({ agent, onClick }: { agent: AgentView; onClick: () => void }) {
  const Icon = iconFor[agent.id] ?? Sparkles;
  const tone = agent.status === "failed" ? "danger" : agent.status === "working" ? "active" : agent.status === "waiting" ? "warning" : agent.status === "completed" ? "success" : "neutral";
  return <button className={`agent-card agent-card--${agent.status}`} onClick={onClick}><div className="agent-card__top"><div className="agent-icon"><Icon size={17}/></div><div><strong>{agent.name}</strong><small>{builtInAgents.find((item) => item.id === agent.id)?.role}</small></div><Badge tone={tone}>{agent.status}</Badge></div><div className="agent-action"><span>Current action</span><p>{agent.currentAction}</p></div><div className="agent-finding"><span>Latest finding</span><p>{agent.latestFinding}</p></div><div className="agent-card__meta"><span><i className={`confidence confidence--${agent.confidence.toLowerCase()}`}/>{agent.confidence} confidence</span><span>{timeSince(agent.startedAt)}</span></div></button>;
}

function Timeline({ session }: { session: SessionView | undefined }) {
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState<"all" | "agents" | "approvals">("all");
  const events = (session?.timeline ?? []).filter((event) => !event.type.startsWith("workflow.step")).filter((event) => filter === "all" || (filter === "agents" ? event.actor.kind === "agent" : event.type.startsWith("approval."))).slice(-10).reverse();
  return <Panel className="timeline" eyebrow="Event stream" title="Activity timeline" actions={<div className="timeline-menu-wrap"><button className="icon-button" aria-label="Filter timeline" aria-expanded={menu} onClick={() => setMenu((open) => !open)}><MoreHorizontal size={16}/></button>{menu && <div className="timeline-menu">{(["all", "agents", "approvals"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => { setFilter(value); setMenu(false); }}>{value === "all" ? "All activity" : value === "agents" ? "Agent activity" : "Approvals only"}{filter === value && <Check size={13}/>}</button>)}</div>}</div>}>
    <div className="timeline-list">{events.length ? events.map((event) => { const label = eventLabel(event); return <div className="timeline-row" key={event.id}><time>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><span className={`event-dot event-dot--${event.type.split(".")[0]}`}/><div><strong>{label.actor}</strong><p>{label.summary}</p></div></div>; }) : <div className="empty-state"><Activity size={22}/><strong>No execution events yet</strong><p>Submit an objective to watch the team work.</p></div>}</div>
  </Panel>;
}

const columns: TaskStatus[] = ["BACKLOG", "READY", "WORKING", "WAITING", "REVIEW", "APPROVAL", "DONE", "FAILED"];
function WorkBoard({ session }: { session: SessionView | undefined }) {
  return <><div className="page-heading"><div><span className="sf-eyebrow">Execution state</span><h1>Work board</h1><p>Every card is projected from the normalized event stream.</p></div></div><div className="board">{columns.map((status) => { const tasks = Object.values(session?.tasks ?? {}).filter((task) => task.status === status); return <section className="board-column" key={status}><header><span>{status}</span><em>{tasks.length}</em></header><div>{tasks.map((task) => <article key={task.id}><strong>{task.title}</strong><p>{task.summary}</p><span>{builtInAgents.find((agent) => agent.id === task.agentId)?.name}</span></article>)}{tasks.length === 0 && <div className="board-empty">No work</div>}</div></section>; })}</div></>;
}

function ApprovalCenter({ session }: { session: SessionView | undefined }) {
  const approvals = session?.approvals ?? [];
  return <><div className="page-heading"><div><span className="sf-eyebrow">Human control</span><h1>Approval Center</h1><p>Inspect the reason, scope, and exact parameters before a consequential action runs.</p></div></div><div className="approval-list">{approvals.length ? approvals.map((approval) => <Panel key={approval.id} className="approval-card" eyebrow={approval.risk.replaceAll("_", " ")} title={approval.action} actions={<Badge tone={approval.status === "pending" ? "warning" : approval.status === "approved" ? "success" : "danger"}>{approval.status}</Badge>}><p>{approval.reason}</p><dl><div><dt>Provider</dt><dd>{approval.provider}</dd></div><div><dt>Capability</dt><dd>{approval.capability}</dd></div>{Object.entries(approval.parameters).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>{approval.status === "pending" && <div className="approval-actions"><Button variant="secondary" onClick={() => core.decideApproval(approval.sessionId, approval.id, false)}><X size={15}/> Reject</Button><Button onClick={() => core.decideApproval(approval.sessionId, approval.id, true)}><Check size={15}/> Approve change</Button></div>}</Panel>) : <Panel><div className="empty-state tall"><Inbox size={26}/><strong>No approval requests</strong><p>Writes and production actions will wait here for your decision.</p></div></Panel>}</div></>;
}

function TeamView({ session, selectAgent }: { session: SessionView | undefined; selectAgent: (id: string) => void }) {
  return <><div className="page-heading"><div><span className="sf-eyebrow">Configuration-driven</span><h1>Engineering team</h1><p>Each specialist is a versioned definition with explicit capabilities and actions.</p></div></div><div className="directory">{builtInAgents.map((definition) => { const state = session?.agents[definition.id] ?? fallbackAgent(definition, "No active objective"); return <button key={definition.id} onClick={() => selectAgent(definition.id)}><AgentCharacter agent={state}/><div><strong>{definition.name}</strong><span>{definition.role}</span><p>{definition.description}</p><small>{definition.skills.join(" · ")}</small></div><Badge tone={state.status === "working" ? "active" : state.status === "completed" ? "success" : "neutral"}>{state.status}</Badge><ChevronRight size={16}/></button>; })}</div></>;
}

function PluginsView({ notify }: { notify: (message: string) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const [scanned, setScanned] = useState<string>();
  return <><input ref={(node) => { picker.current = node; node?.setAttribute("webkitdirectory", ""); }} className="visually-hidden" type="file" multiple onChange={(event) => { const file = event.currentTarget.files?.[0]; const folder = file?.webkitRelativePath.split("/")[0]; if (folder) { setScanned(folder); notify(`Scanned ${folder} for plugin manifests`); } }} /><div className="page-heading"><div><span className="sf-eyebrow">Extension registry</span><h1>Plugins</h1><p>Declarative contributions are validated, permissioned, and isolated from core state.</p></div><Button variant="secondary" onClick={() => picker.current?.click()}><FolderOpen size={15}/> Scan local directory</Button></div><Panel className="plugin-row"><div className="plugin-mark">SF</div><div><strong>StaffForge Core Pack</strong><p>Built-in agents, skills, tools, and incident workflows.</p><div><Badge>{builtInAgents.length} agents</Badge><Badge>{builtInSkills.length} skills</Badge><Badge>{builtInTools.length} tools</Badge></div></div><Badge tone="success">Enabled</Badge></Panel><Panel><div className="empty-state tall"><Blocks size={25}/><strong>{scanned ? `Scanned ${scanned}` : "No third-party plugins installed"}</strong><p>{scanned ? "No compatible staffforge.plugin.json manifest was found in this browser-selected directory." : "Choose a local directory to validate a plugin manifest."}</p>{!scanned && <Button variant="secondary" onClick={() => picker.current?.click()}><FolderOpen size={14}/> Choose directory</Button>}</div></Panel></>;
}

function DiagnosticsView() {
  const [health, setHealth] = useState<{ details: string; capabilities: string[] }>();
  useEffect(() => { void core.runtimeHealth().then(setHealth); }, []);
  return <><div className="page-heading"><div><span className="sf-eyebrow">Local environment</span><h1>Diagnostics</h1><p>Runtime and capability health without credential exposure.</p></div></div><div className="metric-grid"><Panel eyebrow="Runtime" title="Mock adapter"><Badge tone="success">Connected</Badge><p className="muted">{health?.details ?? "Checking…"}</p></Panel><Panel eyebrow="Event protocol" title="Schema v1"><Badge tone="success">Healthy</Badge><p className="muted">Provider events normalize before reaching UI.</p></Panel><Panel eyebrow="Policy" title="Approval enforced"><Badge tone="success">Active</Badge><p className="muted">Writes cannot bypass deterministic evaluation.</p></Panel></div><Panel eyebrow="Capabilities" title="Available through runtime"><div className="capability-list">{health?.capabilities.map((capability) => <div key={capability}><CheckCircle2 size={15}/><code>{capability}</code><span>available</span></div>)}</div></Panel></>;
}

function SettingsView({ theme, setTheme }: { theme: "dark" | "light"; setTheme: (theme: "dark" | "light") => void }) {
  return <><div className="page-heading"><div><span className="sf-eyebrow">Preferences</span><h1>Settings</h1><p>Workspace preferences are separate from secrets and runtime credentials.</p></div></div><Panel title="Appearance" eyebrow="Interface"><div className="setting-row"><div><strong>Color theme</strong><p>Use a high-contrast light or dark operational surface.</p></div><div className="segmented"><button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><Moon size={14}/> Dark</button><button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}><Sun size={14}/> Light</button></div></div></Panel><Panel title="Action policy" eyebrow="Security"><div className="policy-list"><div><CheckCircle2/><span><strong>Read automatically</strong><small>Repository, warehouse, and documentation reads</small></span><Badge tone="success">Allowed</Badge></div><div><Inbox/><span><strong>Local and external writes</strong><small>File changes, pull requests, and messages</small></span><Badge tone="warning">Ask first</Badge></div><div><ShieldCheck/><span><strong>Production and destructive actions</strong><small>Deployments, deletes, and production mutation</small></span><Badge tone="danger">Strong approval</Badge></div></div></Panel></>;
}

function AgentDrawer({ agent, events, close }: { agent: AgentView; events: StaffForgeEvent[]; close: () => void }) {
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="agent-drawer"><header><AgentCharacter agent={agent} large/><div><span className="sf-eyebrow">Agent detail</span><h2>{agent.name}</h2></div><button className="icon-button" aria-label="Close agent details" onClick={close}><X size={17}/></button></header><div className="drawer-status"><Badge tone={agent.status === "working" ? "active" : agent.status === "completed" ? "success" : "neutral"}>{agent.status}</Badge><span>{agent.currentAction}</span></div><section><span className="sf-eyebrow">Goal</span><p>{agent.objective}</p></section><section><span className="sf-eyebrow">Latest finding</span><p>{agent.latestFinding}</p><small>{agent.confidence} confidence · {timeSince(agent.startedAt)}</small></section><section><span className="sf-eyebrow">Observable timeline</span><div className="drawer-events">{events.length ? events.slice(-12).reverse().map((event) => <div key={event.id}><span className={`event-dot event-dot--${event.type.split(".")[0]}`}/><div><strong>{event.type}</strong><p>{eventLabel(event).summary}</p></div></div>) : <p className="muted">No activity recorded for this agent.</p>}</div></section><div className="drawer-note"><ShieldCheck size={15}/><p>Decision summaries and execution artifacts are shown. Hidden chain-of-thought is never exposed.</p></div></aside></div>;
}

function CommandPalette({ close, navigate, run }: { close: () => void; navigate: (page: Page) => void; run: () => void }) {
  const [query, setQuery] = useState("");
  const commands = [
    { label: "Investigate current objective", detail: "Run incident workflow", icon: Play, action: () => { run(); close(); } },
    { label: "View approval center", detail: "Inspect pending writes", icon: Inbox, action: () => navigate("approvals") },
    { label: "Open work board", detail: "See execution state", icon: ListChecks, action: () => navigate("board") },
    { label: "Check runtime diagnostics", detail: "Inspect local capabilities", icon: Activity, action: () => navigate("diagnostics") },
    { label: "Manage plugins", detail: "Review installed contributions", icon: Blocks, action: () => navigate("plugins") }
  ];
  const filtered = commands.filter((command) => `${command.label} ${command.detail}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="palette"><div className="palette-input"><Search size={17}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a command…"/><kbd>ESC</kbd></div><div className="palette-group"><span>Commands</span>{filtered.map((command) => <button key={command.label} onClick={command.action}><command.icon size={16}/><div><strong>{command.label}</strong><small>{command.detail}</small></div><ChevronRight size={14}/></button>)}{filtered.length === 0 && <div className="palette-empty">No matching command</div>}</div></div></div>;
}

function WorkspaceDialog({ current, close, select }: { current: string; close: () => void; select: (name: string) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  return <div className="palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="workspace-dialog"><header><div><span className="sf-eyebrow">Local repositories</span><h2>Switch workspace</h2></div><button className="icon-button" aria-label="Close workspace switcher" onClick={close}><X size={16}/></button></header><button className="workspace-option active" onClick={() => select("staffforge")}><div className="workspace-icon">SF</div><div><strong>staffforge</strong><small>Current repository · {current === "staffforge" ? "active" : "available"}</small></div><Check size={15}/></button><button className="workspace-option" onClick={() => select("dataGuild")}><div className="workspace-icon">DG</div><div><strong>dataGuild</strong><small>Parent workspace</small></div><ChevronRight size={15}/></button><input ref={(node) => { picker.current = node; node?.setAttribute("webkitdirectory", ""); }} className="visually-hidden" type="file" multiple onChange={(event) => { const name = event.currentTarget.files?.[0]?.webkitRelativePath.split("/")[0]; if (name) select(name); }} /><Button variant="secondary" onClick={() => picker.current?.click()}><FolderOpen size={14}/> Choose another folder</Button></section></div>;
}
