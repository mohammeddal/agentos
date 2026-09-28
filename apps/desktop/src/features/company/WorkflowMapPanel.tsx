import { useState } from "react";
import { ArrowRight, GitBranch, Play, ShieldAlert } from "lucide-react";
import { taskParticipants, type Company, type CompanyTask } from "./company-model";
import { controlLive, isActiveRun, type LiveRun } from "../engines/live-runtime";
import { runLabel } from "../engines/run-presentation";

/** Map side panel for a workflow: its team, latest run, approvals, and Run / Open. */
export function WorkflowMapPanel({
  company,
  task,
  run,
  runNow,
  open,
}: {
  company: Company;
  task: CompanyTask;
  run: LiveRun | undefined;
  runNow: () => Promise<void>;
  open: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const team = taskParticipants(company, task.assignment);
  const running = !!run && isActiveRun(run);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(String(cause).replace(/^Error: /, ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="fp-selected-avatar fp-workflow-avatar">
        <GitBranch size={24} />
      </div>
      <h3>{task.title}</h3>
      <p className="fp-agent-role">{task.brief || "No outcome written yet"}</p>
      <span className="fp-state-badge">{runLabel(run)}</span>
      <dl>
        <div>
          <dt>Team</dt>
          <dd>{team.map((agent) => agent.name).join(", ") || "No agents yet"}</dd>
        </div>
        <div>
          <dt>Trigger</dt>
          <dd>
            {task.schedule?.kind === "cron"
              ? `${task.schedule.expression} · ${task.schedule.timeZone}`
              : "Manual"}
          </dd>
        </div>
      </dl>
      {run?.approvals.map((approval) => (
        <div className="fp-approval-callout" key={approval.id}>
          <ShieldAlert size={15} />
          <span>
            <strong>{approval.title}</strong>
            <small>{approval.detail}</small>
            <span className="fp-approval-actions">
              <button
                disabled={busy}
                onClick={() => void act(() => controlLive(run.request.id, approval.id, true))}
              >
                Approve
              </button>
              <button
                disabled={busy}
                onClick={() => void act(() => controlLive(run.request.id, approval.id, false))}
              >
                Reject
              </button>
            </span>
          </span>
        </div>
      ))}
      {run?.error && (
        <p className="fp-approval-error" role="alert">
          {run.error}
        </p>
      )}
      {run?.output && (
        <div className="fp-work-output">
          <span>Latest result</span>
          <p>{run.output.slice(0, 280)}</p>
        </div>
      )}
      {error && (
        <p className="fp-approval-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="fp-inspector-action"
        disabled={busy || running}
        onClick={() => void act(runNow)}
      >
        <Play size={13} /> {running ? "Running…" : busy ? "Starting…" : "Run now"}
      </button>
      <button className="fp-inspector-secondary" onClick={open}>
        Open workflow <ArrowRight size={13} />
      </button>
    </>
  );
}
