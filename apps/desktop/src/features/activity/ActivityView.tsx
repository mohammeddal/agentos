import { useState } from "react";
import { describeApproval } from "../engines/approval-text";
import { ArrowUpRight, GitBranch, MessageSquare, MessageSquarePlus, Search } from "lucide-react";
import { useLiveRuntime, type LiveRun } from "../engines/live-runtime";
import { runLabel } from "../engines/run-presentation";
import { WorkflowRunPanel } from "../tasks/WorkflowRunPanel";
import {
  activityFilters,
  matchesFilter,
  userRuns,
  type ActivityFilter,
} from "../../app/shell/SectionSidebar";
import { useResizableWidth } from "../../shared/useResizableWidth";
import "./activity-view.css";

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const state = (run: LiveRun) =>
  run.approvals.length
    ? "approval"
    : ["starting", "running"].includes(run.status)
      ? "working"
      : run.status === "failed"
        ? "failed"
        : run.status === "completed"
          ? "done"
          : "idle";

/**
 * One place for every run: what needs you, what's running, and what finished. Selecting a run
 * opens the same run panel used in the Studio: result, files, steps, then the log.
 */
export function ActivityView({
  filter,
  openRun,
  askAboutRun,
}: {
  filter: ActivityFilter;
  openRun: (run: LiveRun) => void;
  askAboutRun: (run: LiveRun) => void;
}) {
  const live = useLiveRuntime();
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const panel = useResizableWidth("agentos:activity-panel", 440, 320, 760);
  const runs = userRuns(live.runs)
    .filter((run) => matchesFilter(run, filter))
    .filter((run) => run.request.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const selected = runs.find((run) => run.request.id === selectedId) || runs[0];
  const label = activityFilters.find((f) => f.id === filter)?.label || "Runs";
  return (
    <section className="av" style={{ gridTemplateColumns: `minmax(0, 1fr) ${panel.width}px` }}>
      <div className="av-list" role="list" aria-label={label}>
        <header className="av-head">
          <h1>{label}</h1>
          <label className="sh-search">
            <Search size={13} />
            <input
              aria-label="Search runs"
              placeholder="Search runs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </header>
        {runs.map((run) => {
          const Icon = run.request.key.startsWith("chat:") ? MessageSquare : GitBranch;
          return (
            <button
              key={run.request.id}
              role="listitem"
              className="av-row"
              aria-current={selected?.request.id === run.request.id || undefined}
              onClick={() => setSelectedId(run.request.id)}
            >
              <i data-state={state(run)} />
              <Icon size={13} />
              <span>
                <strong>{run.request.title}</strong>
                <small>
                  {run.approvals.length
                    ? describeApproval(run.approvals[0]!).title
                    : run.error
                      ? run.error.slice(0, 120)
                      : `${run.request.steps.length} ${run.request.steps.length === 1 ? "step" : "steps"}`}
                </small>
              </span>
              <em>{runLabel(run)}</em>
              <time>{when(run.updatedAt)}</time>
            </button>
          );
        })}
        {!runs.length && (
          <p className="av-empty">
            {filter === "needs" ? "Nothing needs you right now." : `No ${label.toLowerCase()}.`}
          </p>
        )}
      </div>
      <aside className="av-panel">
        <div
          className="co-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          tabIndex={0}
          onPointerDown={panel.startResize}
        />
        {selected ? (
          <>
            <div className="av-panel-actions">
              <button className="co-button" onClick={() => openRun(selected)}>
                Open {selected.request.key.startsWith("chat:") ? "chat" : "workflow"}{" "}
                <ArrowUpRight size={13} />
              </button>
              <button className="co-button" onClick={() => askAboutRun(selected)}>
                <MessageSquarePlus size={13} /> Ask about this run
              </button>
            </div>
            <div className="st-run">
              <WorkflowRunPanel
                runs={[selected]}
                run={selected}
                selectRun={() => undefined}
                node={undefined}
                isRoot
                status={undefined}
              />
            </div>
          </>
        ) : (
          <p className="av-empty">Select a run to see its result.</p>
        )}
      </aside>
    </section>
  );
}
