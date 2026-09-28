import { useEffect, useRef, useState } from "react";
import { Activity, ArrowRight, Bot, Focus, Minus, Plus, ShieldAlert, X } from "lucide-react";
import {
  taskParticipants,
  type Company,
  type CompanyAgent,
  type CompanyTask,
  type Office,
} from "./company-model";
import { AgentWorkForm } from "./AgentWorkForm";
import { WorkflowMapPanel } from "./WorkflowMapPanel";
import { latestRun } from "../engines/run-presentation";
import "./company-floorplan.css";
import { controlLive, isActiveRun, useLiveRuntime, type LiveRun } from "../engines/live-runtime";
import {
  agentMapRuns,
  agentMapState,
  workflowOfficeId,
  type AgentMapState,
} from "./company-map-state";

const initialWorkers = new Set(["data-engineer", "investigator", "developer"]);
const initialApprovals = new Set(["reviewer"]);
const stateLabel: Record<AgentMapState, string> = {
  working: "Working",
  idle: "Idle",
  offline: "Not connected",
  approval: "Needs approval",
};
const colors: Record<string, string> = {
  sage: "#789374",
  blue: "#7396b2",
  coral: "#c8977d",
  lavender: "#a18cb9",
  gold: "#bba565",
};
type Props = {
  company: Company;
  query: string;
  editOffice: (office: Office) => void;
  addWorkflow: (office: Office | null) => void;
  openWorkflow: (task: CompanyTask) => void;
  runWorkflow: (task: CompanyTask) => Promise<void>;
  assignWork: (agent: CompanyAgent, text: string) => Promise<void>;
  addOffice: () => void;
  addAgent: (id: string) => void;
  editAgent: (officeId: string, agent: CompanyAgent) => void;
  inspectAgent: (officeId: string, agent: CompanyAgent) => void;
};

export function CompanyFloorplan({
  company,
  query,
  editOffice,
  addWorkflow,
  openWorkflow,
  runWorkflow,
  assignWork,
  addOffice,
  addAgent,
  editAgent,
  inspectAgent,
}: Props) {
  const [preview, setPreview] = useState(false);
  const live = useLiveRuntime();
  const [overrides, setOverrides] = useState<Record<string, "working" | "approval" | "idle">>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const mapScroll = useRef<HTMLDivElement>(null);
  const inspector = useRef<HTMLElement>(null);
  const agents = company.offices.flatMap((office) =>
    office.agents.map((agent) => ({ ...agent, office })),
  );
  const selected = agents.find((a) => a.id === selectedId);
  const officeWorkflows = (office: Office) =>
    (company.tasks || []).filter((task) => workflowOfficeId(company, task) === office.id);
  const selectedWorkflow = (company.tasks || []).find((task) => task.id === selectedWorkflowId);
  const selectAgent = (id: string) => {
    setSelectedWorkflowId(null);
    setSelectedId(id);
  };
  const selectWorkflow = (id: string) => {
    setSelectedId(null);
    setSelectedWorkflowId(id);
  };
  const status = (agent: CompanyAgent): AgentMapState =>
    !preview
      ? agentMapState(live.runs, agent.id)
      : overrides[agent.id] ||
        (initialApprovals.has(agent.id)
          ? "approval"
          : initialWorkers.has(agent.id)
            ? "working"
            : "idle");
  const working = agents.filter((a) => status(a) === "working").length;
  const approvals = agents.filter((a) => status(a) === "approval").length;
  const idle = agents.filter((a) => status(a) === "idle").length;
  const offline = agents.filter((a) => status(a) === "offline").length;
  const selectedRuns = selected ? agentMapRuns(live.runs, selected.id) : [];
  const selectedRun =
    selectedRuns.find((run) => isActiveRun(run) && run.currentAgentId === selected?.id) ||
    selectedRuns[0];
  const selectedStep = selectedRun?.request.steps.find(
    (step) =>
      step.agentId === selected?.id &&
      (!selectedRun.currentAgentId || step.agentId === selectedRun.currentAgentId),
  );
  const selectedResult = selectedRun?.results.find((result) => result.id === selectedStep?.id);
  const selectedEvent = selectedRun?.events.at(-1);
  const selectedApproval = selectedRun?.approvals[0];
  const agentWorkflows = selected
    ? (company.tasks || []).filter((task) =>
        taskParticipants(company, task.assignment).some((agent) => agent.id === selected.id),
      )
    : [];
  async function decideApproval(allow: boolean) {
    if (!selectedRun || !selectedApproval || approvalBusy) return;
    setApprovalBusy(true);
    setApprovalError("");
    try {
      await controlLive(selectedRun.request.id, selectedApproval.id, allow);
    } catch (cause) {
      setApprovalError(
        cause instanceof Error ? cause.message : "The approval could not be updated.",
      );
    } finally {
      setApprovalBusy(false);
    }
  }
  useEffect(() => {
    if (selectedId && window.matchMedia("(max-width: 680px)").matches)
      inspector.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);
  const matches = (office: Office, agent?: CompanyAgent) =>
    !query ||
    `${office.name} ${office.domain} ${agent ? `${agent.name} ${agent.role}` : office.agents.map((a) => a.name).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase());
  const officeStatus = (office: Office) => {
    const active = office.agents.filter((agent) => status(agent) === "working").length;
    const waiting = office.agents.filter((agent) => status(agent) === "approval").length;
    return `${office.agents.length} ${office.agents.length === 1 ? "agent" : "agents"} · ${active} working${waiting ? ` · ${waiting} approval` : ""}`;
  };
  /** Bottom of the desk area inside a room (the empty-office card when it has no agents). */
  const agentsBottom = (office: Office) =>
    office.agents.length ? 86 + Math.ceil(office.agents.length / 2) * 104 - 14 : 215;
  const rooms: Array<{ office: Office | null; x: number; y: number; height: number }> = [];
  let y = 100;
  for (let i = 0; i < company.offices.length + 1; i += 2) {
    const pair = [company.offices[i], company.offices[i + 1]];
    const height = Math.max(
      284,
      ...pair.map((o) => {
        if (!o) return 0;
        const flows = officeWorkflows(o).length;
        return agentsBottom(o) + (flows ? 26 + Math.ceil(flows / 2) * WORKFLOW_ROW : 0) + 48;
      }),
    );
    for (let j = 0; j < 2 && i + j < company.offices.length + 1; j++)
      rooms.push({ office: pair[j] || null, x: j === 0 ? 38 : 512, y, height });
    y += height + 22;
  }
  // Workflows that span several offices live in a shared, company-wide area below the rooms.
  const sharedWorkflows = (company.tasks || []).filter((task) => !workflowOfficeId(company, task));
  const shared = {
    y,
    height: 40 + Math.max(1, Math.ceil(sharedWorkflows.length / SHARED_COLUMNS)) * WORKFLOW_ROW,
  };
  y += shared.height + 22;
  const height = y + 92;
  const enter = (event: React.KeyboardEvent<SVGGElement>, action: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };

  return (
    <section className="fp-shell" aria-label="Top-down company map">
      <header className="fp-toolbar" aria-label="Map controls">
        <div className="fp-live-summary" aria-label="Live team status">
          <span className="working">
            <i /> {working} working
          </span>
          <span className="approval">
            <i /> {approvals} approval
          </span>
          <span className="idle">
            <i /> {idle} idle
          </span>
          {!preview && (
            <span className="offline">
              <i /> {offline} offline
            </span>
          )}
        </div>
        <div className="fp-toolbar-right">
          <span className="fp-demo-label">Preview activity</span>
          <button
            className={`fp-switch ${preview ? "on" : ""}`}
            role="switch"
            aria-checked={preview}
            aria-label="Preview activity"
            onClick={() => setPreview(!preview)}
          >
            <span />
          </button>
          <span className="fp-toolbar-separator" />
          <div className="fp-zoom">
            <button
              aria-label="Zoom out"
              disabled={zoom <= 40}
              onClick={() => setZoom((z) => Math.max(40, z - 20))}
            >
              <Minus size={13} />
            </button>
            <span>{zoom}%</span>
            <button
              aria-label="Zoom in"
              disabled={zoom >= 180}
              onClick={() => setZoom((z) => Math.min(180, z + 20))}
            >
              <Plus size={13} />
            </button>
            <button
              aria-label="Fit map"
              onClick={() => {
                const el = mapScroll.current;
                if (el)
                  setZoom(
                    Math.round(
                      Math.max(
                        40,
                        Math.min(
                          100,
                          (((el.clientHeight - 30) * 920) / (height * (el.clientWidth - 24))) * 100,
                        ),
                      ),
                    ),
                  );
              }}
            >
              <Focus size={14} />
            </button>
          </div>
        </div>
      </header>
      <div className="fp-layout">
        <div className="fp-map-area">
          <div
            className="fp-map-scroll"
            ref={mapScroll}
            tabIndex={0}
            aria-label="Scrollable company map"
          >
            <div className="fp-map-size" style={{ width: `${zoom}%` }}>
              <svg
                className="fp-map"
                viewBox={`0 0 920 ${height}`}
                role="group"
                aria-label="Office rooms and agent workstations"
              >
                <defs>
                  <pattern id="fp-floor-grain" width="26" height="26" patternUnits="userSpaceOnUse">
                    <path d="M0 0H26V26" fill="none" stroke="var(--fp-grid)" strokeWidth=".6" />
                  </pattern>
                  <pattern id="fp-carpet" width="6" height="6" patternUnits="userSpaceOnUse">
                    <path d="M0 6L6 0" stroke="var(--fp-carpet-line)" strokeWidth=".5" />
                  </pattern>
                  <filter id="fp-furniture-shadow" x="-40%" y="-40%" width="180%" height="190%">
                    <feDropShadow
                      dx="0"
                      dy="3"
                      stdDeviation="2"
                      floodColor="#17251b"
                      floodOpacity=".13"
                    />
                  </filter>
                  <filter id="fp-building-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow
                      dx="0"
                      dy="6"
                      stdDeviation="8"
                      floodColor="#17251b"
                      floodOpacity=".09"
                    />
                  </filter>
                </defs>
                <rect
                  x="25"
                  y="28"
                  width="870"
                  height={height - 53}
                  rx="7"
                  fill="var(--fp-hall)"
                  stroke="var(--fp-wall)"
                  strokeWidth="4"
                  filter="url(#fp-building-shadow)"
                />
                <rect x="30" y="33" width="860" height={height - 63} fill="url(#fp-floor-grain)" />
                <path
                  d={`M460 100V${height - 90}`}
                  stroke="var(--fp-hall-path)"
                  strokeWidth="1"
                  strokeDasharray="4 8"
                />
                <text x="65" y="69" className="fp-building-name">
                  {company.name.toUpperCase()}
                </text>
                <text x="854" y="69" textAnchor="end" className="fp-drawing-label">
                  {company.offices.length} {company.offices.length === 1 ? "OFFICE" : "OFFICES"}
                </text>
                {rooms.map(({ office, x, y, height: roomHeight }, index) =>
                  office ? (
                    <g
                      key={office.id}
                      className={`fp-room tone-${office.color}`}
                      opacity={matches(office) ? 1 : 0.28}
                    >
                      <rect
                        x={x}
                        y={y}
                        width="370"
                        height={roomHeight}
                        fill="var(--fp-room-floor)"
                      />
                      <rect
                        x={x + 7}
                        y={y + 7}
                        width="356"
                        height={roomHeight - 14}
                        fill="url(#fp-carpet)"
                      />
                      <path
                        d={
                          x < 400
                            ? `M${x + 370} ${y + roomHeight - 47}V${y}H${x}V${y + roomHeight}H${x + 370}V${y + roomHeight - 9}`
                            : `M${x} ${y + roomHeight - 47}V${y}H${x + 370}V${y + roomHeight}H${x}V${y + roomHeight - 9}`
                        }
                        fill="none"
                        stroke="var(--fp-wall)"
                        strokeWidth="3"
                        strokeLinejoin="round"
                      />
                      <path
                        d={
                          x < 400
                            ? `M${x + 370} ${y + roomHeight - 9}h-36a36 36 0 0 1 36-36`
                            : `M${x} ${y + roomHeight - 9}h36a36 36 0 0 0-36-36`
                        }
                        fill="none"
                        stroke="var(--fp-door)"
                        strokeWidth="1.3"
                      />
                      <path
                        d={`M${x + 50} ${y}h100 M${x + 205} ${y}h115`}
                        stroke="var(--fp-window)"
                        strokeWidth="3"
                      />
                      <g
                        role="button"
                        tabIndex={0}
                        aria-label={`Edit ${office.name} office`}
                        className="fp-room-title"
                        onClick={() => editOffice(office)}
                        onKeyDown={(e) => enter(e, () => editOffice(office))}
                      >
                        <rect
                          x={x + 16}
                          y={y + 16}
                          width="246"
                          height="40"
                          rx="5"
                          fill="transparent"
                        />
                        <rect
                          x={x + 21}
                          y={y + 20}
                          width="4"
                          height="25"
                          rx="2"
                          fill={colors[office.color]}
                        />
                        <text x={x + 36} y={y + 29} className="fp-office-name">
                          {office.name.length > 20 ? `${office.name.slice(0, 19)}…` : office.name}
                        </text>
                        <text x={x + 36} y={y + 44} className="fp-office-meta">
                          {officeStatus(office)}
                        </text>
                      </g>
                      <g
                        role="button"
                        tabIndex={0}
                        aria-label={`Add agent to ${office.name}`}
                        className="fp-room-add-agent"
                        onClick={() => addAgent(office.id)}
                        onKeyDown={(e) => enter(e, () => addAgent(office.id))}
                      >
                        <rect x={x + 276} y={y + 20} width="77" height="26" rx="13" />
                        <path
                          d={`M${x + 289} ${y + 33}h8 M${x + 293} ${y + 29}v8`}
                          strokeWidth="1.4"
                        />
                        <text x={x + 302} y={y + 36}>
                          ADD AGENT
                        </text>
                      </g>
                      <g
                        role="button"
                        tabIndex={0}
                        aria-label={`Add workflow to ${office.name}`}
                        className="fp-room-add-agent"
                        onClick={() => addWorkflow(office)}
                        onKeyDown={(e) => enter(e, () => addWorkflow(office))}
                      >
                        <rect x={x + 184} y={y + 20} width="86" height="26" rx="13" />
                        <path
                          d={`M${x + 197} ${y + 33}h8 M${x + 201} ${y + 29}v8`}
                          strokeWidth="1.4"
                        />
                        <text x={x + 210} y={y + 36}>
                          WORKFLOW
                        </text>
                      </g>
                      {office.agents.map((agent, agentIndex) => (
                        <Workstation
                          key={agent.id}
                          agent={agent}
                          x={x + 85 + (agentIndex % 2) * 173}
                          y={y + 86 + Math.floor(agentIndex / 2) * 104}
                          color={colors[office.color] || "#789374"}
                          state={status(agent)}
                          selected={selectedId === agent.id}
                          dim={!matches(office, agent)}
                          onSelect={() => selectAgent(agent.id)}
                        />
                      ))}
                      {officeWorkflows(office).length > 0 && (
                        <text
                          x={x + 22}
                          y={y + agentsBottom(office) + 16}
                          className="fp-room-number"
                        >
                          WORKFLOWS
                        </text>
                      )}
                      {officeWorkflows(office).map((task, flowIndex) => (
                        <WorkflowBoard
                          key={task.id}
                          task={task}
                          x={x + 22 + (flowIndex % 2) * 170}
                          y={
                            y + agentsBottom(office) + 26 + Math.floor(flowIndex / 2) * WORKFLOW_ROW
                          }
                          run={latestRun(live.runs, `task:${task.id}`)}
                          selected={selectedWorkflowId === task.id}
                          dim={!!query && !task.title.toLowerCase().includes(query.toLowerCase())}
                          onSelect={() => selectWorkflow(task.id)}
                        />
                      ))}
                      {!office.agents.length && (
                        <g>
                          <rect
                            x={x + 58}
                            y={y + 88}
                            width="254"
                            height="117"
                            rx="9"
                            fill="var(--fp-empty)"
                            stroke="var(--fp-door)"
                            strokeDasharray="4 5"
                          />
                          <g
                            role="button"
                            tabIndex={0}
                            className="fp-add-room"
                            aria-label={`Add first agent to ${office.name}`}
                            onClick={() => addAgent(office.id)}
                            onKeyDown={(e) => enter(e, () => addAgent(office.id))}
                          >
                            <circle cx={x + 185} cy={y + 119} r="17" fill="var(--fp-desk)" />
                            <path
                              d={`M${x + 178} ${y + 119}h14 M${x + 185} ${y + 112}v14`}
                              stroke="var(--fp-label)"
                              strokeWidth="1.5"
                            />
                            <text
                              x={x + 185}
                              y={y + 157}
                              textAnchor="middle"
                              className="fp-office-name"
                            >
                              Ready for your team
                            </text>
                            <text
                              x={x + 185}
                              y={y + 177}
                              textAnchor="middle"
                              className="fp-office-meta"
                            >
                              + Add your first agent
                            </text>
                          </g>
                        </g>
                      )}
                      <Cabinet x={x + 18} y={y + roomHeight - 22} />
                      <text
                        x={x + 182}
                        y={y + roomHeight - 14}
                        textAnchor="middle"
                        className="fp-room-number"
                      >
                        OFFICE {String(index + 1).padStart(2, "0")}
                      </text>
                    </g>
                  ) : (
                    <g
                      key="add-office"
                      role="button"
                      tabIndex={0}
                      aria-label="Add office and extend the company map"
                      className="fp-add-office"
                      onClick={addOffice}
                      onKeyDown={(event) => enter(event, addOffice)}
                    >
                      <rect
                        x={x}
                        y={y}
                        width="370"
                        height={roomHeight}
                        rx="5"
                        fill="var(--fp-empty)"
                        stroke="var(--fp-door)"
                        strokeWidth="1.4"
                        strokeDasharray="7 8"
                      />
                      <circle cx={x + 185} cy={y + roomHeight / 2 - 24} r="22" />
                      <path
                        d={`M${x + 175} ${y + roomHeight / 2 - 24}h20 M${x + 185} ${y + roomHeight / 2 - 34}v20`}
                        strokeWidth="1.7"
                      />
                      <text
                        x={x + 185}
                        y={y + roomHeight / 2 + 18}
                        textAnchor="middle"
                        className="fp-office-name"
                      >
                        Add office
                      </text>
                      <text
                        x={x + 185}
                        y={y + roomHeight / 2 + 38}
                        textAnchor="middle"
                        className="fp-office-meta"
                      >
                        Expand your company
                      </text>
                    </g>
                  ),
                )}
                <g className="fp-shared-area">
                  <rect
                    x="38"
                    y={shared.y}
                    width="844"
                    height={shared.height}
                    rx="8"
                    fill="var(--fp-room-floor)"
                    stroke="var(--fp-door)"
                    strokeDasharray="4 5"
                  />
                  <text x="58" y={shared.y + 24} className="fp-room-number">
                    COMPANY-WIDE WORKFLOWS
                  </text>
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label="Add company-wide workflow"
                    className="fp-room-add-agent"
                    onClick={() => addWorkflow(null)}
                    onKeyDown={(e) => enter(e, () => addWorkflow(null))}
                  >
                    <rect x={776} y={shared.y + 10} width="86" height="26" rx="13" />
                    <path d={`M789 ${shared.y + 23}h8 M793 ${shared.y + 19}v8`} strokeWidth="1.4" />
                    <text x={802} y={shared.y + 26}>
                      WORKFLOW
                    </text>
                  </g>
                  {sharedWorkflows.map((task, index) => (
                    <WorkflowBoard
                      key={task.id}
                      task={task}
                      x={58 + (index % SHARED_COLUMNS) * 170}
                      y={shared.y + 40 + Math.floor(index / SHARED_COLUMNS) * WORKFLOW_ROW}
                      run={latestRun(live.runs, `task:${task.id}`)}
                      selected={selectedWorkflowId === task.id}
                      dim={!!query && !task.title.toLowerCase().includes(query.toLowerCase())}
                      onSelect={() => selectWorkflow(task.id)}
                    />
                  ))}
                  {!sharedWorkflows.length && (
                    <text x="58" y={shared.y + 58} className="fp-office-meta">
                      Workflows that use agents from several offices appear here.
                    </text>
                  )}
                </g>
                <Plant x={460} y={115} />
                <Plant x={460} y={height - 84} />
                <g transform={`translate(65 ${height - 69})`}>
                  <rect
                    width="172"
                    height="22"
                    rx="6"
                    fill="var(--fp-desk)"
                    stroke="var(--fp-desk-edge)"
                    filter="url(#fp-furniture-shadow)"
                  />
                  <rect x="7" y="5" width="34" height="12" rx="3" fill="var(--fp-chair)" />
                  <text x="101" y="15" className="fp-room-number" textAnchor="middle">
                    RECEPTION
                  </text>
                </g>
                <text x="460" y={height - 56} className="fp-drawing-label" textAnchor="middle">
                  ↓ ENTRANCE
                </text>
                <path d={`M421 ${height - 26}h78`} stroke="var(--fp-hall)" strokeWidth="9" />
                <g transform={`translate(720 ${height - 76})`}>
                  <rect
                    width="119"
                    height="34"
                    rx="7"
                    fill="var(--fp-lounge)"
                    stroke="var(--fp-desk-edge)"
                  />
                  <path d="M39 3V31M79 3V31" stroke="var(--fp-desk-edge)" />
                  <rect x="29" y="-16" width="60" height="10" rx="4" fill="var(--fp-desk)" />
                  <text x="60" y="51" textAnchor="middle" className="fp-room-number">
                    COMMON SPACE
                  </text>
                </g>
              </svg>
            </div>
          </div>
        </div>
        {selectedWorkflow && !selected && (
          <aside className="fp-inspector" aria-label="Workflow details" ref={inspector}>
            <header>
              <span>WORKFLOW</span>
              <div>
                <button
                  aria-label="Close workflow details"
                  onClick={() => setSelectedWorkflowId(null)}
                >
                  <X size={15} />
                </button>
              </div>
            </header>
            <WorkflowMapPanel
              key={selectedWorkflow.id}
              company={company}
              task={selectedWorkflow}
              run={latestRun(live.runs, `task:${selectedWorkflow.id}`)}
              runNow={() => runWorkflow(selectedWorkflow)}
              open={() => openWorkflow(selectedWorkflow)}
            />
          </aside>
        )}
        {selected && (
          <aside className="fp-inspector" aria-label="Agent details" ref={inspector}>
            <header>
              <span>AGENT DETAILS</span>
              <div>
                <button aria-label="Close agent details" onClick={() => setSelectedId(null)}>
                  <X size={15} />
                </button>
              </div>
            </header>
            <>
              <div className={`fp-selected-avatar tone-${selected.office.color}`}>
                <Bot size={26} />
              </div>
              <h3>{selected.name}</h3>
              <p className="fp-agent-role">{selected.role}</p>
              <span className={`fp-state-badge ${status(selected)}`}>
                {stateLabel[status(selected)]}
                {preview ? " · preview" : ""}
              </span>
              <dl>
                <div>
                  <dt>Office</dt>
                  <dd>{selected.office.name}</dd>
                </div>
                <div>
                  <dt>Engine</dt>
                  <dd>{selected.engine}</dd>
                </div>
              </dl>
              {!preview && selectedRun && (
                <section className="fp-current-work" aria-label="Current agent work">
                  <header>
                    <span>
                      <Activity size={13} />{" "}
                      {isActiveRun(selectedRun) ? "Current task" : "Latest task"}
                    </span>
                    <em className={status(selected)}>{stateLabel[status(selected)]}</em>
                  </header>
                  <h4>{selectedRun.request.title}</h4>
                  <dl>
                    <div>
                      <dt>Step</dt>
                      <dd>{selectedStep?.label || "Preparing work"}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{new Date(selectedRun.updatedAt).toLocaleTimeString()}</dd>
                    </div>
                  </dl>
                  {selectedApproval && (
                    <div className="fp-approval-callout">
                      <ShieldAlert size={15} />
                      <span>
                        <strong>{selectedApproval.title}</strong>
                        <small>{selectedApproval.detail}</small>
                        <span className="fp-approval-actions">
                          <button disabled={approvalBusy} onClick={() => void decideApproval(true)}>
                            {approvalBusy ? "Updating…" : "Approve"}
                          </button>
                          <button
                            disabled={approvalBusy}
                            onClick={() => void decideApproval(false)}
                          >
                            Reject
                          </button>
                        </span>
                      </span>
                    </div>
                  )}
                  {approvalError && (
                    <p className="fp-approval-error" role="alert">
                      {approvalError}
                    </p>
                  )}
                  {(selectedResult?.output || selectedRun.output) && (
                    <div className="fp-work-output">
                      <span>Latest output</span>
                      <p>{(selectedResult?.output || selectedRun.output).slice(0, 280)}</p>
                    </div>
                  )}
                  {!selectedResult?.output && !selectedRun.output && selectedEvent && (
                    <div className="fp-work-output">
                      <span>Latest update</span>
                      <p>{selectedEvent.text.slice(0, 280)}</p>
                    </div>
                  )}
                </section>
              )}
              {!preview && !selectedRun && (
                <div className="fp-state-description">
                  No attributed task yet. This agent will show current work, recent output, and
                  approval requests here after a live run starts.
                </div>
              )}
              {preview && (
                <div className="fp-state-description">
                  {status(selected) === "working"
                    ? "Focused on a task. Live runs show the task, step, and latest update here."
                    : status(selected) === "approval"
                      ? "Waiting at an approval checkpoint. The live inspector shows the request and reviewer action."
                      : "Available for the next task."}
                </div>
              )}
              {preview && (
                <div className="fp-state-controls">
                  <span>TRY A PREVIEW STATE</span>
                  <div>
                    {(["working", "approval", "idle"] as const).map((s) => (
                      <button
                        key={s}
                        aria-pressed={status(selected) === s}
                        onClick={() => setOverrides((v) => ({ ...v, [selected.id]: s }))}
                      >
                        {stateLabel[s]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <AgentWorkForm
                key={selected.id}
                agent={selected}
                assignWork={(text) => assignWork(selected, text)}
              />
              {agentWorkflows.length > 0 && (
                <div className="fp-agent-workflows">
                  <span>IN WORKFLOWS</span>
                  {agentWorkflows.map((task) => (
                    <button key={task.id} onClick={() => openWorkflow(task)}>
                      {task.title} <ArrowRight size={12} />
                    </button>
                  ))}
                </div>
              )}
              <button
                className="fp-inspector-action"
                onClick={() => inspectAgent(selected.office.id, selected)}
              >
                Open run history <ArrowRight size={13} />
              </button>
              <button
                className="fp-inspector-secondary"
                onClick={() => editAgent(selected.office.id, selected)}
              >
                Configure agent <ArrowRight size={13} />
              </button>
              <button
                className="fp-inspector-secondary"
                onClick={() => editOffice(selected.office)}
              >
                Edit office <ArrowRight size={13} />
              </button>
            </>
          </aside>
        )}
      </div>
    </section>
  );
}

const WORKFLOW_ROW = 42;
const SHARED_COLUMNS = 4;

function WorkflowBoard({
  task,
  x,
  y,
  run,
  selected,
  dim,
  onSelect,
}: {
  task: CompanyTask;
  x: number;
  y: number;
  run: LiveRun | undefined;
  selected: boolean;
  dim: boolean;
  onSelect: () => void;
}) {
  const state = !run
    ? "idle"
    : run.status === "awaiting_approval"
      ? "approval"
      : isActiveRun(run)
        ? "working"
        : run.status === "failed"
          ? "failed"
          : "done";
  return (
    <g
      transform={`translate(${x} ${y})`}
      className={`fp-workflow ${state} ${selected ? "selected" : ""}`}
      opacity={dim ? 0.24 : 1}
      role="button"
      tabIndex={0}
      aria-label={`Workflow ${task.title}`}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <title>{task.title}</title>
      <rect width="160" height="32" rx="7" className="fp-workflow-card" />
      <g className="fp-workflow-icon">
        <circle cx="11" cy="10" r="2" />
        <circle cx="11" cy="22" r="2" />
        <circle cx="19" cy="12" r="2" />
        <path d="M11 12v8M19 14c0 4-8 3-8 6" />
      </g>
      <text x="26" y="20" className="fp-workflow-title">
        {task.title.length > 21 ? `${task.title.slice(0, 20)}…` : task.title}
      </text>
      <circle cx="148" cy="16" r="4" className="fp-workflow-dot" />
    </g>
  );
}

function Workstation({
  agent,
  x,
  y,
  color,
  state,
  selected,
  dim,
  onSelect,
}: {
  agent: CompanyAgent;
  x: number;
  y: number;
  color: string;
  state: AgentMapState;
  selected: boolean;
  dim: boolean;
  onSelect: () => void;
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      className={`fp-workstation ${state} ${selected ? "selected" : ""}`}
      opacity={dim ? 0.24 : 1}
      role="button"
      tabIndex={0}
      aria-label={`${agent.name}, ${stateLabel[state]}`}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <title>
        {agent.name} · {stateLabel[state]}
      </title>
      <rect
        className="fp-workstation-hit"
        x="-65"
        y="-19"
        width="142"
        height="100"
        rx="10"
        fill="transparent"
      />
      <rect
        x="-49"
        y="-8"
        width="106"
        height="39"
        rx="5"
        fill="var(--fp-desk)"
        stroke="var(--fp-desk-edge)"
        filter="url(#fp-furniture-shadow)"
      />
      <rect x="-18" y="-3" width="38" height="8" rx="2" fill="var(--fp-monitor)" />
      <rect
        x="-15"
        y="-2"
        width="32"
        height="3"
        rx="1"
        className="fp-screen"
        fill={
          state === "working"
            ? "#7fb5a0"
            : state === "approval"
              ? "#d9a07b"
              : "var(--fp-screen-off)"
        }
      />
      <path d="M1 5V11M-5 11H7" stroke="var(--fp-monitor)" strokeWidth="2" />
      <rect x="-13" y="15" width="27" height="8" rx="2" fill="var(--fp-keyboard)" />
      <path d="M-9 18H10M-9 21H10" stroke="var(--fp-desk-edge)" strokeWidth=".8" />
      <rect x="23" y="17" width="4" height="7" rx="2" fill="var(--fp-keyboard)" />
      <rect
        x="-40"
        y="3"
        width="13"
        height="17"
        rx="1"
        fill="var(--fp-paper)"
        transform="rotate(-8 -35 10)"
      />
      <path d="M-37 7h7M-37 10h6" stroke="var(--fp-desk-edge)" strokeWidth="1" />
      <circle cx="43" cy="6" r="5" fill="var(--fp-paper)" stroke="var(--fp-desk-edge)" />
      <circle cx="43" cy="6" r="2.8" fill="#967359" />
      <g transform={state === "idle" ? "translate(16 6) rotate(-14 1 40)" : "translate(0 0)"}>
        <rect
          x="-14"
          y="31"
          width="30"
          height="28"
          rx="10"
          fill="var(--fp-chair)"
          stroke="var(--fp-chair-edge)"
        />
        <path
          d="M-16 39V50M18 39V50"
          stroke="var(--fp-chair-edge)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <ellipse cx="1" cy="39" rx="12" ry="9" fill={color} />
        <path
          className="fp-arm"
          d="M-9 37L-13 29M11 37L15 29"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="1" cy="38" r="7.7" fill="#dcc2a4" />
        <path d="M-6 39a7.5 7.5 0 1 1 14 0Q2 32-6 39" fill="#62564a" />
      </g>
      <circle className="fp-status-ring" cx="53" cy="-7" r="7" fill="var(--fp-room-floor)" />
      <circle
        cx="53"
        cy="-7"
        r="4"
        fill={
          state === "working"
            ? "#4b9b72"
            : state === "approval"
              ? "#d07a55"
              : state === "idle"
                ? "#c49d5d"
                : "#8d9790"
        }
      />
      <text x="4" y="72" textAnchor="middle" className="fp-person-name">
        {agent.name.length > 24 ? `${agent.name.slice(0, 23)}…` : agent.name}
      </text>
      <text x="4" y="86" textAnchor="middle" className={`fp-person-status ${state}`}>
        {state === "working"
          ? "● WORKING"
          : state === "approval"
            ? "◆ NEEDS APPROVAL"
            : state === "idle"
              ? "◌ IDLE"
              : "○ NOT CONNECTED"}
      </text>
    </g>
  );
}
function Plant({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle r="12" fill="var(--fp-pot)" stroke="var(--fp-desk-edge)" />
      <ellipse cx="-5" cy="-3" rx="10" ry="5" transform="rotate(32)" fill="#6f8c63" />
      <ellipse cx="3" cy="-5" rx="5" ry="10" transform="rotate(24)" fill="#8ba778" />
      <ellipse cx="5" cy="4" rx="9" ry="5" transform="rotate(-30)" fill="#5f8057" />
      <circle r="4" fill="#9db88a" />
    </g>
  );
}
function Cabinet({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <rect width="69" height="14" rx="2" fill="var(--fp-desk)" stroke="var(--fp-desk-edge)" />
      <path d="M23 0V14M46 0V14M8 11h8M31 11h8M54 11h8" stroke="var(--fp-desk-edge)" />
    </g>
  );
}
