import { useState } from "react";
import { AlwaysAllowButton } from "../engines/AlwaysAllowButton";
import { controlLive, isActiveRun, type LiveRun } from "../engines/live-runtime";
import { StatusPill, type CanvasStatus } from "../canvas/CanvasKit";
import { nodeSteps } from "../canvas/run-state";
import { blockNames, type CanvasNode } from "./task-canvas-model";
import { RunOutcome } from "../engines/RunOutcome";
import { stripMemoryBlocks } from "../memory/run-learning";
import { AssistantMessage } from "../../shared/AssistantMessage";

export const runCanvasStatus = (run: LiveRun): CanvasStatus =>
  run.status === "awaiting_approval"
    ? "approval"
    : isActiveRun(run)
      ? "working"
      : run.status === "completed"
        ? "done"
        : run.status === "failed"
          ? "failed"
          : "skipped";

const stepStatus = (run: LiveRun, stepId: string): CanvasStatus => {
  const result = run.results.find((r) => r.id === stepId);
  if (!result) return isActiveRun(run) ? "waiting" : "skipped";
  if (result.status === "running")
    return run.status === "awaiting_approval" ? "approval" : "working";
  if (result.status === "completed") return "done";
  if (result.status === "failed") return "failed";
  return "skipped";
};

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * Inspector content for Run mode. The workflow block (or no selection) shows the whole run with
 * every step's status and output; other blocks show their own part of it. A run picker lets you
 * look back at previous runs on the same canvas.
 */
export function WorkflowRunPanel({
  runs,
  run,
  selectRun,
  node,
  isRoot,
  status,
  runAgain,
  runFrom,
}: {
  runs: LiveRun[];
  run: LiveRun | undefined;
  selectRun: (id: string) => void;
  node: CanvasNode | undefined;
  isRoot: boolean;
  status: CanvasStatus | undefined;
  runAgain?: (() => void) | undefined;
  runFrom?: ((stepId: string) => void) | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function control(approvalId?: string, allow?: boolean) {
    if (!run) return;
    setBusy(true);
    setError("");
    try {
      await controlLive(run.request.id, approvalId, allow);
    } catch (cause) {
      setError(String(cause).replace(/^Error: /, ""));
    } finally {
      setBusy(false);
    }
  }
  if (!run)
    return (
      <>
        <h3>Not run yet</h3>
        <p className="ck-empty">
          Press Save & run to start it. Each block lights up as it works, waits for approval,
          finishes, or fails, and its output appears here.
        </p>
        {runAgain && (
          <div className="ck-actions">
            <button type="button" className="co-button co-button-primary" onClick={runAgain}>
              Save & run
            </button>
          </div>
        )}
      </>
    );
  const approvals =
    run.approvals.length > 0 ? (
      <section className="ck-section ck-approvals">
        <span>Needs your approval</span>
        {run.approvals.map((approval) => (
          <div key={approval.id} className="ck-section">
            <strong>{approval.title}</strong>
            <pre className="ck-output">{approval.detail}</pre>
            <div className="ck-actions">
              <button
                type="button"
                className="co-button co-button-primary"
                disabled={busy}
                onClick={() => void control(approval.id, true)}
              >
                Approve once
              </button>
              <button
                type="button"
                className="co-button"
                disabled={busy}
                onClick={() => void control(approval.id, false)}
              >
                Reject
              </button>
              <AlwaysAllowButton run={run} approval={approval} disabled={busy} onError={setError} />
            </div>
          </div>
        ))}
      </section>
    ) : null;
  const picker = (
    <label className="ck-run-picker">
      <span>Viewing</span>
      <select value={run.request.id} onChange={(event) => selectRun(event.target.value)}>
        {runs.map((item, index) => (
          <option key={item.request.id} value={item.request.id}>
            {index === 0 ? "Latest · " : ""}
            {when(item.createdAt)} · {item.status.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
  const step = (stepId: string, label: string, engine: string, open: boolean) => {
    const result = run.results.find((r) => r.id === stepId);
    const state = stepStatus(run, stepId);
    return (
      <details className="ck-step" key={stepId} open={open}>
        <summary>
          <span>{label}</span>
          <small>{engine}</small>
          <StatusPill status={state} />
        </summary>
        {runFrom && !isActiveRun(run) && (
          <div className="ck-actions">
            <button type="button" className="co-button" onClick={() => runFrom(stepId)}>
              Run from here
            </button>
          </div>
        )}
        {result?.output ? (
          <pre className="ck-output">{stripMemoryBlocks(result.output)}</pre>
        ) : (
          <p className="ck-empty">
            {state === "working"
              ? "Working…"
              : state === "skipped"
                ? "Skipped: its condition was not met."
                : state === "waiting"
                  ? "Waiting for earlier steps."
                  : "No output recorded."}
          </p>
        )}
      </details>
    );
  };

  if (node && !isRoot) {
    const steps = nodeSteps(run, node.id);
    return (
      <>
        {picker}
        <h3>{node.title || blockNames[node.kind]}</h3>
        {status ? (
          <StatusPill status={status} />
        ) : (
          <p className="ck-empty">
            {blockNames[node.kind]} blocks give the steps they are attached to extra context or
            limits; they don’t run on their own. Select the workflow block to see the whole run.
          </p>
        )}
        {status === "approval" && approvals}
        {steps.map((s) => step(s.id, s.label, s.engine, true))}
        {error && <p className="ck-error">{error}</p>}
      </>
    );
  }
  const active = isActiveRun(run);
  const current = run.request.steps.find(
    (s) => run.results.find((r) => r.id === s.id)?.status === "running",
  );
  return (
    <>
      {picker}
      <h3>{run.request.title}</h3>
      <StatusPill status={runCanvasStatus(run)} />
      <p className="ck-empty">
        Started {when(run.createdAt)} · updated {new Date(run.updatedAt).toLocaleTimeString()}
        {current ? ` · now on “${current.label}”` : ""}
      </p>

      {run.error && <p className="ck-error">{run.error}</p>}
      {approvals}
      <RunOutcome run={run} />
      {run.output && (
        <section className="ck-section ck-result">
          <span>Result</span>
          <AssistantMessage text={run.output} />
        </section>
      )}
      <details className="ck-section ck-log-toggle" open={active || !!run.error}>
        <summary>Steps · {run.request.steps.length}</summary>
        {run.request.steps.map((s) =>
          step(
            s.id,
            s.label,
            s.engine,
            stepStatus(run, s.id) === "working" || stepStatus(run, s.id) === "failed",
          ),
        )}
      </details>
      <details className="ck-section ck-log-toggle">
        <summary>Run log · {run.events.length}</summary>
        {run.events.length ? (
          <ol className="ck-log">
            {run.events.map((event, index) => (
              <li key={index}>
                <time>{new Date(event.at).toLocaleTimeString()}</time>
                <span>{event.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="ck-empty">No events recorded yet.</p>
        )}
      </details>
      <div className="ck-actions">
        {active ? (
          <button
            type="button"
            className="co-button"
            disabled={busy}
            onClick={() => void control()}
          >
            Stop run
          </button>
        ) : (
          runAgain && (
            <button type="button" className="co-button co-button-primary" onClick={runAgain}>
              Run again
            </button>
          )
        )}
      </div>
      {error && <p className="ck-error">{error}</p>}
    </>
  );
}
