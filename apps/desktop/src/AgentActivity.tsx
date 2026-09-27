import { useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { projectDirectoryTeam, type Company, type CompanyAgent } from "./company-model";
import { involvesAgent, readRehearsals } from "./run-inspection";
import { runStatus, statusLabels } from "./task-rehearsal";
import { RunInspector } from "./RunInspector";

export function AgentActivity({ agent, office, configure, company, openProject }: { agent: CompanyAgent; office: string; configure: () => void; company: Company; openProject: (id: string) => void }) {
  const [history, setHistory] = useState(readRehearsals);
  const [selectedId, setSelectedId] = useState("");
  const runs = history.runs.filter(run => run.actions.some(a => involvesAgent(a, agent.id)));
  const run = runs.find(r => r.id === selectedId);
  const legacy = history.runs.filter(r => r.actions.some(a => !a.performerIds)).length;
  return <div className="co-agent-activity"><div className="co-agent-activity-summary"><div><strong>{agent.role}</strong><p>{office} · {agent.engine} · Not connected</p></div><button className="co-button" onClick={configure}>Configure agent</button></div><div className="co-runtime-notice"><Activity size={18} /><div><strong>Live logs and output are not connected.</strong><p>This agent has no live engine session attached. Below are saved rehearsals where its stable ID appears as a performer or reviewer. Names alone are never used to assign history.</p></div></div><div className="co-agent-history-heading"><h3>Rehearsal history · {runs.length}</h3><button className="co-button" onClick={() => setHistory(readRehearsals())}><RefreshCw size={13} />Refresh history</button></div>{history.error && <p className="co-form-error" role="alert">{history.error}</p>}{legacy > 0 && <p className="co-inspect-hint">{legacy} older runs lack performer IDs. Unattributed work is still available in Activity, but is not guessed into this agent’s history.</p>}
    <div className="co-project-links" aria-label="Agent projects"><span>Projects</span>{(company.projects || []).filter(p => projectDirectoryTeam(company, p).some(a => a.id === agent.id)).map(p => <button key={p.id} onClick={() => openProject(p.id)}>{p.name}</button>)}{!(company.projects || []).some(p => projectDirectoryTeam(company, p).some(a => a.id === agent.id)) && <span>No projects assigned</span>}</div>
    <div className="co-agent-run-list">{runs.map(r => <button key={r.id} aria-pressed={selectedId === r.id} onClick={() => setSelectedId(r.id)}><span><strong>{r.title}</strong><small>{new Date(r.createdAt).toLocaleString()} · {r.id.slice(0, 8)}</small></span><em>{statusLabels[runStatus(r)]} · simulated</em></button>)}</div>{!runs.length && <div className="co-activity-empty"><h3>No attributed run history yet.</h3><p>Start a rehearsal with this agent to inspect its recorded events, sample output, and approvals.</p></div>}{run && <RunInspector key={run.id} run={run} agentId={agent.id} />}
  </div>;
}
