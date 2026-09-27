import { useEffect, useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { schedulePreview, type TaskSchedule } from "../tasks/task-workflow";
import { refreshRequestMemory, startLive, type LiveRequest } from "./live-runtime";
import { activeCompany } from "../company/company-directory";
import { isCompany } from "../company/company-model";

const KEY = "agentos:live-schedules:v1";
export type LiveSchedule = {
  taskId: string;
  schedule: TaskSchedule;
  request: LiveRequest;
  next: string;
  enabled: boolean;
  error: string;
};
function load(): LiveSchedule[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value)
      ? value.filter(
          (s): s is LiveSchedule =>
            !!s &&
            typeof s.taskId === "string" &&
            typeof s.enabled === "boolean" &&
            typeof s.next === "string" &&
            Number.isFinite(Date.parse(s.next)) &&
            s.schedule?.kind === "cron" &&
            !schedulePreview(s.schedule).error &&
            s.request?.mode === "task" &&
            s.request.key === `task:${s.taskId}` &&
            Array.isArray(s.request.steps),
        )
      : [];
  } catch {
    return [];
  }
}
let schedules = load();
const listeners = new Set<() => void>();
let ticking = false;
function save(next: LiveSchedule[]) {
  localStorage.setItem(KEY, JSON.stringify(next));
  schedules = next;
  listeners.forEach((fn) => fn());
}
export function setSchedule(taskId: string, schedule: TaskSchedule, request: LiveRequest) {
  if (!isTauri()) throw new Error("Scheduling requires the installed Mac app.");
  const preview = schedulePreview(schedule);
  if (preview.error || !preview.dates[0])
    throw new Error(preview.error || "Choose a cron schedule first.");
  save([
    ...schedules.filter((s) => s.taskId !== taskId),
    { taskId, schedule, request, next: preview.dates[0], enabled: true, error: "" },
  ]);
}
export function pauseSchedule(taskId: string) {
  save(schedules.map((s) => (s.taskId === taskId ? { ...s, enabled: false } : s)));
}
export function useScheduleState() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => schedules,
  );
}
export function useLiveSchedules() {
  useEffect(() => {
    if (!isTauri()) return;
    async function tick() {
      if (ticking) return;
      ticking = true;
      try {
        for (const item of schedules.filter((s) => s.enabled && Date.parse(s.next) <= Date.now())) {
          const due = item.next;
          const next = schedulePreview(item.schedule).dates[0];
          if (!next) {
            pauseSchedule(item.taskId);
            continue;
          }
          // Advance durably before dispatch. No replay storm after sleep or app restart.
          save(schedules.map((s) => (s.taskId === item.taskId ? { ...s, next } : s)));
          if (Date.now() - Date.parse(due) > 60000) continue;
          try {
            const request = await refreshRequestMemory({
              ...item.request,
              id: `schedule-${item.taskId}-${Date.parse(due)}`,
            });
            // A user can archive/pause while memory is loading. Recheck immediately before dispatch.
            if (
              !schedules.some(
                (s) => s.taskId === item.taskId && s.enabled && s.request.id === item.request.id,
              )
            )
              continue;
            const saved: unknown = JSON.parse(localStorage.getItem("agentos:company:v1") || "null");
            if (
              !isCompany(saved) ||
              !activeCompany(saved).tasks?.some((t) => t.id === item.taskId)
            ) {
              pauseSchedule(item.taskId);
              continue;
            }
            await startLive(request);
          } catch (e) {
            save(
              schedules.map((s) =>
                s.taskId === item.taskId ? { ...s, enabled: false, error: String(e) } : s,
              ),
            );
          }
        }
      } finally {
        ticking = false;
      }
    }
    const timer = setInterval(() => void tick(), 15000);
    void tick();
    return () => clearInterval(timer);
  }, []);
}
