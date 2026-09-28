import { useState } from "react";
import { controlLive, isActiveRun, type LiveRun } from "../engines/live-runtime";
import { StatusPill, type CanvasStatus } from "../canvas/CanvasKit";
import { nodeSteps } from "../canvas/run-state";
import { blockNames, type CanvasNode } from "./task-canvas-model";

const runStatus = (run: LiveRun): CanvasStatus =>
  run.status === "awaiting_approval"
    ? "approval"
    : isActiveRun(run)
      ? "working"
      : run.status === "completed"
        ? "done"
        : run.status === "failed"
          ? "failed"
          : "skipped";

/** Inspector content for Run mode: the whole run, or the selected block's part of it. */
export function WorkflowRunPanel({
  run,
  node,
  status,
  runAgain,
}: {
  run: LiveRun | undefined;
  node: CanvasNode | undefined;
  status: CanvasStatus | undefined;
  runAgain?: (() => void) | undefined;
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
          Run this workflow to watch each block light up as it works, waits for approval, finishes,
          or fails.
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
    run.approvals.length && (!node || status === "approval") ? (
      <section className="ck-section">
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
            </div>
          </div>
        ))}
      </section>
    ) : null;
  if (node) {
    const steps = nodeSteps(run, node.id);
    return (
      <>
        <h3>{node.title || blockNames[node.kind]}</h3>
        {status ? (
          <StatusPill status={status} />
        ) : (
          <p className="ck-empty">
            {blockNames[node.kind]} blocks feed the steps they are attached to and have no run
            status of their own.
          </p>
        )}
        {approvals}
        {steps.map((step) => {
          const result = run.results.find((r) => r.id === step.id);
          return (
            <section className="ck-section" key={step.id}>
              <span>
                {step.label} · {step.engine}
              </span>
              {result?.output ? (
                <pre className="ck-output">{result.output}</pre>
              ) : (
                <p className="ck-empty">
                  {result?.status === "running"
                    ? "Working…"
                    : result?.status === "skipped"
                      ? "Skipped: its condition was not met."
                      : result
                        ? "No output recorded."
                        : "Not started."}
                </p>
              )}
            </section>
          );
        })}
        {error && <p className="ck-error">{error}</p>}
      </>
    );
  }
  return (
    <>
      <h3>{run.request.title}</h3>
      <StatusPill status={runStatus(run)} />
      <p className="ck-empty">
        Started {new Date(run.createdAt).toLocaleString()} · updated{" "}
        {new Date(run.updatedAt).toLocaleTimeString()}. Select a block to see its output.
      </p>
      {run.error && <p className="ck-error">{run.error}</p>}
      {approvals}
      {run.output && (
        <section className="ck-section">
          <span>Result</span>
          <pre className="ck-output">{run.output}</pre>
        </section>
      )}
      <section className="ck-section">
        <span>Run log · {run.events.length}</span>
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
      </section>
      <div className="ck-actions">
        {isActiveRun(run) ? (
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
