import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Activity,
  Bell,
  Bot,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Code2,
  Command,
  Database,
  FileText,
  Folder,
  GitBranch,
  Grid2X2,
  HardDrive,
  Layers3,
  Link2,
  ListChecks,
  MemoryStick,
  Moon,
  MoreHorizontal,
  Network,
  PanelBottomClose,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Sun,
  TerminalSquare,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import "./agent-workbench.css";

type Theme = "dark" | "light";
type PanelTab = "trace" | "output" | "approvals" | "problems";
type ActivityId = "domains" | "tasks" | "workflows" | "memory" | "connectors" | "store";
type WorkTabId = "hq" | "incident" | "pr" | "approvals";

type Agent = {
  id: string;
  name: string;
  role: string;
  status: "working" | "ready" | "idle";
  color: string;
  summary: string;
  engine: string;
  tools: number;
  memory: string;
};

type Domain = {
  id: string;
  name: string;
  count: number;
  icon: ComponentType<{ size?: number }>;
  agents: Agent[];
  workflows: string[];
};

const agents: Agent[] = [
  {
    id: "investigator",
    name: "Incident Investigator",
    role: "Root cause and evidence",
    status: "working",
    color: "#53ae7c",
    summary: "Investigating 2 pipeline failures",
    engine: "Codex",
    tools: 5,
    memory: "36 sources",
  },
  {
    id: "engineer",
    name: "Data Engineer",
    role: "Pipelines and models",
    status: "ready",
    color: "#7e94b9",
    summary: "Ready for work",
    engine: "Codex",
    tools: 6,
    memory: "42 sources",
  },
  {
    id: "reviewer",
    name: "PR Reviewer",
    role: "Independent change review",
    status: "idle",
    color: "#8d98a9",
    summary: "3 reviews waiting",
    engine: "Claude Code",
    tools: 3,
    memory: "19 sources",
  },
  {
    id: "cost",
    name: "Snowflake Cost Agent",
    role: "Warehouse efficiency",
    status: "working",
    color: "#e39a2f",
    summary: "Spend increased 18%",
    engine: "Codex",
    tools: 4,
    memory: "28 sources",
  },
  {
    id: "docs",
    name: "Documentation Agent",
    role: "Models and decisions",
    status: "idle",
    color: "#8d98a9",
    summary: "4 models need documentation",
    engine: "Gemini",
    tools: 3,
    memory: "54 sources",
  },
];

const domains: Domain[] = [
  {
    id: "data",
    name: "Data & Analytics",
    count: 8,
    icon: Database,
    agents,
    workflows: ["Production incident", "Cost investigation"],
  },
  {
    id: "software",
    name: "Software Engineering",
    count: 7,
    icon: Code2,
    agents: [],
    workflows: [],
  },
  {
    id: "marketing",
    name: "Marketing",
    count: 5,
    icon: Sparkles,
    agents: [],
    workflows: [],
  },
  {
    id: "finance",
    name: "Finance",
    count: 4,
    icon: Layers3,
    agents: [],
    workflows: [],
  },
];

const activityItems: Array<{ id: ActivityId; label: string; icon: ComponentType<{ size?: number }> }> = [
  { id: "domains", label: "Domains", icon: Grid2X2 },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "workflows", label: "Workflows", icon: Workflow },
  { id: "memory", label: "Memory", icon: MemoryStick },
  { id: "connectors", label: "Connectors", icon: Link2 },
  { id: "store", label: "Store", icon: ShoppingBag },
];

const workTabs: Array<{ id: WorkTabId; label: string; icon: ComponentType<{ size?: number }>; badge?: string }> = [
  { id: "hq", label: "Data HQ", icon: Database },
  { id: "incident", label: "Snowflake spend +18%", icon: Activity },
  { id: "pr", label: "PR #381", icon: GitBranch },
  { id: "approvals", label: "Approvals", icon: ShieldCheck, badge: "2" },
];

const traceEvents = [
  { time: "09:32", tool: "Snowflake", title: "Read Snowflake query history", detail: "1,482 queries across 2 affected pipelines", tone: "blue" },
  { time: "09:33", tool: "Snowflake", title: "Found ANALYTICS_XL usage spike", detail: "Query volume increased 4.2× after deployment", tone: "blue" },
  { time: "09:34", tool: "GitHub", title: "Traced change to PR #381", detail: "Incremental predicate removed from the model", tone: "blue" },
  { time: "09:35", tool: "AgentOS", title: "Root cause confirmed", detail: "Full refreshes are running instead of incremental logic", tone: "amber" },
];

const runtimeRows = [
  { time: "09:32", source: "Snowflake", message: "Query history read", detail: "Retrieved 1,482 queries", status: "complete" },
  { time: "09:33", source: "Snowflake", message: "Warehouse spike isolated", detail: "ANALYTICS_XL · +18% spend", status: "complete" },
  { time: "09:34", source: "GitHub", message: "Change context attached", detail: "PR #381 and 12 related commits", status: "complete" },
  { time: "09:35", source: "Policy", message: "Fix awaiting approval", detail: "No repository write has run", status: "waiting" },
];

function readInitialTheme(): Theme {
  const stored = localStorage.getItem("agentos:theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function AgentWorkbench() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const [activity, setActivity] = useState<ActivityId>("domains");
  const [activeDomain, setActiveDomain] = useState("data");
  const [expandedDomains, setExpandedDomains] = useState(() => new Set(["data"]));
  const [selectedAgentId, setSelectedAgentId] = useState("cost");
  const [activeTab, setActiveTab] = useState<WorkTabId>("incident");
  const [panelTab, setPanelTab] = useState<PanelTab>("trace");
  const [panelOpen, setPanelOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [notice, setNotice] = useState<string>();

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[3]!;

  useEffect(() => {
    document.documentElement.dataset.agentosTheme = theme;
    localStorage.setItem("agentos:theme", theme);
  }, [theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(undefined), 2200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const commands = useMemo(
    () => [
      { label: "Open Data HQ", detail: "Domain overview", action: () => setActiveTab("hq") },
      { label: "Open Snowflake incident", detail: "Current investigation", action: () => setActiveTab("incident") },
      { label: "Review PR #381", detail: "Evidence and proposed change", action: () => setActiveTab("pr") },
      { label: "Open approvals", detail: "2 decisions need you", action: () => setActiveTab("approvals") },
      { label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`, detail: "Appearance", action: () => setTheme(theme === "dark" ? "light" : "dark") },
      { label: inspectorOpen ? "Hide agent inspector" : "Show agent inspector", detail: "Workspace layout", action: () => setInspectorOpen((open) => !open) },
    ],
    [inspectorOpen, theme],
  );

  const filteredCommands = commands.filter((command) =>
    `${command.label} ${command.detail}`.toLowerCase().includes(paletteQuery.toLowerCase()),
  );

  function toggleDomain(id: string) {
    setActiveDomain(id);
    setExpandedDomains((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runCommand(action: () => void) {
    action();
    setPaletteOpen(false);
    setPaletteQuery("");
  }

  return (
    <div className={`agentos ${inspectorOpen ? "agentos--inspector" : ""}`}>
      <header className="aw-titlebar">
        <div className="aw-brand" aria-label="AgentOS">
          <AgentMark />
          <strong>AgentOS</strong>
        </div>
        <button className="aw-global-search" onClick={() => setPaletteOpen(true)}>
          <Search size={15} />
          <span>Ask your AI team or jump to anything…</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="aw-title-actions">
          <span className="aw-sync"><i /> Synced</span>
          <button className="aw-icon-button" aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="aw-icon-button aw-notification" aria-label="Notifications"><Bell size={16} /><i /></button>
          <button className="aw-profile" aria-label="Open profile"><span>MD</span><strong>Mo</strong><ChevronDown size={13} /></button>
        </div>
      </header>

      <div className="aw-body">
        <aside className="aw-activity-rail" aria-label="Primary navigation">
          <div className="aw-activity-list">
            {activityItems.map((item) => (
              <button
                key={item.id}
                className={activity === item.id ? "active" : ""}
                aria-label={item.label}
                aria-current={activity === item.id ? "page" : undefined}
                onClick={() => { setActivity(item.id); if (item.id !== "domains") setNotice(`${item.label} workspace is ready for the next build phase`); }}
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="aw-activity-bottom">
            <button aria-label="Settings" onClick={() => setNotice("Settings will connect to the local runtime later")}><Settings size={19} /><span>Settings</span></button>
            <div className="aw-local" title="Local runtime"><i /><span>Local</span></div>
          </div>
        </aside>

        <aside className="aw-domain-explorer">
          <header className="aw-pane-header"><span>Domains</span><button aria-label="Add domain" onClick={() => setNotice("Domain pack installation is the next phase")}><Plus size={16} /></button></header>
          <div className="aw-domain-list">
            {domains.map((domain) => {
              const expanded = expandedDomains.has(domain.id);
              const current = domain.id === activeDomain;
              return (
                <section className={`aw-domain ${current ? "current" : ""}`} key={domain.id}>
                  <button className="aw-domain-row" onClick={() => toggleDomain(domain.id)} aria-expanded={expanded}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Folder size={16} />
                    <strong>{domain.name}</strong>
                    <span>{domain.count}</span>
                  </button>
                  {expanded && domain.id === "data" && (
                    <div className="aw-domain-contents">
                      <button className="aw-overview-row" onClick={() => setActiveTab("hq")}><FileText size={14} /> Overview</button>
                      <p className="aw-tree-label">Agents</p>
                      {domain.agents.map((agent) => (
                        <button
                          className={`aw-agent-row ${selectedAgentId === agent.id ? "selected" : ""}`}
                          key={agent.id}
                          onClick={() => { setSelectedAgentId(agent.id); setInspectorOpen(true); }}
                        >
                          <i style={{ background: agent.color }} />
                          <span>{agent.name}</span>
                          {agent.status === "working" && <em>live</em>}
                        </button>
                      ))}
                      <p className="aw-tree-label">Workflows</p>
                      {domain.workflows.map((workflow) => (
                        <button className="aw-workflow-row" key={workflow} onClick={() => setNotice(`${workflow} selected`)}><Network size={13} /><span>{workflow}</span></button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <button className="aw-add-domain" onClick={() => setNotice("Domain packs will be installed from the Agent Store")}><Plus size={14} /> Add domain</button>
        </aside>

        <section className="aw-workbench">
          <nav className="aw-tabs" aria-label="Open workspaces">
            <div className="aw-tab-scroll">
              {workTabs.map((tab) => (
                <button className={`aw-tab ${activeTab === tab.id ? "active" : ""}`} key={tab.id} onClick={() => setActiveTab(tab.id)}>
                  <tab.icon size={14} />
                  <span>{tab.label}</span>
                  {tab.badge && <em>{tab.badge}</em>}
                  <X size={12} className="aw-tab-close" />
                </button>
              ))}
            </div>
            <button className="aw-tab-action" aria-label={inspectorOpen ? "Hide inspector" : "Show inspector"} onClick={() => setInspectorOpen((open) => !open)}>
              {inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </nav>

          <div className="aw-editor">
            {activeTab === "incident" && <IncidentWorkspace notify={setNotice} />}
            {activeTab === "hq" && <DomainOverview selectTab={setActiveTab} />}
            {activeTab === "pr" && <PullRequestView notify={setNotice} />}
            {activeTab === "approvals" && <ApprovalsView notify={setNotice} />}
          </div>

          <section className={`aw-bottom-panel ${panelOpen ? "open" : "closed"}`}>
            <header>
              <nav aria-label="Runtime panels">
                {(["trace", "output", "approvals", "problems"] as PanelTab[]).map((tab) => (
                  <button key={tab} className={panelTab === tab ? "active" : ""} onClick={() => { setPanelTab(tab); setPanelOpen(true); }}>
                    {tab === "trace" ? "Run trace" : tab}
                    {tab === "approvals" && <em>2</em>}
                    {tab === "problems" && <em>0</em>}
                  </button>
                ))}
              </nav>
              <div><span className="aw-live"><i /> Live</span><button aria-label={panelOpen ? "Collapse panel" : "Expand panel"} onClick={() => setPanelOpen((open) => !open)}>{panelOpen ? <PanelBottomClose size={15} /> : <TerminalSquare size={15} />}</button></div>
            </header>
            {panelOpen && <RuntimePanel tab={panelTab} notify={setNotice} />}
          </section>

          <footer className="aw-statusbar">
            <button><Database size={12} /> Data & Analytics</button><ChevronRight size={11} />
            <button><Activity size={12} /> Snowflake Cost Agent</button><ChevronRight size={11} />
            <button><Settings size={12} /> Codex</button>
            <button><Boxes size={12} /> 4 tools</button>
            <span><i /> Local</span>
            <span><ShieldCheck size={12} /> Policy enforced</span>
            <span className="aw-system-status"><i /> All systems operational</span>
          </footer>
        </section>

        {inspectorOpen && <AgentInspector agent={selectedAgent} close={() => setInspectorOpen(false)} notify={setNotice} />}
      </div>

      {paletteOpen && (
        <div className="aw-palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaletteOpen(false); }}>
          <section className="aw-palette" role="dialog" aria-modal="true" aria-label="AgentOS command palette">
            <div className="aw-palette-input"><Search size={18} /><input autoFocus placeholder="Ask AgentOS or run a command…" value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} /><kbd>esc</kbd></div>
            <p>Suggestions</p>
            <div className="aw-palette-results">
              {filteredCommands.map((command, index) => (
                <button key={command.label} className={index === 0 ? "active" : ""} onClick={() => runCommand(command.action)}>
                  <Command size={15} /><span><strong>{command.label}</strong><small>{command.detail}</small></span><ChevronRight size={14} />
                </button>
              ))}
              {filteredCommands.length === 0 && <div className="aw-palette-empty">No matching commands</div>}
            </div>
          </section>
        </div>
      )}

      {notice && <div className="aw-toast"><CheckCircle2 size={15} />{notice}</div>}
    </div>
  );
}

function AgentMark() {
  return <span className="aw-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function IncidentWorkspace({ notify }: { notify: (message: string) => void }) {
  return (
    <div className="aw-incident">
      <header className="aw-workspace-header">
        <div><p className="aw-eyebrow">Cost investigation · DG-1042</p><h1>Snowflake spend increased 18%</h1><div className="aw-subline"><span className="aw-state"><i /> Investigating</span><span>Owned by</span><button><Activity size={13} /> Snowflake Cost Agent</button></div></div>
        <div className="aw-header-actions"><button className="aw-secondary-button" onClick={() => notify("A shareable investigation link will be available later")}><Link2 size={14} /> Share</button><button className="aw-primary-button" onClick={() => notify("Fix review opened — no write has been executed")}><ShieldCheck size={15} /> Review fix <ChevronRight size={14} /></button></div>
      </header>

      <div className="aw-incident-grid">
        <section className="aw-thread-section">
          <header><div><span className="aw-eyebrow">Observable work</span><h2>Agent Thread</h2></div><button aria-label="Thread options"><MoreHorizontal size={17} /></button></header>
          <div className="aw-thread">
            {traceEvents.map((event, index) => (
              <article className={`aw-thread-event aw-thread-event--${event.tone}`} key={event.time}>
                <time>{event.time}</time><span className="aw-thread-node" />
                <div><div className="aw-thread-title"><span className="aw-tool-chip">{event.tool === "GitHub" ? <GitBranch size={13} /> : event.tool === "Snowflake" ? <Database size={13} /> : <ShieldCheck size={13} />}{event.tool}</span><strong>{event.title}</strong></div><p>{event.detail}</p></div>
                {index < traceEvents.length - 1 && <span className="aw-thread-line" />}
              </article>
            ))}
          </div>
          <div className="aw-result-card"><span>Estimated waste</span><strong>$147 <small>/ day</small></strong><p>Full refreshes began after PR #381. Reverting the incremental predicate should restore normal spend.</p></div>
        </section>

        <aside className="aw-evidence">
          <section><header><span>Evidence</span><em>3 verified</em></header><dl><div><dt><Database size={14} /> Warehouse</dt><dd>ANALYTICS_XL</dd></div><div><dt><GitBranch size={14} /> Changed by</dt><dd>PR #381</dd></div><div><dt><Activity size={14} /> Impact</dt><dd className="aw-impact">+$147/day</dd></div></dl></section>
          <section className="aw-fix-card"><div className="aw-fix-icon"><Zap size={16} /></div><span className="aw-eyebrow">Proposed fix</span><h3>Restore incremental logic</h3><p>Reintroduce the incremental predicate and exclude non-production warehouse runs.</p><button onClick={() => notify("Review opened with exact diff and rollback plan")}><ShieldCheck size={14} /> Review fix <ChevronRight size={13} /></button></section>
          <section className="aw-proof-note"><CheckCircle2 size={16} /><div><strong>Evidence complete</strong><p>Queries, deployment history, and policy checks are attached to this investigation.</p></div></section>
        </aside>
      </div>
    </div>
  );
}

function DomainOverview({ selectTab }: { selectTab: (tab: WorkTabId) => void }) {
  return (
    <div className="aw-overview">
      <header className="aw-workspace-header"><div><p className="aw-eyebrow">Domain workspace</p><h1>Data & Analytics</h1><div className="aw-subline"><span>8 agents</span><span>·</span><span>4 connected systems</span><span>·</span><span>2 items need you</span></div></div><button className="aw-primary-button"><Plus size={15} /> New task</button></header>
      <div className="aw-overview-grid">
        <section className="aw-focus-card" onClick={() => selectTab("incident")}><div><span className="aw-eyebrow">Needs attention</span><h2>Snowflake spend increased 18%</h2><p>Root cause confirmed. A safe fix is ready for review.</p></div><strong>$147<small>/day</small></strong><ChevronRight size={18} /></section>
        <section className="aw-team-list"><header><h2>AI Team</h2><span>4 active</span></header>{agents.slice(0, 4).map((agent) => <div key={agent.id}><i style={{ background: agent.color }} /><span><strong>{agent.name}</strong><small>{agent.summary}</small></span><em>{agent.status}</em></div>)}</section>
        <section className="aw-recent-work"><header><h2>Recent work</h2><button>View all</button></header><div><CheckCircle2 size={15} /><span><strong>Revenue pipeline incident</strong><small>Resolved 42 minutes ago</small></span><em>Complete</em></div><div><GitBranch size={15} /><span><strong>PR #381 review</strong><small>Fix proposed by Data Engineer</small></span><em>Review</em></div><div><FileText size={15} /><span><strong>Model documentation</strong><small>4 models are missing owners</small></span><em>Queued</em></div></section>
      </div>
    </div>
  );
}

function PullRequestView({ notify }: { notify: (message: string) => void }) {
  return (
    <div className="aw-simple-view"><header className="aw-workspace-header"><div><p className="aw-eyebrow">Repository evidence</p><h1>PR #381 · incremental revenue model</h1><div className="aw-subline"><GitBranch size={13} /> analytics/dbt-production <span>·</span><span>12 commits</span></div></div><button className="aw-primary-button" onClick={() => notify("Approval is required before AgentOS posts to GitHub")}><ShieldCheck size={15} /> Review change</button></header><div className="aw-document"><aside><span>Files changed</span><button className="active"><FileText size={14} /> fct_revenue.sql</button><button><FileText size={14} /> schema.yml</button><button><FileText size={14} /> test_revenue.sql</button></aside><article><span className="aw-eyebrow">Agent summary</span><h2>The incremental predicate was removed</h2><p>This change causes the model to scan the entire revenue history on every scheduled run. The behavior matches the warehouse usage spike that began after deployment.</p><div className="aw-change-block"><span>- where event_date &gt;= current_date - 2</span><strong>+ restore incremental filter from the previous release</strong></div><section><CheckCircle2 size={17} /><div><strong>Proposed change is bounded</strong><p>One model changes. No production action runs until you approve the exact diff.</p></div></section></article></div></div>
  );
}

function ApprovalsView({ notify }: { notify: (message: string) => void }) {
  return (
    <div className="aw-simple-view"><header className="aw-workspace-header"><div><p className="aw-eyebrow">Human control</p><h1>Approvals</h1><div className="aw-subline"><span>2 decisions are waiting</span></div></div></header><div className="aw-approval-list"><article><div className="aw-approval-icon"><GitBranch size={17} /></div><div><span className="aw-eyebrow">Repository write</span><h2>Create a fix branch for PR #381</h2><p>Snowflake Cost Agent wants the Data Engineer to restore incremental logic in one dbt model.</p><dl><div><dt>Scope</dt><dd>analytics/models/fct_revenue.sql</dd></div><div><dt>Risk</dt><dd>Low · reversible branch</dd></div></dl></div><div className="aw-approval-actions"><button onClick={() => notify("Request declined")}>Decline</button><button onClick={() => notify("Approved once for this exact change")}>Allow once</button></div></article><article><div className="aw-approval-icon"><Bot size={17} /></div><div><span className="aw-eyebrow">External message</span><h2>Post investigation summary to Slack</h2><p>Incident Investigator prepared a six-line summary for #data-incidents.</p></div><div className="aw-approval-actions"><button onClick={() => notify("Request declined")}>Decline</button><button onClick={() => notify("Message approved once")}>Allow once</button></div></article></div></div>
  );
}

function RuntimePanel({ tab, notify }: { tab: PanelTab; notify: (message: string) => void }) {
  if (tab === "output") return <div className="aw-panel-empty"><FileText size={17} /><span><strong>Output is ready</strong><small>Fix proposal and evidence summary are attached to this task.</small></span><button onClick={() => notify("Output opened")}>Open</button></div>;
  if (tab === "approvals") return <div className="aw-panel-empty"><ShieldCheck size={17} /><span><strong>2 approvals are waiting</strong><small>Repository write and Slack message.</small></span><button onClick={() => notify("Approvals tab opened")}>Review</button></div>;
  if (tab === "problems") return <div className="aw-panel-empty"><CheckCircle2 size={17} /><span><strong>No runtime problems</strong><small>The current investigation is healthy.</small></span></div>;
  return <div className="aw-runtime-rows">{runtimeRows.map((row) => <div key={row.time + row.source}><time>{row.time}</time><span className="aw-runtime-source">{row.source === "Snowflake" ? <Database size={13} /> : row.source === "GitHub" ? <GitBranch size={13} /> : <ShieldCheck size={13} />}{row.source}</span><strong>{row.message}</strong><span>{row.detail}</span>{row.status === "complete" ? <Check size={13} /> : <CircleDot size={13} />}</div>)}</div>;
}

function AgentInspector({ agent, close, notify }: { agent: Agent; close: () => void; notify: (message: string) => void }) {
  return (
    <aside className="aw-inspector">
      <header className="aw-pane-header"><span>Agent</span><button aria-label="Close inspector" onClick={close}><X size={15} /></button></header>
      <div className="aw-agent-identity"><div className="aw-agent-avatar"><Activity size={22} /></div><div><h2>{agent.name}</h2><span><i style={{ background: agent.color }} />{agent.status === "working" ? "Working now" : agent.status}</span></div></div>
      <p className="aw-agent-description">{agent.role}. Works inside the Data & Analytics domain with explicit context and policy boundaries.</p>
      <div className="aw-inspector-list"><button onClick={() => notify("Engine switching will be connected in the next phase")}><Settings size={16} /><span>Engine</span><strong>{agent.engine}</strong><ChevronRight size={14} /></button><button onClick={() => notify(`${agent.tools} tools are connected to this agent`)}><Boxes size={16} /><span>Tools</span><strong>{agent.tools} connected</strong><ChevronRight size={14} /></button><button onClick={() => notify("Workspace memory inspector will be connected later")}><HardDrive size={16} /><span>Memory</span><strong>{agent.memory}</strong><ChevronRight size={14} /></button><button onClick={() => notify("Writes always require human approval")}><ShieldCheck size={16} /><span>Policy</span><strong>Ask before write</strong><ChevronRight size={14} /></button></div>
      <section className="aw-controlled"><ShieldCheck size={20} /><div><strong>Controlled by AgentOS</strong><p>Tools, memory, permissions, and audit history remain portable across engines.</p></div></section>
      <div className="aw-inspector-foot"><span><i /> Local runtime</span><button onClick={() => notify("Agent detail opened")}>Open agent</button></div>
    </aside>
  );
}
