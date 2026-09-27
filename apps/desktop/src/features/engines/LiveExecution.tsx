import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import type { Company, CompanyTask } from "../company/company-model";
import {
  compileTask,
  controlLive,
  isActiveRun,
  refreshEngines,
  startLive,
  taskRequest,
  useLiveRuntime,
  type LiveRun,
  type LiveStep,
} from "./live-runtime";
import "./live-execution.css";
import { NotificationSettings } from "./live-notifications";
import { pauseSchedule, setSchedule, useScheduleState } from "./live-schedules";
import { TaskModels } from "./TaskModels";
import { AssistantMessage } from "../../shared/AssistantMessage";
import {
  matchesRunFilter,
  runFilters,
  runLabel,
  runSummary,
  type RunFilter,
} from "./run-presentation";

export function EngineSetup() {
  const { engines, native, error } = useLiveRuntime();
  return (
    <section className="co-live-setup" aria-label="Engine connection">
      <header>
        <div>
          <strong>{native ? "Run on your local engines" : "Browser preview"}</strong>
          <p>
            {native
              ? "AgentOS uses your CLI sign-in. Credentials stay with Codex or Claude Code."
              : "Open the installed AgentOS Mac app to send prompts and run tasks."}
          </p>
        </div>
        <button className="co-button" onClick={() => void refreshEngines()}>
          Check engines
        </button>
      </header>
      {native &&
        engines.map((engine) => (
          <div className="co-live-engine" key={engine.engine}>
            <strong>{engine.engine === "codex" ? "Codex" : "Claude Code"}</strong>
            <span>{engine.installed ? "Installed · ready to try" : "Not installed"}</span>
            <small>{engine.installed ? engine.path : engine.detail}</small>
            <details>
              <summary>Sign-in & setup</summary>
              <p>
                In Terminal, run{" "}
                <code>{engine.engine === "codex" ? "codex login" : "claude auth login"}</code>,
                complete sign-in, then send a chat here.
              </p>
              <a
                href={
                  engine.engine === "codex"
                    ? "https://learn.chatgpt.com/docs/cli"
                    : "https://code.claude.com/docs/en/setup"
                }
                target="_blank"
                rel="noreferrer"
              >
                Official installation instructions
              </a>
            </details>
          </div>
        ))}
      <NotificationSettings />
      <small>
        Model requests use the provider’s cloud and account limits. Workspaces and run history stay
        on this Mac. CLI settings and connected tools can affect access; only use trusted
        configurations.
      </small>
      {error && (
        <p role="alert" className="co-form-error">
          {error}
        </p>
      )}
    </section>
  );
}
export function LiveRunCard({ run, collapsible = false }: { run: LiveRun; collapsible?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(!collapsible);
  const detailId = useId();
  async function control(approvalId?: string, allow?: boolean) {
    setBusy(true);
    setError("");
    try {
      await controlLive(run.request.id, approvalId, allow);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const details = (
    <div className="co-live-run-details" id={detailId}>
      {run.approvals.map((approval) => (
        <section className="co-live-approval" key={approval.id}>
          <strong>{approval.title}</strong>
          <pre>{approval.detail}</pre>
          <button
            className="co-button co-button-primary"
            disabled={busy}
            onClick={() => void control(approval.id, true)}
          >
            Approve once
          </button>
          <button
            className="co-button"
            disabled={busy}
            onClick={() => void control(approval.id, false)}
          >
            Reject
          </button>
        </section>
      ))}
      {run.output && (
        <div className="co-live-answer" aria-label="Assistant response">
          <AssistantMessage text={run.output} />
        </div>
      )}
      {!run.output && isActiveRun(run) && !run.approvals.length && (
        <p role="status">Connecting and waiting for the engine…</p>
      )}
      {run.error && (
        <p className="co-form-error" role="alert">
          {run.error}
        </p>
      )}
      {error && (
        <p className="co-form-error" role="alert">
          {error}
        </p>
      )}
      <details className="co-live-evidence">
        <summary>
          Steps & activity <span>{run.events.length} events</span>
        </summary>
        <p>
          Workspace: <code>{run.cwd}</code>
        </p>
        {run.results.map((step) => (
          <details key={step.id}>
            <summary>
              {step.label} · {step.status}
            </summary>
            <pre>{step.output}</pre>
          </details>
        ))}
        <ol>
          {run.events.map((event, i) => (
            <li key={i}>
              <small>
                {new Date(event.at).toLocaleTimeString()} · {event.kind}
              </small>
              <pre>{event.text}</pre>
            </li>
          ))}
        </ol>
        <small>
          Provider-published activity only. Private internal reasoning is not displayed.
        </small>
      </details>
    </div>
  );
  return (
    <article
      className={`co-live-run ${collapsible ? "is-collapsible" : ""} ${expanded ? "is-expanded" : ""}`}
      aria-label={`Run ${run.request.title}`}
    >
      {collapsible ? (
        <>
          <header className="co-live-run-summary">
            <button
              type="button"
              className="co-live-run-toggle"
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={() => setExpanded((value) => !value)}
            >
              <span className={`co-live-state-dot ${run.status}`} aria-hidden="true" />
              <span className="co-live-run-title">
                <strong>{run.request.title}</strong>
                <small>
                  {run.engine === "codex" ? "Codex" : "Claude Code"} ·{" "}
                  {new Date(run.createdAt).toLocaleString()} · {run.request.steps.length}{" "}
                  {run.request.steps.length === 1 ? "step" : "steps"}
                </small>
              </span>
              <span className={`co-live-status ${run.status}`}>{runLabel(run)}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {isActiveRun(run) && (
              <button className="co-button" disabled={busy} onClick={() => void control()}>
                Stop
              </button>
            )}
          </header>
          {!expanded && (
            <button
              type="button"
              className="co-live-run-preview"
              aria-label={`Expand ${run.request.title}`}
              onClick={() => setExpanded(true)}
            >
              {runSummary(run)}
            </button>
          )}
          {expanded && details}
        </>
      ) : (
        <>
          <header>
            <div>
              <strong>{run.request.title}</strong>
              <small>
                {run.engine === "codex" ? "Codex" : "Claude Code"} ·{" "}
                {new Date(run.createdAt).toLocaleString()}
              </small>
            </div>
            <span className={`co-live-status ${run.status}`}>{runLabel(run)}</span>
            {isActiveRun(run) && (
              <button className="co-button" disabled={busy} onClick={() => void control()}>
                Stop
              </button>
            )}
          </header>
          {details}
        </>
      )}
    </article>
  );
}
export function LiveHistory({
  runKey,
  agentId,
  query = "",
  summaryView = false,
}: {
  runKey?: string;
  agentId?: string;
  query?: string;
  summaryView?: boolean;
}) {
  const { runs, error, native } = useLiveRuntime();
  const [filter, setFilter] = useState<RunFilter>("all");
  const [limit, setLimit] = useState(10);
  const matched = runs
    .filter(
      (r) =>
        (!runKey || r.request.key === runKey) &&
        (!agentId ||
          r.request.steps.some((s) => s.agentId === agentId || s.reviewer?.agentId === agentId)) &&
        `${r.request.title} ${r.output}`.toLowerCase().includes(query.toLowerCase()) &&
        matchesRunFilter(r, filter),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <section
      className={`co-live-history ${summaryView ? "is-summary-view" : ""}`}
      aria-label="Live execution history"
    >
      {!runKey && (
        <header>
          <div className="co-work-filters" role="group" aria-label="Filter live runs">
            {runFilters.map((item) => (
              <button
                key={item.id}
                aria-pressed={filter === item.id}
                onClick={() => {
                  setFilter(item.id);
                  setLimit(10);
                }}
              >
                {item.label}
                <span>
                  {
                    runs.filter(
                      (r) =>
                        (!agentId ||
                          r.request.steps.some(
                            (s) => s.agentId === agentId || s.reviewer?.agentId === agentId,
                          )) &&
                        `${r.request.title} ${r.output}`
                          .toLowerCase()
                          .includes(query.toLowerCase()) &&
                        matchesRunFilter(r, item.id),
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
        </header>
      )}
      {error && (
        <p role="alert" className="co-form-error">
          {error}
        </p>
      )}
      {!matched.length && (
        <p>
          {native
            ? filter === "attention"
              ? "Nothing needs your attention."
              : filter === "active"
                ? "Nothing is running right now."
                : "No matching runs. Send a chat or start a task to see its activity here."
            : "Live runs are available in the installed Mac app."}
        </p>
      )}
      {matched.slice(0, limit).map((run) => (
        <LiveRunCard key={run.request.id} run={run} collapsible={summaryView} />
      ))}
      {matched.length > limit && (
        <button className="co-button" onClick={() => setLimit((n) => n + 10)}>
          Show earlier runs
        </button>
      )}
    </section>
  );
}
export function TaskExecution({
  company,
  task,
  save,
}: {
  company: Company;
  task: CompanyTask;
  save?: ((task: CompanyTask) => void) | undefined;
}) {
  const { runs } = useLiveRuntime();
  const schedules = useScheduleState();
  const scheduled = schedules.find((s) => s.taskId === task.id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = runs.some((r) => r.request.key === `task:${task.id}` && isActiveRun(r));
  let planError = "";
  let steps: LiveStep[] = [];
  try {
    steps = compileTask(company, task);
  } catch (e) {
    planError = String(e).replace(/^Error: /, "");
  }
  async function start() {
    setBusy(true);
    setError("");
    try {
      await startLive(await taskRequest(company, task));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function schedule() {
    setBusy(true);
    setError("");
    try {
      if (scheduled?.enabled) pauseSchedule(task.id);
      else if (task.schedule) setSchedule(task.id, task.schedule, await taskRequest(company, task));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="co-task-execution">
      <header>
        <div>
          <strong>Execution</strong>
          <p>
            Runs the assigned team in order, passing output to the next step. Provider permissions
            still apply.
          </p>
        </div>
        <button
          className="co-button co-button-primary"
          disabled={!isTauri() || active || busy || !!planError}
          onClick={() => void start()}
        >
          {active ? "Task active" : busy ? "Starting…" : "Run task"}
        </button>
      </header>
      {save && steps.length > 0 && (
        <TaskModels task={task} steps={steps} save={save} disabled={active || busy} />
      )}
      {(task.schedule?.kind === "cron" || scheduled?.enabled) && (
        <div>
          <button
            className="co-button"
            disabled={!isTauri() || busy || (!!planError && !scheduled?.enabled)}
            onClick={() => void schedule()}
          >
            {scheduled?.enabled ? "Pause schedule" : "Enable schedule"}
          </button>
          <p>
            {scheduled?.enabled
              ? `Next: ${new Date(scheduled.next).toLocaleString()}. `
              : "Schedule is paused. "}
            Requires AgentOS to stay open and your Mac awake. Missed times are skipped. Enabling
            freezes the current plan; pause and re-enable to apply plan edits. Reviewed memory and
            its on/off setting are refreshed before each scheduled run.
          </p>
          {scheduled?.error && <p className="co-form-error">{scheduled.error}</p>}
        </div>
      )}
      {planError && <p className="co-form-error">{planError}</p>}
      {error && (
        <p role="alert" className="co-form-error">
          {error}
        </p>
      )}
      <LiveHistory runKey={`task:${task.id}`} />
    </section>
  );
}
