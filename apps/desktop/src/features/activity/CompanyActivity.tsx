import { useEffect, useRef, useState } from "react";
import { Check, Play, ShieldCheck, Square, X } from "lucide-react";
import type { Company } from "../company/company-model";
import {
  cancelRehearsal,
  createRehearsal,
  decideRehearsal,
  finishRehearsalAction,
  isRehearsalRun,
  runStatus,
  statusLabels,
  type RehearsalAction,
  type RehearsalRun,
  type ReviewGate,
} from "./task-rehearsal";
import "./company-activity.css";
import { RunInspector } from "./RunInspector";
import { LiveHistory } from "../engines/LiveExecution";

const STORAGE = "agentos:rehearsals:v1";
function loadRuns(): RehearsalRun[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE) || "[]");
    return Array.isArray(value) ? value.filter(isRehearsalRun) : [];
  } catch {
    return [];
  }
}

export function CompanyActivity({
  company,
  query,
  runKey = "",
  clearRunKey,
}: {
  runKey?: string;
  clearRunKey?: () => void;
  company: Company;
  query: string;
}) {
  const [mode, setMode] = useState<"live" | "rehearsal">("live");
  const [runs, setRuns] = useState(loadRuns);
  const [storageError, setStorageError] = useState(false);
  const [taskId, setTaskId] = useState(company.tasks?.[0]?.id || "");
  const [filter, setFilter] = useState<"all" | "human" | "agent" | "running" | "history">("all");
  const [error, setError] = useState("");
  const [inspection, setInspection] = useState<{ runId: string; actionId?: string } | null>(null);
  const inspectionRef = useRef<HTMLDivElement>(null);
  const inspectedRun = runs.find((r) => r.id === inspection?.runId);
  useEffect(() => {
    if (inspection) {
      inspectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      inspectionRef.current?.focus({ preventScroll: true });
    }
  }, [inspection]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(runs));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [runs]);
  const pending = runs.flatMap((run) =>
    run.actions
      .filter((a) => a.status === "awaiting_approval")
      .flatMap((action) =>
        action.gates.filter((g) => g.decision === "pending").map((gate) => ({ run, action, gate })),
      ),
  );
  const humanCount = pending.filter((p) => p.gate.reviewer.kind === "human").length;
  const agentCount = pending.length - humanCount;
  const runningCount = runs.flatMap((r) => r.actions).filter((a) => a.status === "running").length;
  function updateRun(id: string, update: (run: RehearsalRun) => RehearsalRun) {
    const run = runs.find((r) => r.id === id);
    if (!run) return;
    try {
      const next = update(run);
      setRuns((current) => current.map((r) => (r.id === id ? next : r)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this rehearsal.");
    }
  }
  const matches = (text: string) => text.toLowerCase().includes(query.toLowerCase());
  return (
    <section className="co-activity">
      {runKey && (
        <p className="co-form-note">
          Showing activity for the selected conversation.{" "}
          <button className="co-button" onClick={clearRunKey}>
            Show all activity
          </button>
        </p>
      )}
      <nav className="co-activity-modes" aria-label="Activity view">
        <button aria-pressed={mode === "live"} onClick={() => setMode("live")}>
          Runs
        </button>
        <button aria-pressed={mode === "rehearsal"} onClick={() => setMode("rehearsal")}>
          Rehearsals
          <small>Simulated</small>
        </button>
      </nav>
      {mode === "live" ? (
        <LiveHistory summaryView query={query} {...(runKey ? { runKey } : {})} />
      ) : (
        <>
          <div className="co-runtime-notice">
            <ShieldCheck size={21} />
            <div>
              <strong>Test the restrictions before connecting engines.</strong>
              <p>
                Rehearsals use frozen task snapshots and manual sample outcomes. Agent reviews below
                are explicitly simulated—not decisions from real agents. Linked tasks are single
                simulated actions; their internal workflows are not executed.
              </p>
            </div>
          </div>
          <div className="co-rehearsal-launch">
            <label>
              Task to rehearse
              <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">Choose a task…</option>
                {(company.tasks || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="co-button co-button-primary"
              disabled={!company.tasks?.some((t) => t.id === taskId)}
              onClick={() => {
                const task = company.tasks?.find((t) => t.id === taskId);
                if (!task) return;
                try {
                  const run = createRehearsal(company, task);
                  setRuns((current) => [run, ...current]);
                  setFilter("all");
                  setError("");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Unable to start rehearsal.");
                }
              }}
            >
              <Play size={14} />
              Start rehearsal
            </button>
          </div>
          {storageError && (
            <p className="co-form-error" role="alert">
              Rehearsal storage is unavailable. Changes last for this session only.
            </p>
          )}
          {error && (
            <p className="co-form-error" role="alert">
              {error}
            </p>
          )}
          <div className="co-activity-stats">
            <button onClick={() => setFilter("running")}>
              <span>Running · simulated</span>
              <strong>{runningCount}</strong>
              <small>Waiting for sample outcomes</small>
            </button>
            <button onClick={() => setFilter("human")}>
              <span>Needs you · simulated</span>
              <strong>{humanCount}</strong>
              <small>Action-scoped approvals</small>
            </button>
            <button onClick={() => setFilter("agent")}>
              <span>Agent review · simulated</span>
              <strong>{agentCount}</strong>
              <small>Waiting for reviewer decisions</small>
            </button>
            <button onClick={() => setFilter("all")}>
              <span>Rehearsals</span>
              <strong>{runs.length}</strong>
              <small>Saved on this device</small>
            </button>
          </div>
          <div className="co-activity-filters" aria-label="Activity filter">
            {(
              [
                ["all", "All actions"],
                ["human", "Needs your approval"],
                ["agent", "Agent review"],
                ["running", "Running"],
                ["history", "Decision history"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
          {inspectedRun && (
            <div className="co-activity-inspector" ref={inspectionRef} tabIndex={-1}>
              <button className="co-button" onClick={() => setInspection(null)}>
                Close run inspector
              </button>
              <RunInspector
                key={`${inspectedRun.id}:${inspection?.actionId || ""}`}
                run={inspectedRun}
                initialActionId={inspection?.actionId}
              />
            </div>
          )}
          {filter === "human" || filter === "agent" ? (
            <div className="co-review-list">
              {pending
                .filter(
                  (p) =>
                    p.gate.reviewer.kind === filter &&
                    matches(`${p.run.title} ${p.action.label} ${p.gate.reviewerName}`),
                )
                .map(({ run, action, gate }) => (
                  <ReviewCard
                    key={`${run.id}:${action.id}:${gate.id}`}
                    run={run}
                    action={action}
                    gate={gate}
                    decide={(approve, note) =>
                      updateRun(run.id, (r) =>
                        decideRehearsal(
                          r,
                          action.id,
                          gate.id,
                          gate.id as "human" | `agent:${string}`,
                          approve,
                          note,
                        ),
                      )
                    }
                  />
                ))}
              {!pending.some(
                (p) =>
                  p.gate.reviewer.kind === filter &&
                  matches(`${p.run.title} ${p.action.label} ${p.gate.reviewerName}`),
              ) && (
                <div className="co-activity-empty">
                  <Check size={24} />
                  <h3>No matching pending reviews.</h3>
                  <p>Only actions that reach an approval gate appear here.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="co-run-list">
              {runs
                .filter(
                  (run) =>
                    matches(`${run.title} ${run.actions.map((a) => a.label).join(" ")}`) &&
                    (filter !== "running" || run.actions.some((a) => a.status === "running")),
                )
                .map((run) => (
                  <article className="co-run-card" key={run.id}>
                    <header>
                      <div>
                        <small>
                          REHEARSAL · {new Date(run.createdAt).toLocaleString()} ·{" "}
                          {run.id.slice(0, 8)}
                        </small>
                        <h3>{run.title}</h3>
                      </div>
                      <span className={`co-action-status state-${runStatus(run)}`}>
                        {statusLabels[runStatus(run)]}
                      </span>
                      <button
                        className="co-button"
                        onClick={() => setInspection({ runId: run.id })}
                      >
                        Logs & output
                      </button>
                      {["running", "awaiting_approval", "queued"].includes(runStatus(run)) && (
                        <button
                          className="co-button"
                          onClick={() => updateRun(run.id, cancelRehearsal)}
                        >
                          <Square size={12} />
                          Cancel rehearsal
                        </button>
                      )}
                    </header>
                    {filter === "history" ? (
                      <ol className="co-decision-log">
                        {run.events.map((event, i) => (
                          <li key={i}>
                            <time>{new Date(event.at).toLocaleTimeString()}</time>
                            <span>{event.text}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="co-run-actions">
                        {run.actions.map((action) => (
                          <div className="co-run-action" key={action.id}>
                            <div>
                              <strong>{action.label}</strong>
                              <small>{action.performers.join(", ") || "No performers"}</small>
                              <span className={`co-action-status state-${action.status}`}>
                                {statusLabels[action.status]}
                              </span>
                              <button
                                className="co-button"
                                onClick={() =>
                                  setInspection({ runId: run.id, actionId: action.id })
                                }
                              >
                                Inspect action
                              </button>
                            </div>
                            {action.status === "awaiting_approval" && (
                              <button
                                className="co-button"
                                onClick={() =>
                                  setFilter(
                                    action.gates.find((g) => g.decision === "pending")?.reviewer
                                      .kind === "agent"
                                      ? "agent"
                                      : "human",
                                  )
                                }
                              >
                                Review pending action
                              </button>
                            )}
                            {action.status === "running" && (
                              <SampleCompletion
                                complete={(outcome, output) =>
                                  updateRun(run.id, (r) =>
                                    finishRehearsalAction(r, action.id, outcome, output),
                                  )
                                }
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              {!runs.length && (
                <div className="co-activity-empty">
                  <Play size={24} />
                  <h3>No rehearsal is running.</h3>
                  <p>Choose a saved task to test its gates and handoffs.</p>
                </div>
              )}
              {runs.length > 0 &&
                !runs.some(
                  (run) =>
                    matches(`${run.title} ${run.actions.map((a) => a.label).join(" ")}`) &&
                    (filter !== "running" || run.actions.some((a) => a.status === "running")),
                ) && <p>No matching rehearsals.</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ReviewCard({
  run,
  action,
  gate,
  decide,
}: {
  run: RehearsalRun;
  action: RehearsalAction;
  gate: ReviewGate;
  decide: (approve: boolean, note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <article className="co-review-card">
      <header>
        <ShieldCheck size={20} />
        <div>
          <small>SIMULATED APPROVAL REQUEST · {run.id.slice(0, 8)}</small>
          <h3>{action.label}</h3>
        </div>
        <em>{gate.reviewer.kind === "human" ? "Needs you" : `Reviewer: ${gate.reviewerName}`}</em>
      </header>
      <dl>
        <div>
          <dt>Task</dt>
          <dd>{run.title}</dd>
        </div>
        <div>
          <dt>Performers</dt>
          <dd>{action.performers.join(", ")}</dd>
        </div>
        <div>
          <dt>Proposed action</dt>
          <dd>{action.description}</dd>
        </div>
        <div>
          <dt>Permission scope</dt>
          <dd>This action only, in this rehearsal. No external permission is granted.</dd>
        </div>
      </dl>
      <label>
        Decision note
        <input
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Required when rejecting"
        />
      </label>
      <footer>
        <button className="co-button" disabled={!note.trim()} onClick={() => decide(false, note)}>
          <X size={14} />
          {gate.reviewer.kind === "agent" ? "Simulate agent rejection" : "Reject rehearsal action"}
        </button>
        <button className="co-button co-button-primary" onClick={() => decide(true, note)}>
          <Check size={14} />
          {gate.reviewer.kind === "agent" ? "Simulate agent approval" : "Approve rehearsal action"}
        </button>
      </footer>
    </article>
  );
}

function SampleCompletion({
  complete,
}: {
  complete: (outcome: "success" | "failure", output: unknown) => void;
}) {
  const [text, setText] = useState("{}");
  let output: unknown,
    error = false;
  try {
    output = JSON.parse(text);
  } catch {
    error = true;
  }
  return (
    <details className="co-sample-completion">
      <summary>Set sample outcome</summary>
      <label>
        Sample result JSON
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {error && <p role="alert">Enter valid JSON.</p>}
      <div>
        <button className="co-button" disabled={error} onClick={() => complete("failure", output)}>
          Simulate failure
        </button>
        <button className="co-button" disabled={error} onClick={() => complete("success", output)}>
          Simulate success
        </button>
      </div>
    </details>
  );
}
