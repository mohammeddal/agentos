import type { LiveRun } from "./live-runtime";

export type RunFilter = "all" | "attention" | "active" | "finished";
export const runFilters: { id: RunFilter; label: string }[] = [
  { id: "all", label: "All runs" },
  { id: "attention", label: "Needs attention" },
  { id: "active", label: "Running" },
  { id: "finished", label: "Finished" },
];
const stopped = (run: LiveRun) => ["canceled", "cancelled", "rejected"].includes(run.status);
const needsAttention = (run: LiveRun) =>
  ["failed", "interrupted"].includes(run.status) || (!!run.error && !stopped(run));
export function matchesRunFilter(run: LiveRun, filter: RunFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention")
    return run.approvals.length > 0 || run.status === "awaiting_approval" || needsAttention(run);
  if (filter === "active") return ["starting", "running"].includes(run.status);
  return run.status === "completed" || stopped(run);
}
export function latestRun(runs: LiveRun[], key: string): LiveRun | undefined {
  return runs
    .filter((r) => r.request.key === key)
    .reduce<
      LiveRun | undefined
    >((latest, run) => (!latest || run.createdAt > latest.createdAt ? run : latest), undefined);
}
export function runLabel(run: LiveRun | undefined): string {
  if (!run) return "Planned";
  if (run.approvals.length || run.status === "awaiting_approval") return "Needs approval";
  if (needsAttention(run)) return "Needs attention";
  return run.status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function plainText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/```(?:\w+)?/g, " ")
    .replace(/^[\s]*[-+*#>]+\s*/gm, "")
    .replace(/[`*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A calm, single-line activity summary; full evidence remains in the expanded run. */
export function runSummary(run: LiveRun, limit = 220): string {
  const source =
    run.output || run.error || [...run.results].reverse().find((result) => result.output)?.output;
  const summary = plainText(source || "");
  if (summary)
    return summary.length > limit ? `${summary.slice(0, limit - 1).trimEnd()}…` : summary;
  if (run.approvals.length)
    return `Waiting for approval: ${run.approvals[0]?.title || "review required"}.`;
  if (["starting", "running"].includes(run.status)) return "Work is in progress.";
  if (run.status === "awaiting_approval") return "Waiting for approval.";
  if (["canceled", "cancelled", "rejected"].includes(run.status))
    return "Stopped before completion.";
  return run.status === "completed" ? "Completed without a text response." : "No output yet.";
}
