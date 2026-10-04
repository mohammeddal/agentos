import { useState, type ReactNode } from "react";
import { ApprovalBody } from "../engines/ApprovalBody";
import { AlwaysAllowButton } from "../engines/AlwaysAllowButton";
import { ArrowRight, Bot, GitBranch, Play, ShieldAlert, Square, X } from "lucide-react";
import {
  taskParticipants,
  type Company,
  type CompanyAgent,
  type CompanyTask,
  type Office,
} from "./company-model";
import { controlLive, isActiveRun, type LiveRun } from "../engines/live-runtime";
import { runLabel } from "../engines/run-presentation";
import { canvasRunStatuses, stoppedStep } from "../canvas/run-state";
import { RunOutcome } from "../engines/RunOutcome";
import { stripMemoryBlocks } from "../memory/run-learning";
import { AgentWorkForm } from "./AgentWorkForm";
import { agentStateLabels, type AgentMapState, type AgentOutcome } from "./company-map-state";

const time = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function StatePill({
  state,
  outcome,
}: {
  state: AgentMapState;
  outcome?: AgentOutcome | null;
}) {
  return (
    <span className="map-pills">
      <span className="map-pill" data-state={state}>
        {agentStateLabels[state]}
      </span>
      {outcome && state !== "working" && state !== "approval" && (
        <span className="map-pill" data-state={outcome}>
          {outcome === "failed" ? "Failed" : "Done just now"}
        </span>
      )}
    </span>
  );
}

function Approvals({ run }: { run: LiveRun | undefined }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!run?.approvals.length) return null;
  async function decide(id: string, allow: boolean) {
    setBusy(true);
    setError("");
    try {
      await controlLive(run!.request.id, id, allow);
    } catch (cause) {
      setError(String(cause).replace(/^Error: /, ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="map-approval" aria-label="Waiting for your approval">
      {run.approvals.map((approval) => (
        <div key={approval.id}>
          <ShieldAlert size={16} />
          <div>
            <ApprovalBody approval={approval} />
            <div className="map-actions">
              <button
                className="co-button co-button-primary"
                disabled={busy}
                onClick={() => void decide(approval.id, true)}
              >
                Approve once
              </button>
              <button
                className="co-button"
                disabled={busy}
                onClick={() => void decide(approval.id, false)}
              >
                Reject
              </button>
              <AlwaysAllowButton
                run={run!}
                approval={approval}
                disabled={busy}
                onError={setError}
              />
            </div>
          </div>
        </div>
      ))}
      {error && <p className="map-error">{error}</p>}
    </section>
  );
}

/** Cancels a live run; the provider process is terminated and the run is marked canceled. */
function StopButton({ run }: { run: LiveRun }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function stop() {
    setBusy(true);
    setError("");
    try {
      await controlLive(run.request.id);
    } catch (cause) {
      setError(String(cause).replace(/^Error: /, ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="co-button" disabled={busy} onClick={() => void stop()}>
        <Square size={12} fill="currentColor" /> {busy ? "Stopping…" : "Stop"}
      </button>
      {error && <p className="map-error">{error}</p>}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="map-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

/** The latest run, with a button to open every previous run and its output. */
function RecentRuns({ runs }: { runs: LiveRun[] }) {
  const [all, setAll] = useState(false);
  if (!runs.length) return <p className="map-muted">Nothing has run yet.</p>;
  const shown = all ? runs : runs.slice(0, 1);
  return (
    <>
      <ol className="map-history">
        {shown.map((run) => (
          <li key={run.request.id}>
            <details>
              <summary>
                <span>{run.request.title}</span>
                <small>
                  <em className="map-pill" data-state={runState(run)}>
                    {runLabel(run)}
                  </em>{" "}
                  {time(run.createdAt)}
                </small>
              </summary>
              {run.error && <p className="map-error">{run.error}</p>}
              <RunOutcome run={run} />
              {run.output ? (
                <pre dir="auto" className="map-output">
                  {stripMemoryBlocks(run.output)}
                </pre>
              ) : (
                !run.error && <p className="map-muted">No output recorded.</p>
              )}
              {run.request.steps.length > 1 && (
                <ul className="map-history-steps">
                  {run.request.steps.map((step) => {
                    const result = run.results.find((r) => r.id === step.id);
                    return (
                      <li key={step.id}>
                        <strong>{step.label}</strong>
                        <small>{result?.status || "not started"}</small>
                        {result?.output && <p>{result.output.slice(0, 400)}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          </li>
        ))}
      </ol>
      {runs.length > 1 && (
        <button className="map-link map-history-toggle" onClick={() => setAll(!all)}>
          {all ? "Show only the latest run" : `Previous runs · ${runs.length - 1}`}
        </button>
      )}
    </>
  );
}

function PanelHeader({
  icon,
  title,
  subtitle,
  status,
  close,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  status: ReactNode;
  close: () => void;
}) {
  return (
    <header className="map-panel-header">
      <span className="map-panel-icon">{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
        {status}
      </div>
      <button className="co-icon-button" aria-label="Close details" onClick={close}>
        <X size={15} />
      </button>
    </header>
  );
}

export function AgentPanel({
  agent,
  office,
  state,
  outcome,
  runs,
  workflows,
  close,
  assignWork,
  openWorkflow,
  history,
  configure,
  editOffice,
  native,
}: {
  native: boolean;
  agent: CompanyAgent;
  office: Office;
  state: AgentMapState;
  outcome: AgentOutcome | null;
  runs: LiveRun[];
  workflows: CompanyTask[];
  close: () => void;
  assignWork: (text: string) => Promise<void>;
  openWorkflow: (task: CompanyTask) => void;
  history: () => void;
  configure: () => void;
  editOffice: () => void;
}) {
  const current = runs.find((run) => isActiveRun(run) && run.currentAgentId === agent.id);
  const step = current?.request.steps.find((s) => s.agentId === agent.id);
  const output = current?.results.find((r) => r.id === step?.id)?.output;
  return (
    <>
      <PanelHeader
        icon={<Bot size={20} />}
        title={agent.name}
        subtitle={`${agent.role} · ${office.name} · ${agent.engine}`}
        status={<StatePill state={state} outcome={outcome} />}
        close={close}
      />
      <Approvals
        run={runs.find((run) => run.approvals.length && run.currentAgentId === agent.id)}
      />
      {current && (
        <Section title="Now">
          <strong className="map-now">{current.request.title}</strong>
          {step && <p className="map-muted">Step: {step.label}</p>}
          {output && (
            <pre dir="auto" className="map-output">
              {output.slice(0, 500)}
            </pre>
          )}
          <div className="map-actions">
            <StopButton run={current} />
          </div>
        </Section>
      )}
      {state === "offline" ? (
        <p className="map-notice">
          {native
            ? `${agent.engine} isn’t available on this Mac, so ${agent.name} can’t take work yet. Set it up in Settings.`
            : `This is the browser preview. Open the AgentOS Mac app to give ${agent.name} work.`}
        </p>
      ) : (
        <AgentWorkForm agent={agent} assignWork={assignWork} />
      )}
      <Section title="Runs">
        <RecentRuns runs={runs} />
      </Section>
      {workflows.length > 0 && (
        <Section title="In workflows">
          {workflows.map((task) => (
            <button key={task.id} className="map-link" onClick={() => openWorkflow(task)}>
              <GitBranch size={13} /> {task.title} <ArrowRight size={12} />
            </button>
          ))}
        </Section>
      )}
      <footer className="map-panel-footer">
        <button className="co-button" onClick={configure}>
          Edit agent
        </button>
      </footer>
    </>
  );
}

export function WorkflowPanel({
  company,
  task,
  runs,
  close,
  runNow,
  retryFrom,
  open,
  selectAgent,
}: {
  company: Company;
  task: CompanyTask;
  runs: LiveRun[];
  close: () => void;
  runNow: () => Promise<void>;
  retryFrom?: (stepId: string) => Promise<void>;
  open: () => void;
  selectAgent: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = runs[0];
  const active = !!latest && isActiveRun(latest);
  const failedStep = stoppedStep(latest);
  const team = taskParticipants(company, task.assignment);
  // Every step on the canvas, including custom steps that aren't company agents.
  const steps = (task.canvas?.nodes || [])
    .filter((n) => ["agent", "office", "domain", "prompt", "approval"].includes(n.kind))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const statuses = task.canvas ? canvasRunStatuses(task.canvas, latest) : {};
  const currentAgent = team.find((agent) => agent.id === latest?.currentAgentId);
  async function start() {
    setBusy(true);
    setError("");
    try {
      await runNow();
    } catch (cause) {
      setError(String(cause).replace(/^Error: /, ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PanelHeader
        icon={<GitBranch size={20} />}
        title={task.title}
        subtitle={
          task.schedule?.kind === "cron"
            ? `Scheduled · ${task.schedule.expression} · ${task.schedule.timeZone}`
            : "Manual · run it yourself"
        }
        status={
          <span className="map-pill" data-state={runState(latest)}>
            {latest ? runLabel(latest) : "Not run yet"}
          </span>
        }
        close={close}
      />
      <Approvals run={latest} />
      {active && (
        <Section title="Now">
          <strong className="map-now">
            {currentAgent ? `${currentAgent.name} is working` : "Starting…"}
          </strong>
          {latest.output && (
            <pre dir="auto" className="map-output">
              {latest.output.slice(0, 500)}
            </pre>
          )}
        </Section>
      )}
      {task.brief && <p className="map-muted">{task.brief}</p>}
      <div className="map-actions">
        <button
          className="co-button co-button-primary"
          disabled={busy || active}
          onClick={() => void start()}
        >
          <Play size={13} /> {active ? "Running…" : busy ? "Starting…" : "Run now"}
        </button>
        {active && <StopButton run={latest} />}
        {failedStep && retryFrom && (
          <button
            className="co-button"
            disabled={busy}
            title="Earlier steps keep their results"
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await retryFrom(failedStep.id);
              } catch (cause) {
                setError(String(cause).replace(/^Error: /, ""));
              } finally {
                setBusy(false);
              }
            }}
          >
            {latest?.status === "canceled" ? "Resume where it stopped" : "Retry failed step"}
          </button>
        )}
        <button className="co-button" onClick={open}>
          Open workflow <ArrowRight size={13} />
        </button>
      </div>
      {error && <p className="map-error">{error}</p>}
      {latest?.error && !active && <p className="map-error">{latest.error}</p>}
      <Section title="Runs">
        <RecentRuns runs={runs} />
      </Section>
      {steps.length ? (
        <Section title={`Steps · ${steps.length}`}>
          {steps.map((node) => {
            const agent =
              node.kind === "agent" ? team.find((a) => a.id === node.reference) : undefined;
            const status = statuses[node.id];
            return (
              <button
                key={node.id}
                className="map-link map-step"
                onClick={() => (agent ? selectAgent(agent.id) : open())}
                title={agent ? "Show this agent" : "Open in the Studio"}
              >
                <i
                  data-state={
                    status === "working"
                      ? "working"
                      : status === "approval"
                        ? "approval"
                        : status === "failed"
                          ? "failed"
                          : status === "done"
                            ? "done"
                            : undefined
                  }
                />
                {node.kind === "agent" ? (
                  <Bot size={13} />
                ) : node.kind === "approval" ? (
                  <ShieldAlert size={13} />
                ) : (
                  <GitBranch size={13} />
                )}
                <span>{node.title}</span>
                <small>
                  {agent
                    ? agent.role
                    : node.kind === "prompt"
                      ? "Custom step"
                      : node.kind === "approval"
                        ? "Approval"
                        : node.kind === "office"
                          ? "Whole office"
                          : node.kind}
                </small>
              </button>
            );
          })}
        </Section>
      ) : (
        <Section title={`Team · ${team.length}`}>
          {team.length ? (
            team.map((agent) => (
              <button key={agent.id} className="map-link" onClick={() => selectAgent(agent.id)}>
                <Bot size={13} /> {agent.name} <small>{agent.role}</small>
              </button>
            ))
          ) : (
            <p className="map-muted">No agents yet. Open the workflow to add some.</p>
          )}
        </Section>
      )}
    </>
  );
}

export type WorkflowState = "approval" | "working" | "failed" | "done" | "idle";
export function runState(run: LiveRun | undefined): WorkflowState {
  if (!run) return "idle";
  if (run.status === "awaiting_approval") return "approval";
  if (isActiveRun(run)) return "working";
  return run.status === "failed" ? "failed" : run.status === "completed" ? "done" : "idle";
}
