import { useState } from "react";
import { AlwaysAllowButton } from "../engines/AlwaysAllowButton";
import { ArrowRight, Inbox as InboxIcon, MessageSquare, ShieldAlert, XCircle } from "lucide-react";
import { controlLive, useLiveRuntime, type LiveRun } from "../engines/live-runtime";
import "./inbox.css";

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const source = (run: LiveRun) =>
  run.request.key.startsWith("chat:") ? "Chat" : run.request.steps.length > 1 ? "Workflow" : "Task";

/** Everything waiting on the user across chats, workflows, and agents on the map. */
export function Inbox({ openRun }: { openRun: (runKey: string) => void }) {
  const live = useLiveRuntime();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const waiting = live.runs
    .filter((run) => run.approvals.length)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const failed = live.runs
    .filter((run) => run.status === "failed" && run.updatedAt > dayAgo)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10);
  async function decide(run: LiveRun, approvalId: string, allow: boolean) {
    setBusy(approvalId);
    setError("");
    try {
      await controlLive(run.request.id, approvalId, allow);
    } catch (cause) {
      setError(String(cause).replace(/^Error: /, ""));
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="co-inbox" aria-label="Inbox">
      {error && (
        <p className="co-form-error" role="alert">
          {error}
        </p>
      )}
      <h2>Waiting for you · {waiting.reduce((n, run) => n + run.approvals.length, 0)}</h2>
      {waiting.length ? (
        waiting.flatMap((run) =>
          run.approvals.map((approval) => (
            <article key={`${run.request.id}:${approval.id}`} className="co-inbox-item">
              <ShieldAlert size={16} />
              <div>
                <small>
                  {source(run)} · {run.request.title} · {when(run.updatedAt)}
                </small>
                <strong>{approval.title}</strong>
                <details>
                  <summary>Details</summary>
                  <pre>{approval.detail}</pre>
                </details>
              </div>
              <div className="co-inbox-actions">
                <button
                  className="co-button co-button-primary"
                  disabled={busy === approval.id}
                  onClick={() => void decide(run, approval.id, true)}
                >
                  Approve once
                </button>
                <button
                  className="co-button"
                  disabled={busy === approval.id}
                  onClick={() => void decide(run, approval.id, false)}
                >
                  Reject
                </button>
                <AlwaysAllowButton
                  run={run}
                  approval={approval}
                  disabled={busy === approval.id}
                  onError={setError}
                />
                <button
                  className="co-icon-button"
                  aria-label={`Open ${run.request.title}`}
                  title="Open"
                  onClick={() => openRun(run.request.key)}
                >
                  <ArrowRight size={14} />
                </button>
              </div>
            </article>
          )),
        )
      ) : (
        <div className="co-inbox-empty">
          <InboxIcon size={22} />
          <p>Nothing needs your approval right now.</p>
        </div>
      )}
      {failed.length > 0 && (
        <>
          <h2>Failed in the last day · {failed.length}</h2>
          {failed.map((run) => (
            <article key={run.request.id} className="co-inbox-item" data-kind="failed">
              {run.request.key.startsWith("chat:") ? (
                <MessageSquare size={16} />
              ) : (
                <XCircle size={16} />
              )}
              <div>
                <small>
                  {source(run)} · {when(run.updatedAt)}
                </small>
                <strong>{run.request.title}</strong>
                <p>{run.error.slice(0, 240)}</p>
              </div>
              <div className="co-inbox-actions">
                <button className="co-button" onClick={() => openRun(run.request.key)}>
                  Open <ArrowRight size={13} />
                </button>
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
