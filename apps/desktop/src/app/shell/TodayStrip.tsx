import type { Company } from "../../features/company/company-model";
import { isActiveRun, useLiveRuntime } from "../../features/engines/live-runtime";
import { schedulePreview } from "../../features/tasks/task-workflow";
import { userRuns, type ActivityFilter } from "./SectionSidebar";

/** One line that answers "what needs me?" above the company map. */
export function TodayStrip({
  company,
  openActivity,
  openWorkflow,
}: {
  company: Company;
  openActivity: (filter: ActivityFilter) => void;
  openWorkflow: (id: string) => void;
}) {
  const live = useLiveRuntime();
  const runs = userRuns(live.runs);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const needs = runs.reduce((n, r) => n + r.approvals.length, 0);
  const running = runs.filter(isActiveRun).length;
  const failed = runs.filter((r) => r.status === "failed" && r.updatedAt >= start.getTime()).length;
  const done = runs.filter(
    (r) => r.status === "completed" && r.updatedAt >= start.getTime(),
  ).length;
  const next = (company.tasks || [])
    .filter((t) => t.schedule?.kind === "cron")
    .map((t) => ({ task: t, at: schedulePreview(t.schedule!).dates[0] }))
    .filter((entry): entry is { task: typeof entry.task; at: string } => !!entry.at)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  return (
    <div className="sh-today" role="group" aria-label="Today">
      <button data-tone={needs ? "approval" : undefined} onClick={() => openActivity("needs")}>
        <strong>{needs}</strong> need you
      </button>
      <button data-tone={running ? "working" : undefined} onClick={() => openActivity("running")}>
        <strong>{running}</strong> running
      </button>
      <button onClick={() => openActivity("finished")}>
        <strong>{done}</strong> done today
      </button>
      <button data-tone={failed ? "failed" : undefined} onClick={() => openActivity("failed")}>
        <strong>{failed}</strong> failed today
      </button>
      {next && (
        <button className="sh-today-next" onClick={() => openWorkflow(next.task.id)}>
          Next: <strong>{next.task.title}</strong> ·{" "}
          {new Date(next.at).toLocaleString(undefined, {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        </button>
      )}
    </div>
  );
}
