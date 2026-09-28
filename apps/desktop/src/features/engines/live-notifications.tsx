import { useEffect, useRef, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { isTauri } from "@tauri-apps/api/core";
import { isActiveRun, useLiveRuntime } from "./live-runtime";

const KEY = "agentos:notifications:v1";
function enabled() {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}
export function NotificationSettings() {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState("");
  async function toggle() {
    try {
      if (!on && !(await isPermissionGranted()) && (await requestPermission()) !== "granted")
        throw new Error(
          "Notifications were not allowed. Enable AgentOS in macOS System Settings → Notifications.",
        );
      localStorage.setItem(KEY, String(!on));
      setOn(!on);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <div className="co-live-engine">
      <strong>Mac notifications</strong>
      <button className="co-button" disabled={!isTauri()} onClick={() => void toggle()}>
        {on ? "Turn off notifications" : "Enable notifications"}
      </button>
      <small>
        Notify when a run finishes, fails, or needs approval. Notification text excludes your
        prompts and output.
      </small>
      {error && (
        <p role="alert" className="co-form-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function useLiveNotifications() {
  const { runs } = useLiveRuntime();
  const seen = useRef(new Map<string, string>());
  const initialized = useRef(false);
  useEffect(() => {
    for (const run of runs) {
      const previous = seen.current.get(run.request.id);
      const status = `${run.status}:${run.approvals.map((a) => a.id).join(",")}`;
      if (
        initialized.current &&
        previous !== status &&
        enabled() &&
        (run.approvals.length || !isActiveRun(run))
      ) {
        void isPermissionGranted()
          .then((allowed) => {
            if (allowed)
              sendNotification({
                title: "AgentOS",
                body: run.approvals.length
                  ? "A run needs your approval. Open AgentOS to review it."
                  : `A run ${run.status}. Open AgentOS for its result.`,
              });
          })
          .catch(() => {});
      }
      seen.current.set(run.request.id, status);
    }
    if (runs.length) initialized.current = true;
  }, [runs]);
}
