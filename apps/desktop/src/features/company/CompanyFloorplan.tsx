import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Clock3, Maximize2, Minus, Play, Plus, Settings2 } from "lucide-react";
import {
  taskParticipants,
  type Company,
  type CompanyAgent,
  type CompanyTask,
  type Office,
} from "./company-model";
import {
  agentMapRuns,
  agentMapState,
  agentRecentOutcome,
  agentStateLabels,
  engineReady,
  workflowOfficeId,
  type AgentMapState,
} from "./company-map-state";
import { MAP, mapLayout, type Box, type MapLayout, type Placed } from "./company-map-layout";
import { AgentPanel, WorkflowPanel, runState } from "./MapPanels";
import { engineId, isActiveRun, useLiveRuntime } from "../engines/live-runtime";
import { engineNames } from "../engines/engine-inventory";
import { runLabel } from "../engines/run-presentation";
import "./company-floorplan.css";

type Selection = { kind: "agent" | "workflow"; id: string } | null;
export type MapFocus = { kind: "agent" | "workflow"; id: string; key: number };

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.6;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

type Props = {
  company: Company;
  focus?: MapFocus | null | undefined;
  addOffice: () => void;
  editOffice: (office: Office) => void;
  addAgent: (officeId: string) => void;
  addWorkflow: (office: Office | null) => void;
  editAgent: (officeId: string, agent: CompanyAgent) => void;
  inspectAgent: (officeId: string, agent: CompanyAgent) => void;
  openWorkflow: (task: CompanyTask) => void;
  runWorkflow: (task: CompanyTask) => Promise<void>;
  assignWork: (agent: CompanyAgent, text: string) => Promise<void>;
  openSettings: () => void;
};

export function CompanyFloorplan({
  company,
  focus,
  addOffice,
  editOffice,
  addAgent,
  addWorkflow,
  editAgent,
  inspectAgent,
  openWorkflow,
  runWorkflow,
  assignWork,
  openSettings,
}: Props) {
  const live = useLiveRuntime();
  const [selection, setSelection] = useState<Selection>(null);
  const [highlight, setHighlight] = useState<AgentMapState | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const viewport = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ worldX: number; worldY: number; x: number; y: number } | null>(null);
  const fitted = useRef(false);

  const tasks = company.tasks || [];
  const agents = company.offices.flatMap((office) =>
    office.agents.map((agent) => ({ agent, office })),
  );
  const state = (agent: CompanyAgent) =>
    agentMapState(live.runs, agent.id, engineReady(live, agent.engine));
  const outcome = (agent: CompanyAgent) => agentRecentOutcome(live.runs, agent.id, now);
  const taskRuns = (task: CompanyTask) =>
    live.runs
      .filter((r) => r.request.key === `task:${task.id}`)
      .sort((a, b) => b.createdAt - a.createdAt);
  const flowsFor = (office: Office) =>
    tasks.filter((t) => workflowOfficeId(company, t) === office.id);
  const layout = mapLayout(company, flowsFor);
  const counts = agents.reduce<Record<AgentMapState, number>>(
    (all, { agent }) => ({ ...all, [state(agent)]: all[state(agent)] + 1 }),
    { approval: 0, working: 0, ready: 0, offline: 0 },
  );
  const selectedAgent =
    selection?.kind === "agent" ? agents.find((a) => a.agent.id === selection.id) : undefined;
  const selectedTask =
    selection?.kind === "workflow" ? tasks.find((t) => t.id === selection.id) : undefined;
  const team = selectedTask
    ? new Set(taskParticipants(company, selectedTask.assignment).map((a) => a.id))
    : null;
  const missingEngines =
    live.native && live.engines.length
      ? [
          ...new Set(
            agents
              .filter(({ agent }) => !engineReady(live, agent.engine))
              .map(({ agent }) => agent.engine),
          ),
        ]
      : [];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (selection && !selectedAgent && !selectedTask) setSelection(null);
  }, [selection, selectedAgent, selectedTask]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.(".map-room-menu")) setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  // Fit the floor to the available width once, then keep whatever zoom the person chooses.
  useLayoutEffect(() => {
    if (fitted.current || !viewport.current) return;
    fitted.current = true;
    setZoom(clampZoom(Math.min(1, (viewport.current.clientWidth - 24) / MAP.width)));
  }, []);
  // Keep the point under the cursor (or the view centre) still while zooming.
  useLayoutEffect(() => {
    const view = viewport.current;
    const point = anchor.current;
    if (!view || !point) return;
    view.scrollLeft = point.worldX * zoom - point.x;
    view.scrollTop = point.worldY * zoom - point.y;
    anchor.current = null;
  }, [zoom]);
  function zoomAt(next: number) {
    const view = viewport.current;
    if (view) {
      const x = view.clientWidth / 2;
      const y = view.clientHeight / 2;
      anchor.current = {
        worldX: (view.scrollLeft + x) / zoom,
        worldY: (view.scrollTop + y) / zoom,
        x,
        y,
      };
    }
    setZoom(clampZoom(next));
  }
  useEffect(() => {
    const view = viewport.current;
    if (!view) return;
    // Trackpad pinch arrives as ctrl+wheel; plain scrolling pans the floor natively.
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) => {
        const rect = view.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        anchor.current = {
          worldX: (view.scrollLeft + x) / current,
          worldY: (view.scrollTop + y) / current,
          x,
          y,
        };
        return clampZoom(current * Math.exp(-event.deltaY * 0.01));
      });
    };
    view.addEventListener("wheel", wheel, { passive: false });
    return () => view.removeEventListener("wheel", wheel);
  }, []);
  function fitBox(box: Box, max = MAX_ZOOM) {
    const view = viewport.current;
    if (!view) return;
    const next = clampZoom(
      Math.min(max, (view.clientWidth - 48) / box.width, (view.clientHeight - 48) / box.height),
    );
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (next === zoom) {
      view.scrollTo({
        left: x * zoom - view.clientWidth / 2,
        top: y * zoom - view.clientHeight / 2,
        behavior: "smooth",
      });
      return;
    }
    anchor.current = { worldX: x, worldY: y, x: view.clientWidth / 2, y: view.clientHeight / 2 };
    setZoom(next);
  }
  function reveal(kind: "agent" | "workflow", id: string) {
    requestAnimationFrame(() =>
      viewport.current
        ?.querySelector<HTMLElement>(`[data-${kind}="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }),
    );
  }
  useEffect(() => {
    if (!focus) return;
    setSelection({ kind: focus.kind, id: focus.id });
    reveal(focus.kind, focus.id);
  }, [focus?.key]);

  function chip(stateName: AgentMapState) {
    if (highlight === stateName) return setHighlight(null);
    setHighlight(stateName);
    const first = agents.find(({ agent }) => state(agent) === stateName);
    if (!first) return;
    if (stateName === "approval") setSelection({ kind: "agent", id: first.agent.id });
    reveal("agent", first.agent.id);
  }
  // Arrow keys move between desks by position; Enter opens the focused desk; Esc closes.
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      if (menu) setMenu(null);
      else if (selection) setSelection(null);
      else setHighlight(null);
      return;
    }
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = dirs[event.key];
    const target = event.target as HTMLElement;
    if (!dir || target.closest("textarea, input, select, .map-panel")) return;
    const desks = layout.rooms.flatMap((room) =>
      room.desks.map((d) => ({
        id: d.id,
        x: room.x + d.x + d.width / 2,
        y: room.y + d.y + d.height / 2,
      })),
    );
    if (!desks.length) return;
    event.preventDefault();
    const from = desks.find((d) => d.id === target.dataset.agent);
    const score = (d: (typeof desks)[number]) =>
      Math.hypot(d.x - from!.x, d.y - from!.y) +
      Math.abs((d.x - from!.x) * dir[1] + (d.y - from!.y) * dir[0]) * 2;
    const next = !from
      ? desks[0]
      : desks
          .filter((d) => (d.x - from.x) * dir[0] + (d.y - from.y) * dir[1] > 1)
          .sort((a, b) => score(a) - score(b))[0];
    const element =
      next && viewport.current?.querySelector<HTMLElement>(`[data-agent="${CSS.escape(next.id)}"]`);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  const deskTop = (agentId: string) => {
    for (const room of layout.rooms) {
      const desk = room.desks.find((d) => d.id === agentId);
      if (desk) return { x: room.x + desk.x + desk.width / 2, y: room.y + desk.y + 4 };
    }
    return null;
  };
  const flowBottom = (taskId: string) => {
    for (const room of layout.rooms) {
      const flow = room.flows.find((f) => f.id === taskId);
      // Start at the tabletop's lower edge, not below the label.
      if (flow) return { x: room.x + flow.x + flow.width / 2, y: room.y + flow.y + 60 };
    }
    return null;
  };
  // Lines show who a workflow is using: the working agent while it runs, its team when selected.
  const lines = tasks.flatMap((task) => {
    const run = taskRuns(task)[0];
    const from = flowBottom(task.id);
    if (!from) return [];
    const working = run && isActiveRun(run) && run.currentAgentId ? [run.currentAgentId] : [];
    const ids = selectedTask?.id === task.id ? [...(team || [])] : working;
    return ids.flatMap((id) => {
      const to = deskTop(id);
      if (!to) return [];
      const midY = (from.y + to.y) / 2;
      return [
        {
          key: `${task.id}:${id}`,
          live: working.includes(id),
          d: `M${from.x},${from.y} C${from.x},${midY} ${to.x},${midY} ${to.x},${to.y}`,
        },
      ];
    });
  });

  const flowCard = (task: CompanyTask, placed: Placed) => {
    const flowState = runState(taskRuns(task)[0]);
    const dim =
      (!!team && selectedTask?.id !== task.id) ||
      (!!selectedAgent &&
        !taskParticipants(company, task.assignment).some((a) => a.id === selectedAgent.agent.id));
    return (
      <button
        key={task.id}
        className="map-table"
        data-workflow={task.id}
        data-state={flowState}
        data-dim={dim || undefined}
        aria-pressed={selectedTask?.id === task.id}
        aria-label={`Workflow ${task.title}, ${mapRunLabel(taskRuns(task)[0])}`}
        title={`${task.title}\n${triggerLabel(task)} · ${mapRunLabel(taskRuns(task)[0])}\nDouble-click to open`}
        style={{ left: placed.x, top: placed.y, width: placed.width, height: placed.height }}
        onClick={() => setSelection({ kind: "workflow", id: task.id })}
        onDoubleClick={() => openWorkflow(task)}
      >
        <MeetingTable seats={taskParticipants(company, task.assignment).length} />
        <span className="map-table-icon" aria-hidden="true">
          {task.schedule?.kind === "cron" ? <Clock3 size={12} /> : <Play size={11} />}
        </span>
        <span className="map-table-title">
          <span>{task.title}</span>
        </span>
        <span className="map-table-meta">
          {triggerLabel(task)}
          {taskRuns(task)[0] ? ` · ${mapRunLabel(taskRuns(task)[0])}` : ""}
        </span>
      </button>
    );
  };
  const panelOpen = !!(selectedAgent || selectedTask);

  return (
    <section className="map" aria-label="Company floor plan" onKeyDown={onKeyDown}>
      <div className="map-bar">
        <div className="map-chips" role="group" aria-label="Team status">
          {(["working", "approval", "ready", "offline"] as const).map((stateName) => (
            <button
              key={stateName}
              className="map-chip"
              data-state={stateName}
              aria-pressed={highlight === stateName}
              disabled={!counts[stateName]}
              onClick={() => chip(stateName)}
            >
              <i aria-hidden="true" />
              <strong>{counts[stateName]}</strong> {agentStateLabels[stateName].toLowerCase()}
            </button>
          ))}
        </div>
        <div className="map-zoom" role="group" aria-label="Zoom">
          <button
            className="co-icon-button"
            aria-label="Zoom out"
            onClick={() => zoomAt(zoom - 0.1)}
            disabled={zoom <= MIN_ZOOM}
          >
            <Minus size={14} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            className="co-icon-button"
            aria-label="Zoom in"
            onClick={() => zoomAt(zoom + 0.1)}
            disabled={zoom >= MAX_ZOOM}
          >
            <Plus size={14} />
          </button>
          <button
            className="co-icon-button"
            aria-label="Fit the whole floor"
            title="Fit the whole floor"
            onClick={() => fitBox({ x: 0, y: 0, width: MAP.width, height: layout.height }, 1)}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      {!live.native ? (
        <p className="map-banner">Browser preview · agents can only run in the AgentOS Mac app.</p>
      ) : (
        missingEngines.length > 0 && (
          <p className="map-banner">
            <span>
              {missingEngines
                .map((engine) => {
                  try {
                    return engineNames[engineId(engine)];
                  } catch {
                    return engine;
                  }
                })
                .join(" and ")}{" "}
              {missingEngines.length === 1 ? "isn’t" : "aren’t"} set up, so {counts.offline}{" "}
              {counts.offline === 1 ? "agent is" : "agents are"} offline.
            </span>
            <button className="co-button" onClick={openSettings}>
              <Settings2 size={13} /> Open settings
            </button>
          </p>
        )
      )}
      <div className="map-body" data-panel={panelOpen || undefined}>
        <div className="map-stage" ref={viewport}>
          <div style={{ width: MAP.width * zoom, height: layout.height * zoom }}>
            <div
              className="map-world"
              style={{ width: MAP.width, height: layout.height, transform: `scale(${zoom})` }}
            >
              <FloorPlan layout={layout} lines={lines} />
              {layout.rooms.map((room) => {
                const office = room.office;
                const working = office.agents.filter((a) => state(a) === "working").length;
                const waiting = office.agents.filter((a) => state(a) === "approval").length;
                return (
                  <section
                    key={office.id}
                    className="map-room"
                    data-tone={office.color}
                    style={{ left: room.x, top: room.y, width: room.width, height: room.height }}
                    aria-label={`${office.name} office`}
                  >
                    <header
                      onDoubleClick={() => fitBox(room)}
                      title="Double-click to zoom to this office"
                    >
                      <div>
                        <span className="map-room-label">
                          Office {String(room.number).padStart(2, "0")}
                        </span>
                        <strong>{office.name}</strong>
                        <small>
                          {[
                            plural(office.agents.length, "agent"),
                            room.flows.length ? plural(room.flows.length, "workflow") : "",
                            working ? `${working} working` : "",
                            waiting ? `${waiting} need${waiting === 1 ? "s" : ""} you` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </div>
                      <div className="map-room-menu">
                        <button
                          className="co-icon-button"
                          aria-label={`Add to ${office.name}`}
                          aria-haspopup="menu"
                          aria-expanded={menu === office.id}
                          onClick={() => setMenu(menu === office.id ? null : office.id)}
                        >
                          <Plus size={15} />
                        </button>
                        {menu === office.id && (
                          <div role="menu" onClick={() => setMenu(null)}>
                            <button role="menuitem" onClick={() => addAgent(office.id)}>
                              Add agent
                            </button>
                            <button role="menuitem" onClick={() => addWorkflow(office)}>
                              New workflow
                            </button>
                            <button role="menuitem" onClick={() => editOffice(office)}>
                              Edit office
                            </button>
                          </div>
                        )}
                      </div>
                    </header>
                    {room.flows.map((placed) =>
                      flowCard(tasks.find((t) => t.id === placed.id)!, placed),
                    )}
                    {room.desks.map((placed) => {
                      const agent = office.agents.find((a) => a.id === placed.id)!;
                      const agentState = state(agent);
                      const dim =
                        (!!highlight && agentState !== highlight) ||
                        (!!team && !team.has(agent.id));
                      return (
                        <button
                          key={agent.id}
                          className="map-desk"
                          data-agent={agent.id}
                          data-state={agentState}
                          data-dim={dim || undefined}
                          aria-pressed={selectedAgent?.agent.id === agent.id}
                          aria-label={`${agent.name}, ${agent.role}, ${agentStateLabels[agentState]}`}
                          title={`${agent.name}\n${agent.role} · ${agent.engine}\n${agentStateLabels[agentState]}`}
                          style={{
                            left: placed.x,
                            top: placed.y,
                            width: placed.width,
                            height: placed.height,
                          }}
                          onClick={() => setSelection({ kind: "agent", id: agent.id })}
                        >
                          <DeskArt look={personLook(agent.id)} />
                          <strong>
                            <span>{agent.name}</span>
                          </strong>
                          <small>{agent.role}</small>
                          <span className="map-status" data-state={agentState}>
                            {agentStateLabels[agentState]}
                            {outcome(agent) &&
                              agentState !== "working" &&
                              agentState !== "approval" && (
                                <em data-state={outcome(agent)}>
                                  {outcome(agent) === "failed" ? "Failed" : "Done just now"}
                                </em>
                              )}
                          </span>
                        </button>
                      );
                    })}
                    {room.empty && (
                      <button
                        className="map-empty"
                        style={{
                          left: room.empty.x,
                          top: room.empty.y,
                          width: room.empty.width,
                          height: room.empty.height,
                        }}
                        onClick={() => addAgent(office.id)}
                      >
                        <Plus size={16} />
                        <strong>Add your first agent</strong>
                        <small>Agents sit here and pick up this office’s work.</small>
                      </button>
                    )}
                  </section>
                );
              })}
              <button
                className="map-add-office"
                style={{
                  left: layout.addOffice.x,
                  top: layout.addOffice.y,
                  width: layout.addOffice.width,
                  height: layout.addOffice.height,
                }}
                onClick={addOffice}
              >
                <Plus size={18} />
                <strong>
                  {company.offices.length ? "Add an office" : "Create your first office"}
                </strong>
                <small>
                  {company.offices.length
                    ? "Vacant space for another team"
                    : "Offices hold a team’s agents and the workflows they run"}
                </small>
              </button>
            </div>
          </div>
        </div>
        <aside className="map-panel" aria-label="Details" hidden={!panelOpen}>
          {selectedAgent ? (
            <AgentPanel
              key={selectedAgent.agent.id}
              agent={selectedAgent.agent}
              office={selectedAgent.office}
              state={state(selectedAgent.agent)}
              outcome={outcome(selectedAgent.agent)}
              runs={agentMapRuns(live.runs, selectedAgent.agent.id)}
              workflows={tasks.filter((t) =>
                taskParticipants(company, t.assignment).some(
                  (a) => a.id === selectedAgent.agent.id,
                ),
              )}
              close={() => setSelection(null)}
              assignWork={(text) => assignWork(selectedAgent.agent, text)}
              openWorkflow={openWorkflow}
              history={() => inspectAgent(selectedAgent.office.id, selectedAgent.agent)}
              configure={() => editAgent(selectedAgent.office.id, selectedAgent.agent)}
              editOffice={() => editOffice(selectedAgent.office)}
              native={live.native}
            />
          ) : selectedTask ? (
            <WorkflowPanel
              key={selectedTask.id}
              company={company}
              task={selectedTask}
              runs={taskRuns(selectedTask)}
              close={() => setSelection(null)}
              runNow={() => runWorkflow(selectedTask)}
              open={() => openWorkflow(selectedTask)}
              selectAgent={(id) => {
                setSelection({ kind: "agent", id });
                reveal("agent", id);
              }}
            />
          ) : null}
        </aside>
      </div>
    </section>
  );
}

const skins = ["#f1d3b3", "#e2b98f", "#c58c62", "#9a6440", "#6f4630"];
const hairs = ["#2f2622", "#5a3b28", "#8b5a2b", "#c9a36b", "#9b9b9b", "#1f1f24"];
/** A stable, varied look per agent so the floor feels like a real team. */
function personLook(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { skin: skins[hash % skins.length]!, hair: hairs[(hash >> 3) % hairs.length]! };
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** A short, human trigger label for common schedules; anything unusual reads "Scheduled". */
export function triggerLabel(task: CompanyTask): string {
  if (task.schedule?.kind !== "cron") return "Manual";
  const [minute, hour, day, month, weekday] = task.schedule.expression.trim().split(/\s+/);
  const time =
    /^\d+$/.test(minute || "") && /^\d+$/.test(hour || "")
      ? `${hour}:${minute!.padStart(2, "0")}`
      : "";
  if (minute === "0" && hour === "*" && day === "*" && month === "*" && weekday === "*")
    return "Hourly";
  if (time && day === "*" && month === "*") {
    if (weekday === "*") return `Daily ${time}`;
    if (weekday === "1-5") return `Weekdays ${time}`;
    if (/^[0-7]$/.test(weekday || "")) return `${weekdays[Number(weekday) % 7]}s ${time}`;
  }
  return "Scheduled";
}

/** An office chair seen from above: five-star base, seat, and backrest. */
function Chair({
  x,
  y,
  rotate = 0,
  scale = 1,
}: {
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`} className="rl-chair">
      {[0, 72, 144, 216, 288].map((angle) => (
        <g key={angle} transform={`rotate(${angle})`}>
          <rect x="-1.2" y="0" width="2.4" height="13" rx="1.2" className="rl-chair-leg" />
          <circle cx="0" cy="13" r="1.9" className="rl-chair-wheel" />
        </g>
      ))}
      <rect
        x="-12"
        y="-11"
        width="24"
        height="21"
        rx="8"
        className="rl-chair-seat"
        filter="url(#rl-soft)"
      />
      <path d="M-13 4 Q0 14 13 4 L13 8 Q0 19 -13 8 Z" className="rl-chair-back" />
    </g>
  );
}

/** Top-down workstation with a seated person working at it. */
function DeskArt({ look }: { look: { skin: string; hair: string } }) {
  return (
    <svg className="map-desk-art" viewBox="0 0 124 80" aria-hidden="true">
      <ellipse className="map-halo" cx="62" cy="58" rx="34" ry="16" />
      <g filter="url(#rl-shadow)">
        <rect x="8" y="2" width="108" height="32" rx="3" fill="url(#rl-wood)" className="rl-desk" />
      </g>
      <rect x="8" y="2" width="108" height="32" rx="3" fill="url(#rl-grain)" opacity="0.5" />
      <ellipse className="map-spill" cx="62" cy="16" rx="26" ry="9" />
      <g transform="rotate(-6 26 17)">
        <rect x="16" y="7" width="17" height="21" rx="1.2" className="rl-notebook" />
        <path d="M19 12h11M19 15h11M19 18h9M19 21h10" className="rl-notebook-lines" />
      </g>
      <rect x="57" y="8" width="10" height="3" rx="1" className="rl-stand" />
      <rect
        x="40"
        y="4"
        width="44"
        height="6.5"
        rx="2"
        fill="url(#rl-monitor)"
        filter="url(#rl-soft)"
      />
      <rect className="map-screen" x="42" y="5.2" width="40" height="3.2" rx="1.2" />
      <rect x="48" y="17" width="28" height="9" rx="1.6" className="rl-keyboard" />
      <path d="M50.5 19.6h23M50.5 22h23M52 24.4h20" className="rl-keys" />
      <ellipse cx="82" cy="22" rx="2.8" ry="3.8" className="rl-mouse" />
      <circle cx="100" cy="12" r="5" className="rl-mug" />
      <circle cx="100" cy="12" r="3.3" className="rl-coffee" />
      <path d="M104.6 10.5q3 1.5 0 3" className="rl-mug-handle" />
      <circle cx="108" cy="27" r="3.4" className="rl-pot" />
      <circle cx="106.6" cy="25.8" r="2.6" className="rl-leaf" />
      <circle cx="109.6" cy="26.4" r="2.2" className="rl-leaf rl-leaf-2" />
      <circle cx="108" cy="28.8" r="2.2" className="rl-leaf" />
      <Chair x={62} y={52} />
      <path d="M46 49 C43 41 47 32 54 27" className="map-arm" />
      <path d="M78 49 C81 41 77 32 70 27" className="map-arm" />
      <path d="M46 49 C43 41 47 32 54 27" className="rl-arm-shade" />
      <path d="M78 49 C81 41 77 32 70 27" className="rl-arm-shade" />
      <ellipse cx="54.5" cy="26.2" rx="2.8" ry="2.4" style={{ fill: look.skin }} />
      <ellipse cx="69.5" cy="26.2" rx="2.8" ry="2.4" style={{ fill: look.skin }} />
      <path
        className="map-shirt"
        d="M42 53 C42 43 51 40 62 40 C73 40 82 43 82 53 C82 58 73 60 62 60 C51 60 42 58 42 53 Z"
      />
      <path
        d="M42 53 C42 43 51 40 62 40 C73 40 82 43 82 53 C82 58 73 60 62 60 C51 60 42 58 42 53 Z"
        fill="url(#rl-cloth)"
      />
      <ellipse cx="53.3" cy="45.5" rx="1.6" ry="2.4" style={{ fill: look.skin }} />
      <ellipse cx="70.7" cy="45.5" rx="1.6" ry="2.4" style={{ fill: look.skin }} />
      <circle cx="62" cy="45" r="8.6" style={{ fill: look.skin }} filter="url(#rl-soft)" />
      <circle cx="62" cy="46.4" r="8.4" style={{ fill: look.hair }} />
      <circle cx="62" cy="46.4" r="8.4" fill="url(#rl-hair-shine)" />
      <circle className="map-badge" cx="75" cy="36" r="3.8" />
    </svg>
  );
}

/** A round meeting table in wood, with one office chair per agent on the workflow's team. */
function MeetingTable({ seats }: { seats: number }) {
  // One chair per team member (a single empty chair when no one is assigned yet).
  const count = Math.min(8, Math.max(1, seats));
  return (
    <svg className="map-table-art" viewBox="0 0 130 74" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * 360 - 90;
        const rad = (angle * Math.PI) / 180;
        return (
          <Chair
            key={i}
            x={65 + Math.cos(rad) * 29}
            y={37 + Math.sin(rad) * 29}
            rotate={angle - 90}
            scale={0.55}
          />
        );
      })}
      <g filter="url(#rl-shadow)">
        <circle cx="65" cy="37" r="21" fill="url(#rl-wood-round)" className="rl-desk" />
      </g>
      <circle cx="65" cy="37" r="21" fill="url(#rl-table-sheen)" />
      <circle className="map-table-ring" cx="65" cy="37" r="22.5" />
    </svg>
  );
}

/** A potted plant seen from above. */
function Plant({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`} filter="url(#rl-shadow)">
      <circle r="11" className="rl-pot" />
      {[0, 60, 120, 180, 240, 300].map((angle, i) => (
        <ellipse
          key={angle}
          rx="4.6"
          ry="9.5"
          transform={`rotate(${angle}) translate(0 -6)`}
          className={i % 2 ? "rl-leaf rl-leaf-2" : "rl-leaf"}
        />
      ))}
      <circle r="3" className="rl-leaf rl-leaf-2" />
    </g>
  );
}

type Line = { key: string; live: boolean; d: string };
const tones = ["sage", "blue", "coral", "lavender", "gold"];

/** The architectural drawing under the interactive layer: building, hallway, rooms, doors, windows. */
function FloorPlan({ layout, lines }: { layout: MapLayout; lines: Line[] }) {
  const { building, hallway } = layout;
  const bottom = building.y + building.height;
  const entrance = { x: hallway.x + hallway.width / 2, width: 58 };
  return (
    <svg className="map-plan" width={MAP.width} height={layout.height} aria-hidden="true">
      <defs>
        <filter id="rl-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow
            dx="0"
            dy="2.2"
            stdDeviation="2.2"
            floodColor="#1c140c"
            floodOpacity="0.22"
          />
        </filter>
        <filter id="rl-soft" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#1c140c" floodOpacity="0.25" />
        </filter>
        <linearGradient id="rl-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="rl-wood-a" />
          <stop offset="1" className="rl-wood-b" />
        </linearGradient>
        <pattern id="rl-grain" width="108" height="6" patternUnits="userSpaceOnUse">
          <path
            d="M0 1.5 C30 0.8 60 2.4 108 1.2 M0 4.4 C40 5.4 70 3.6 108 4.8"
            className="rl-grain"
          />
        </pattern>
        <radialGradient id="rl-wood-round" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" className="rl-wood-a" />
          <stop offset="1" className="rl-wood-b" />
        </radialGradient>
        <radialGradient id="rl-table-sheen" cx="0.35" cy="0.3" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rl-monitor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a4f4c" />
          <stop offset="1" stopColor="#1f2220" />
        </linearGradient>
        <linearGradient id="rl-cloth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
        <radialGradient id="rl-hair-shine" cx="0.4" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </radialGradient>
        {tones.map((tone) => (
          <pattern
            key={tone}
            id={`plan-floor-${tone}`}
            width="180"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <rect width="180" height="48" className={`plan-floor tone-${tone}`} />
            <rect y="12" width="180" height="12" className="plan-plank-shade" />
            <rect x="90" y="36" width="90" height="12" className="plan-plank-shade plank-2" />
            <rect x="0" y="0" width="70" height="12" className="plan-plank-shade plank-2" />
            <path
              d="M0 11.5H180M0 23.5H180M0 35.5H180M0 47.5H180M70.5 0V11.5M140.5 12V23.5M30.5 24V35.5M90.5 36V47.5"
              className="plan-seam"
            />
          </pattern>
        ))}
        <pattern id="plan-hall" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" className="plan-hall" />
          <rect width="20" height="20" className="plan-tile-shade" />
          <rect x="20" y="20" width="20" height="20" className="plan-tile-shade" />
          <path d="M40 0V40H0M20 0V40M0 20H40" className="plan-seam" />
        </pattern>
        <pattern
          id="plan-hatch"
          width="9"
          height="9"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="9" className="plan-hatch" />
        </pattern>
      </defs>
      <rect
        className="plan-building"
        x={building.x}
        y={building.y}
        width={building.width}
        height={building.height}
        rx="10"
      />
      <rect
        className="plan-hallway"
        x={hallway.x}
        y={building.y + 4}
        width={hallway.width}
        height={building.height - 8}
        fill="url(#plan-hall)"
      />
      <path className="plan-hall-line" d={`M${entrance.x} ${building.y + 18}V${bottom - 30}`} />
      {layout.rooms.map((room) => {
        const x0 = room.x;
        const x1 = room.x + room.width;
        const y0 = room.y;
        const y1 = room.y + room.height;
        const d1 = y1 - 50;
        const d2 = y1 - 20;
        const tone = tones.includes(room.office.color) ? room.office.color : "sage";
        const walls =
          room.column === 0
            ? `M${x1} ${d1}V${y0}H${x0}V${y1}H${x1}V${d2}`
            : `M${x0} ${d1}V${y0}H${x1}V${y1}H${x0}V${d2}`;
        const door =
          room.column === 0
            ? `M${x1} ${d1}h-30A30 30 0 0 0 ${x1} ${d1 + 30}`
            : `M${x0} ${d1}h30A30 30 0 0 1 ${x0} ${d1 + 30}`;
        const outerX = room.column === 0 ? building.x : building.x + building.width;
        return (
          <g key={room.office.id}>
            <rect
              x={x0}
              y={y0}
              width={room.width}
              height={room.height}
              fill={`url(#plan-floor-${tone})`}
            />
            <path className="plan-wall" d={walls} />
            <path className="plan-door" d={door} />
            <rect
              className="plan-window"
              x={outerX - 3}
              y={y0 + 34}
              width="6"
              height={Math.max(20, room.height - 110)}
              rx="1"
            />
            <Plant x={room.column === 0 ? x0 + 18 : x1 - 18} y={y1 - 18} size={0.9} />
            {room.y === MAP.margin && (
              <rect
                className="plan-window"
                x={x0 + 60}
                y={building.y - 3}
                width={room.width - 120}
                height="6"
                rx="1"
              />
            )}
          </g>
        );
      })}
      <rect
        className="plan-vacant"
        x={layout.addOffice.x}
        y={layout.addOffice.y}
        width={layout.addOffice.width}
        height={layout.addOffice.height}
        fill="url(#plan-hatch)"
        rx="3"
      />
      <rect
        className="plan-entrance"
        x={entrance.x - entrance.width / 2}
        y={bottom - 6}
        width={entrance.width}
        height="12"
      />
      <path
        className="plan-door"
        d={`M${entrance.x - entrance.width / 2} ${bottom}a${entrance.width / 2} ${entrance.width / 2} 0 0 1 ${entrance.width / 2} -${entrance.width / 2}M${entrance.x + entrance.width / 2} ${bottom}a${entrance.width / 2} ${entrance.width / 2} 0 0 0 -${entrance.width / 2} -${entrance.width / 2}`}
      />
      <Plant x={entrance.x - 48} y={bottom - 22} size={0.8} />
      <Plant x={entrance.x + 48} y={bottom - 22} size={0.8} />
      <text className="plan-label" x={entrance.x} y={bottom - 36} textAnchor="middle">
        ENTRANCE
      </text>
      <g className="map-lines">
        {lines.map((line) => (
          <path key={line.key} d={line.d} data-live={line.live || undefined} />
        ))}
      </g>
    </svg>
  );
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
/** Map wording for a workflow's latest run: never-run workflows read "Not run yet". */
const mapRunLabel = (run: Parameters<typeof runLabel>[0]) => (run ? runLabel(run) : "Not run yet");
