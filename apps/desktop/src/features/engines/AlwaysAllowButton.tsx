import { approveAlways, type LiveRun } from "./live-runtime";
import { scopeLabel } from "./provider-permissions";

/** "Always allow" for approvals that have a reusable scope (an MCP server, tool, or program). */
export function AlwaysAllowButton({
  run,
  approval,
  disabled,
  onError,
}: {
  run: LiveRun;
  approval: LiveRun["approvals"][number];
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  if (!approval.scope) return null;
  const scope = approval.scope;
  return (
    <button
      type="button"
      className="co-button"
      disabled={disabled}
      title={`Approve now and stop asking for ${scopeLabel(scope)}. Undo in Settings.`}
      onClick={() =>
        void approveAlways(run.request.id, approval.id, scope).catch((cause) =>
          onError?.(String(cause).replace(/^Error: /, "")),
        )
      }
    >
      Always allow
    </button>
  );
}
