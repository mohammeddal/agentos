import type { LiveRun } from "../engines/live-runtime";

const active = (run: LiveRun) => ["starting", "running", "awaiting_approval"].includes(run.status);
const runToken = (run: LiveRun) => `run:${run.request.id}`;
const approvalToken = (run: LiveRun, approvalId: string) =>
  `approval:${run.request.id}:${approvalId}`;

/** Tokens currently worth surfacing in the Activity navigation badge. */
export function activityBadgeTokens(runs: LiveRun[]): string[] {
  return runs.flatMap((run) =>
    run.approvals.length
      ? run.approvals.map((approval) => approvalToken(run, approval.id))
      : active(run)
        ? [runToken(run)]
        : [],
  );
}

/** Opening Activity acknowledges both the active run and its current approval requests. */
export function activityAcknowledgementTokens(runs: LiveRun[]): string[] {
  return runs.flatMap((run) =>
    active(run)
      ? [runToken(run), ...run.approvals.map((approval) => approvalToken(run, approval.id))]
      : [],
  );
}

export function unreadActivityCount(runs: LiveRun[], acknowledged: ReadonlySet<string>): number {
  return activityBadgeTokens(runs).filter((token) => !acknowledged.has(token)).length;
}
