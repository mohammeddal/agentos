import { useEffect, useState, type CSSProperties } from "react";
import type { LiveRun, Mission, RoleId } from "./studio-types";

type WorldProps = {
  selected: RoleId;
  runs: LiveRun[];
  mission: Mission | undefined;
  projectName: string;
  onSelect: (role: RoleId) => void;
};

const systems = [
  { id: "github", name: "GitHub", caption: "Source dock", x: 118, y: 350, color: "#9ca9bb", glyph: "<>" },
  { id: "airflow", name: "Airflow", caption: "Orchestration", x: 305, y: 292, color: "#71a9da", glyph: "AF" },
  { id: "dbt", name: "dbt Core", caption: "Transformation", x: 491, y: 364, color: "#ec8b62", glyph: "dbt" },
  { id: "snowflake", name: "Snowflake", caption: "Data vault", x: 683, y: 286, color: "#79bff1", glyph: "✣" },
  { id: "montecarlo", name: "Monte Carlo", caption: "Observability", x: 873, y: 360, color: "#d6b86b", glyph: "MC" },
  { id: "sigma", name: "Sigma", caption: "Insight gallery", x: 1062, y: 298, color: "#8bc8aa", glyph: "Σ" }
] as const;

const operators = [
  { id: "detective" as const, name: "Investigator", color: "#70b7d1", x: 420, y: 470, action: "Tracing evidence" },
  { id: "builder" as const, name: "Builder", color: "#e6a05c", x: 554, y: 246, action: "Preparing change" },
  { id: "reviewer" as const, name: "Reviewer", color: "#9ab783", x: 782, y: 218, action: "Checking risk" },
  { id: "historian" as const, name: "Historian", color: "#ad91c3", x: 947, y: 472, action: "Recording context" }
];

const flowPath = "M118 350 C190 320 232 306 305 292 S421 330 491 364 S610 315 683 286 S801 320 873 360 S994 328 1062 298";

export function OperationsWorld({ selected, runs, mission, projectName, onSelect }: WorldProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [focusedSystem, setFocusedSystem] = useState<(typeof systems)[number]>(systems[2]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const waiting = runs.filter(run => run.status === "waiting").length;
  const failed = runs.some(run => run.status === "failed");
  const hasWork = runs.length > 0;
  const signal = failed ? "Issue detected" : waiting ? "Decision waiting" : hasWork ? "Work in motion" : "Systems ready";
  const missionTitle = mission?.objective ?? (hasWork ? runs[0]?.displayObjective ?? runs[0]?.objective : "Ready for the next mission");
  const stage = mission?.stage ?? (hasWork ? "implementation" : "discovery");
  const stageIndex = !hasWork && !mission ? 0 : stage === "discovery" ? 1 : stage === "implementation" ? 2 : stage === "verification" ? 3 : 4;

  return <section className="operations-world topology-world" aria-label={`Living data topology for ${projectName}`}>
    <svg className="operations-world-svg" viewBox="0 0 1180 650" role="img" aria-label={`Connected GitHub, Airflow, dbt, Snowflake, Monte Carlo, and Sigma systems for ${projectName}`}>
      <defs>
        <linearGradient id="topology-ground" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#101923"/><stop offset=".56" stopColor="#0c141d"/><stop offset="1" stopColor="#111d26"/></linearGradient>
        <radialGradient id="topology-glow"><stop stopColor="#60b7dd" stopOpacity=".2"/><stop offset="1" stopColor="#60b7dd" stopOpacity="0"/></radialGradient>
        <pattern id="topology-grid" width="44" height="26" patternUnits="userSpaceOnUse"><path d="M0 13 22 0l22 13-22 13Z" fill="none" stroke="#42515d" strokeWidth=".8" opacity=".28"/></pattern>
        <filter id="topology-shadow" x="-40%" y="-40%" width="180%" height="190%"><feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#000" floodOpacity=".42"/></filter>
      </defs>
      <rect width="1180" height="650" fill="url(#topology-ground)"/>
      <ellipse cx="585" cy="332" rx="535" ry="298" fill="url(#topology-glow)"/>
      <path d="M37 257 577 28l566 261v245L575 630 37 500Z" fill="#111d26" stroke="#31414e" strokeWidth="2"/>
      <path d="M37 257 577 28l566 261-568 241Z" fill="url(#topology-grid)" opacity=".9"/>
      <path d="M37 500 575 630v18L37 518Z" fill="#0a1118"/><path d="M575 630 1143 534v18L575 648Z" fill="#101923"/>
      <path d={flowPath} fill="none" stroke="#101820" strokeWidth="22" strokeLinecap="round"/>
      <path d={flowPath} className={`topology-flow ${failed ? "is-failed" : waiting ? "is-waiting" : ""}`} fill="none" stroke="#65b9e5" strokeWidth="6" strokeLinecap="round" strokeDasharray="10 13"/>
      {!reducedMotion && [0, .33, .66].map((offset, index) => <circle key={index} r="5" fill="#d8fbff" className="topology-packet"><animateMotion dur={`${4.2 + index * .35}s`} begin={`${offset * -4}s`} repeatCount="indefinite" path={flowPath}/></circle>)}
      {systems.map(system => <SystemStation key={system.id} system={system} selected={focusedSystem.id === system.id} alert={(failed || waiting > 0) && (system.id === "dbt" || system.id === "snowflake")}/>) }
      {operators.map(operator => {
        const roleRuns = runs.filter(run => run.role === operator.id);
        const lead = roleRuns.find(run => run.status === "waiting") ?? roleRuns[0];
        return <Operator key={operator.id} operator={operator} active={!!lead} waiting={lead?.status === "waiting"} selected={selected === operator.id}/>;
      })}
      <g opacity=".75"><Tree x={73} y={216}/><Tree x={1125} y={448}/><Tree x={110} y={479}/><Tree x={1014} y={164}/><Tree x={242} y={134}/></g>
    </svg>

    <div className="topology-brand"><span className="topology-live-dot"/><span><strong>LIVING TOPOLOGY</strong><small>{projectName} · {signal}</small></span></div>
    <button className="topology-signal" onClick={() => setFocusedSystem(systems[2])}><span className={failed ? "is-red" : waiting ? "is-amber" : ""}/><strong>{signal}</strong><small>{hasWork ? `${runs.length} active workstream${runs.length === 1 ? "" : "s"}` : "Click a station to inspect it"}</small></button>

    {systems.map(system => <button key={system.id} className={`topology-hit ${focusedSystem.id === system.id ? "selected" : ""}`} style={{ "--system-x": `${system.x / 11.8}%`, "--system-y": `${system.y / 6.5}%` } as CSSProperties} aria-label={`Inspect ${system.name}`} onClick={() => setFocusedSystem(system)}/>) }
    {operators.map(operator => {
      const roleRuns = runs.filter(run => run.role === operator.id);
      const lead = roleRuns.find(run => run.status === "waiting") ?? roleRuns[0];
      return <button key={operator.id} className={`topology-operator-label ${lead ? "is-active" : ""} ${lead?.status === "waiting" ? "needs-you" : ""}`} style={{ "--operator-x": `${operator.x / 11.8}%`, "--operator-y": `${operator.y / 6.5}%`, "--operator-color": operator.color } as CSSProperties} onClick={() => onSelect(operator.id)}><i/><span><strong>{lead?.agentName ?? operator.name}</strong><small>{lead?.status === "waiting" ? "Needs your decision" : lead?.action ?? operator.action}</small></span></button>;
    })}

    <aside className="topology-focus" aria-live="polite"><span>{focusedSystem.name}</span><strong>{focusedSystem.caption}</strong><small>{focusedSystem.id === "github" ? "Branches, pull requests, checks" : focusedSystem.id === "airflow" ? "DAGs, schedules, task runs" : focusedSystem.id === "dbt" ? "Models, tests, documentation" : focusedSystem.id === "snowflake" ? "Tables, cost, secure access" : focusedSystem.id === "montecarlo" ? "Monitors, anomalies, quality" : "Dashboards, users, business impact"}</small><button onClick={() => setFocusedSystem(systems[(systems.findIndex(item => item.id === focusedSystem.id) + 1) % systems.length]!)}>Next station →</button></aside>

    <div className="topology-mission"><div><span>CURRENT MISSION</span><strong>{missionTitle}</strong></div><div className="topology-steps">{["Detect", "Investigate", "Fix", "Verify", "Learn"].map((label, index) => <span key={label} className={index < stageIndex ? "complete" : index === stageIndex ? "current" : ""}><i>{index < stageIndex ? "✓" : index + 1}</i><small>{label}</small></span>)}</div></div>
  </section>;
}

function SystemStation({ system, selected, alert }: { system: (typeof systems)[number]; selected: boolean; alert: boolean }) {
  const tower = system.id === "airflow" || system.id === "snowflake";
  return <g transform={`translate(${system.x} ${system.y})`} className={`topology-station ${selected ? "selected" : ""} ${alert ? "has-alert" : ""}`} filter="url(#topology-shadow)">
    <ellipse cy="53" rx="80" ry="25" fill="#000" opacity=".3"/>
    <path d="M-72 9 0-31 72 9 0 50Z" fill={selected ? "#263947" : "#1d2c37"} stroke={alert ? "#ef745d" : selected ? system.color : "#40515d"} strokeWidth={selected || alert ? 3 : 1.5}/>
    <path d="M-72 9 0 50v19L-72 28Z" fill="#13202a"/><path d="M72 9 0 50v19L72 28Z" fill="#0c161e"/>
    {tower ? <g transform="translate(0 -39)"><path d="M-29-63 29-48v82L0 53l-29-17Z" fill="#172630" stroke="#566975" strokeWidth="2"/><path d="M29-48 47-59v79L29 34Z" fill="#0d1820"/><path d="m-29-63 18-11 58 15-18 11Z" fill="#273b48"/>{[-42,-19,4].map(y => <path key={y} d={`M-20 ${y} 21 ${y+10}`} stroke={system.color} strokeWidth="7" opacity=".75"/>)}</g> : <g transform="translate(0 -18)"><path d="M-44-30 4-52 47-27 0-2Z" fill="#283b47" stroke="#60717c" strokeWidth="2"/><path d="M-44-30 0-2v46l-44-26Z" fill="#192832"/><path d="M47-27 0-2v46l47-26Z" fill="#101c24"/><rect x="-26" y="-29" width="53" height="31" rx="4" fill="#0c151c" stroke={system.color} strokeWidth="2"/></g>}
    <circle cy={tower ? -60 : -32} r="21" fill={system.color} opacity={alert ? .42 : .92}/><text x="0" y={tower ? -54 : -26} textAnchor="middle" fill="#071116" fontSize={system.glyph.length > 2 ? 10 : 15} fontWeight="800" fontFamily="ui-monospace, monospace">{system.glyph}</text>
    {alert && <g transform="translate(55 -49)" className="topology-alert"><circle r="16" fill="#e9604f"/><text textAnchor="middle" y="5" fill="white" fontWeight="800" fontSize="15">!</text></g>}
    <g transform="translate(0 87)"><text textAnchor="middle" fill="#f2f6f4" fontSize="14" fontWeight="700">{system.name}</text><text textAnchor="middle" y="17" fill="#83939f" fontSize="9" fontFamily="ui-monospace, monospace">{system.caption.toUpperCase()}</text></g>
  </g>;
}

function Operator({ operator, active, waiting, selected }: { operator: (typeof operators)[number]; active: boolean; waiting: boolean; selected: boolean }) {
  return <g transform={`translate(${operator.x} ${operator.y})`} className={`topology-person ${active ? "is-working" : ""}`}>
    <ellipse cy="24" rx="26" ry="9" fill="#000" opacity=".35"/>
    {selected && <circle cy="2" r="29" fill="none" stroke={operator.color} strokeWidth="2" strokeDasharray="4 5" className="topology-person-ring"/>}
    <path d="M-11 5-16 29M11 5 16 29" stroke="#18232c" strokeWidth="9" strokeLinecap="round"/>
    <path d="M-17-12Q0-23 17-12L13 12Q0 21-13 12Z" fill={operator.color}/><path d="M-12-8Q0 1 12-8" fill="none" stroke="#edf4f3" strokeWidth="3" opacity=".72"/>
    <circle cy="-28" r="13" fill="#c88f70"/><path d="M-13-30Q-8-47 7-43 17-39 12-25Q4-35-13-30Z" fill="#17212a"/>
    <circle cx="-5" cy="-27" r="1.4" fill="#18212a"/><circle cx="5" cy="-27" r="1.4" fill="#18212a"/>
    <circle cx="18" cy="-20" r="5" fill={waiting ? "#f2ad54" : active ? "#8fe0ae" : "#596976"} stroke="#101820" strokeWidth="2"/>
  </g>;
}

function Tree({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}><ellipse cy="22" rx="18" ry="7" fill="#000" opacity=".25"/><path d="M-2 0v25h5V0" fill="#37442f"/><circle cy="-11" r="16" fill="#253c35"/><circle cx="-11" cy="-2" r="11" fill="#1b302a"/><circle cx="10" cy="0" r="12" fill="#2d493e"/></g>;
}
