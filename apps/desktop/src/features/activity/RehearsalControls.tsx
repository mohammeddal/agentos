import { useState } from "react";
import { Check, ShieldCheck, Square, X } from "lucide-react";
import {
  cancelRehearsal,
  decideRehearsal,
  finishRehearsalAction,
  runStatus,
  type RehearsalAction,
  type RehearsalRun,
  type ReviewGate,
} from "./task-rehearsal";
import "./company-activity.css";

/** Simulated decisions for one rehearsal: pending approvals, sample outcomes, and cancel. */
export function RehearsalControls({
  run,
  update,
}: {
  run: RehearsalRun;
  update: (change: (run: RehearsalRun) => RehearsalRun) => void;
}) {
  const pending = run.actions.flatMap((action) =>
    action.status === "awaiting_approval"
      ? action.gates.filter((g) => g.decision === "pending").map((gate) => ({ action, gate }))
      : [],
  );
  const running = run.actions.filter((a) => a.status === "running");
  const active = ["running", "awaiting_approval", "queued"].includes(runStatus(run));
  if (!active) return null;
  return (
    <div className="co-rehearsal-controls">
      {pending.map(({ action, gate }) => (
        <ReviewCard
          key={`${action.id}:${gate.id}`}
          run={run}
          action={action}
          gate={gate}
          decide={(approve, note) =>
            update((r) =>
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
      {running.map((action) => (
        <div className="co-run-action" key={action.id}>
          <strong>{action.label}</strong>
          <SampleCompletion
            complete={(outcome, output) =>
              update((r) => finishRehearsalAction(r, action.id, outcome, output))
            }
          />
        </div>
      ))}
      <button className="co-button" onClick={() => update(cancelRehearsal)}>
        <Square size={12} />
        Cancel rehearsal
      </button>
    </div>
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
