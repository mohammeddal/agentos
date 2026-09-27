import { useState } from "react";
import { Activity, RefreshCw, Trash2 } from "lucide-react";
import { projectDirectoryTeam, type Company, type CompanyAgent } from "../company/company-model";
import { involvesAgent, readRehearsals } from "./run-inspection";
import { runStatus, statusLabels } from "./task-rehearsal";
import { RunInspector } from "./RunInspector";
import { LiveHistory } from "../engines/LiveExecution";

export function AgentActivity({
  agent,
  office,
  configure,
  company,
  openProject,
  remove,
}: {
  agent: CompanyAgent;
  office: string;
  configure: () => void;
  company: Company;
  openProject: (id: string) => void;
  remove: () => void;
}) {
  const [history, setHistory] = useState(readRehearsals);
  const [selectedId, setSelectedId] = useState("");
  const runs = history.runs.filter((run) => run.actions.some((a) => involvesAgent(a, agent.id)));
  const run = runs.find((r) => r.id === selectedId);
  const legacy = history.runs.filter((r) => r.actions.some((a) => !a.performerIds)).length;
  return (
    <div className="co-agent-activity">
      <div className="co-agent-activity-summary">
        <div>
          <strong>{agent.role}</strong>
          <p>
            {office} · {agent.engine}
          </p>
        </div>
        <div className="co-agent-summary-actions">
          <button className="co-button" onClick={configure}>
            Configure agent
          </button>
          <button className="co-button co-button-danger" onClick={remove}>
            <Trash2 size={13} /> Delete agent
          </button>
        </div>
      </div>
      {(agent.prompt || agent.skills?.length) && (
        <section className="co-agent-profile" aria-label="Agent instructions and skills">
          {agent.prompt && (
            <div>
              <strong>Custom prompt</strong>
              <p>{agent.prompt}</p>
            </div>
          )}
          {!!agent.skills?.length && (
            <div>
              <strong>Selected skills</strong>
              <div>
                {agent.skills.map((skill) => (
                  <span key={skill.id}>
                    {skill.name} <small>{skill.scope}</small>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      <LiveHistory agentId={agent.id} />
      <div className="co-agent-history-heading">
        <h3>Rehearsal history · {runs.length}</h3>
        <button className="co-button" onClick={() => setHistory(readRehearsals())}>
          <RefreshCw size={13} />
          Refresh history
        </button>
      </div>
      {history.error && (
        <p className="co-form-error" role="alert">
          {history.error}
        </p>
      )}
      {legacy > 0 && (
        <p className="co-inspect-hint">
          {legacy} older runs lack performer IDs. Unattributed work is still available in Activity,
          but is not guessed into this agent’s history.
        </p>
      )}
      <div className="co-project-links" aria-label="Agent projects">
        <span>Projects</span>
        {(company.projects || [])
          .filter((p) => projectDirectoryTeam(company, p).some((a) => a.id === agent.id))
          .map((p) => (
            <button key={p.id} onClick={() => openProject(p.id)}>
              {p.name}
            </button>
          ))}
        {!(company.projects || []).some((p) =>
          projectDirectoryTeam(company, p).some((a) => a.id === agent.id),
        ) && <span>No projects assigned</span>}
      </div>
      <div className="co-agent-run-list">
        {runs.map((r) => (
          <button key={r.id} aria-pressed={selectedId === r.id} onClick={() => setSelectedId(r.id)}>
            <span>
              <strong>{r.title}</strong>
              <small>
                {new Date(r.createdAt).toLocaleString()} · {r.id.slice(0, 8)}
              </small>
            </span>
            <em>{statusLabels[runStatus(r)]} · simulated</em>
          </button>
        ))}
      </div>
      {!runs.length && (
        <div className="co-activity-empty">
          <h3>No attributed run history yet.</h3>
          <p>
            Start a rehearsal with this agent to inspect its recorded events, sample output, and
            approvals.
          </p>
        </div>
      )}
      {run && <RunInspector key={run.id} run={run} agentId={agent.id} />}
    </div>
  );
}
