import { useResizableWidth } from "../../shared/useResizableWidth";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
export type MapFocus = { kind: "agent" | "workflow" | "office"; id: string; key: number };

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.6;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

type Props = {
  company: Company;
  focus?: MapFocus | null | undefined;
  addOffice: () => void;
  editOffice: (office: Office) => void;
  deleteOffice: (office: Office) => void;
  addAgent: (officeId: string) => void;
  addWorkflow: (office: Office | null) => void;
  editAgent: (officeId: string, agent: CompanyAgent) => void;
  inspectAgent: (officeId: string, agent: CompanyAgent) => void;
  openWorkflow: (task: CompanyTask) => void;
  runWorkflow: (task: CompanyTask) => Promise<void>;
  assignWork: (agent: CompanyAgent, text: string) => Promise<void>;
  openSettings: () => void;
  /** Status summary shown in the map's bar (the Today strip). */
  toolbar?: ReactNode;
};

export function CompanyFloorplan({
  company,
  focus,
  addOffice,
  editOffice,
  deleteOffice,
  addAgent,
  addWorkflow,
  editAgent,
  inspectAgent,
  openWorkflow,
  runWorkflow,
  assignWork,
  openSettings,
  toolbar,
}: Props) {
  const live = useLiveRuntime();
  const panel = useResizableWidth("agentos:map-panel-width", 420);
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
    if (focus.kind === "office") {
      const room = layout.rooms.find((r) => r.office.id === focus.id);
      if (room) fitBox(room);
      return;
    }
    setSelection({ kind: focus.kind, id: focus.id });
    reveal(focus.kind, focus.id);
  }, [focus?.key]);

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
        <MeetingTable
          seats={
            task.canvas?.nodes.filter((n) =>
              ["agent", "office", "domain", "prompt"].includes(n.kind),
            ).length || taskParticipants(company, task.assignment).length
          }
        />
        <span className="map-table-icon" aria-hidden="true">
          {task.schedule?.kind === "cron" ? <Clock3 size={12} /> : <Play size={11} />}
        </span>
        <span className="map-table-title">
          <span>{task.title}</span>
        </span>
        <span className="map-table-meta">
          {(() => {
            const run = taskRuns(task)[0];
            const current =
              run && isActiveRun(run) && run.results.find((r) => r.status === "running");
            if (current)
              return `${run.status === "awaiting_approval" ? "Needs you" : "Running"} · ${current.label}`;
            return `${triggerLabel(task)}${run ? ` · ${mapRunLabel(run)}` : ""}`;
          })()}
        </span>
      </button>
    );
  };
  const panelOpen = !!(selectedAgent || selectedTask);

  return (
    <section className="map" aria-label="Company floor plan" onKeyDown={onKeyDown}>
      <div className="map-bar">
        <div className="map-toolbar">{toolbar}</div>
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
                            <button
                              role="menuitem"
                              className="map-menu-danger"
                              onClick={() => deleteOffice(office)}
                            >
                              Delete office
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
        <aside
          className="map-panel"
          aria-label="Details"
          hidden={!panelOpen}
          style={{ width: panel.width }}
        >
          <div
            className="co-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            tabIndex={0}
            onPointerDown={panel.startResize}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") panel.nudge(24);
              if (event.key === "ArrowRight") panel.nudge(-24);
            }}
          />
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

const skins = ["#f2d4b8", "#e0b48c", "#c48a5e", "#8f5b3a", "#6a4128"];
const hairs = ["#2b2420", "#4a3324", "#7a5230", "#b89262", "#8c8c8c", "#1c1c20"];
/** A stable look per agent so each person on the floor is recognisable. */
function personLook(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { skin: skins[hash % skins.length]!, hair: hairs[(hash >> 3) % hairs.length]! };
}

/** An office chair from above. */
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
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <rect className="fp-chair" x="-11" y="-10" width="22" height="20" rx="7" />
      <rect className="fp-chair-back" x="-12" y="6" width="24" height="6" rx="3" />
    </g>
  );
}

/** A person seated at a desk, seen from above, facing the desk. */
function Person({ x, y, look }: { x: number; y: number; look: { skin: string; hair: string } }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path className="fp-arm" d="M-11 -2 C-13 -10 -9 -17 -5 -20" />
      <path className="fp-arm" d="M11 -2 C13 -10 9 -17 5 -20" />
      <circle cx="-5" cy="-20.5" r="2.4" style={{ fill: look.skin }} />
      <circle cx="5" cy="-20.5" r="2.4" style={{ fill: look.skin }} />
      <ellipse className="fp-shoulders" cx="0" cy="0" rx="15" ry="8.5" />
      <circle cx="0" cy="-3" r="7.4" style={{ fill: look.skin }} />
      <path
        d="M-7.4 -2.2 A7.4 7.4 0 1 1 7.4 -2.2 C5 0.6 -5 0.6 -7.4 -2.2 Z"
        style={{ fill: look.hair }}
      />
    </g>
  );
}

/** A workstation in plan view: desk, monitor, keyboard, chair, and the agent at work. */
function DeskArt({ look }: { look: { skin: string; hair: string } }) {
  return (
    <svg className="map-desk-art" viewBox="0 0 124 80" aria-hidden="true">
      <ellipse className="fp-status" cx="62" cy="50" rx="27" ry="20" />
      <rect className="fp-desk" x="18" y="4" width="88" height="28" rx="2.5" />
      <rect className="fp-monitor" x="44" y="7" width="36" height="4.5" rx="1.5" />
      <rect className="fp-screen" x="46" y="8" width="32" height="2.5" rx="1" />
      <rect className="fp-keyboard" x="50" y="18" width="24" height="7" rx="1.5" />
      <rect
        className="fp-paper"
        x="24"
        y="10"
        width="13"
        height="16"
        rx="1"
        transform="rotate(-8 30 18)"
      />
      <circle className="fp-cup" cx="96" cy="14" r="3.6" />
      <Chair x={62} y={56} />
      <Person x={62} y={50} look={look} />
    </svg>
  );
}

/** A workflow as a meeting table with one chair per agent on its team. */
function MeetingTable({ seats }: { seats: number }) {
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
      <circle className="fp-table" cx="65" cy="37" r="21" />
      <circle className="map-table-ring" cx="65" cy="37" r="24" />
    </svg>
  );
}

type Line = { key: string; live: boolean; d: string };

/** Architectural plan under the interactive layer: exterior walls, corridor, rooms, doors, windows. */
function FloorPlan({ layout, lines }: { layout: MapLayout; lines: Line[] }) {
  const { building, hallway } = layout;
  return (
    <svg className="map-plan" width={MAP.width} height={layout.height} aria-hidden="true">
      <defs>
        <pattern id="fp-tile" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0V24H0" className="fp-tile-line" />
        </pattern>
      </defs>
      <rect
        className="fp-building"
        x={building.x}
        y={building.y}
        width={building.width}
        height={building.height}
      />
      <rect
        className="fp-corridor"
        x={hallway.x}
        y={building.y}
        width={hallway.width}
        height={building.height}
      />
      {layout.rooms.map((room) => {
        const x0 = room.x;
        const x1 = room.x + room.width;
        const y0 = room.y;
        const y1 = room.y + room.height;
        const left = room.column === 0;
        const doorTop = y1 - 56;
        const doorBottom = y1 - 22;
        const doorX = left ? x1 : x0;
        // Interior walls with a doorway onto the corridor.
        const walls = left
          ? `M${x1} ${doorTop}V${y0}H${x0}V${y1}H${x1}V${doorBottom}`
          : `M${x0} ${doorTop}V${y0}H${x1}V${y1}H${x0}V${doorBottom}`;
        const leaf = doorBottom - doorTop;
        const swing = left
          ? `M${doorX} ${doorTop}h-${leaf}A${leaf} ${leaf} 0 0 0 ${doorX} ${doorBottom}`
          : `M${doorX} ${doorTop}h${leaf}A${leaf} ${leaf} 0 0 1 ${doorX} ${doorBottom}`;
        const outerX = left ? building.x : building.x + building.width;
        return (
          <g key={room.office.id} className="plan-room" data-tone={room.office.color}>
            <rect x={x0} y={y0} width={room.width} height={room.height} className="fp-room" />
            <rect x={x0} y={y0} width={room.width} height={room.height} fill="url(#fp-tile)" />
            <path className="fp-wall" d={walls} />
            <path className="fp-door" d={swing} />
            <rect
              className="fp-window"
              x={outerX - 2.5}
              y={y0 + 40}
              width="5"
              height={Math.max(24, room.height - 120)}
            />
            <rect className="fp-accent" x={x0 + 6} y={y0 + 6} width="4" height="22" rx="2" />
          </g>
        );
      })}
      <rect
        className="plan-vacant"
        x={layout.addOffice.x}
        y={layout.addOffice.y}
        width={layout.addOffice.width}
        height={layout.addOffice.height}
        rx="4"
      />
      <rect
        className="fp-outer"
        x={building.x}
        y={building.y}
        width={building.width}
        height={building.height}
      />
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
