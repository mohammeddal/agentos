import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, GitBranch } from "lucide-react";
import {
  taskParticipants,
  type Company,
  type CompanyTask,
  type TaskAssignment,
} from "../company/company-model";
import "./company-tasks.css";
import { isActiveRun, taskRunError, useLiveRuntime } from "../engines/live-runtime";
import type { ModelChoice } from "../engines/model-choice";
import type { StepModelChoice } from "../engines/model-choice";
import { approvalError, type ApprovalRule } from "./task-approvals";
import { ScheduleEditor, WorkflowEditor } from "./TaskAutomation";
import { TaskCanvas, type ResourceSetupKind } from "./TaskCanvas";
import type { Engine } from "../engines/engine-inventory";
import {
  inferredTaskTitle,
  taskCanvasAssignment,
  taskCanvasFromAssignment,
  type TaskCanvasGraph,
} from "./task-canvas-model";
import {
  schedulePreview,
  workflowError,
  type HandoffStep,
  type TaskSchedule,
} from "./task-workflow";

export function TaskForm({
  company,
  existing,
  initialDomain,
  initialProjectId,
  initialAgentId,
  initialOfficeId,
  save,
  start,
  storageError,
  openResourceSettings,
}: {
  company: Company;
  existing: CompanyTask | undefined;
  initialDomain: string | undefined;
  initialProjectId?: string | undefined;
  initialAgentId?: string | undefined;
  initialOfficeId?: string | undefined;
  save: (task: CompanyTask) => void;
  start?: ((task: CompanyTask, fromStepId?: string) => Promise<void>) | undefined;
  storageError: boolean;
  openResourceSettings?: (task: CompanyTask, kind: ResourceSetupKind, engine: Engine) => void;
}) {
  const [taskId] = useState(() => existing?.id || crypto.randomUUID());
  const [createdAt] = useState(() => existing?.createdAt || new Date().toISOString());
  const [title, setTitle] = useState(existing?.title || "");
  const [brief, setBrief] = useState(existing?.brief || "");
  const [attachments, setAttachments] = useState(existing?.attachments || []);
  const [attaching, setAttaching] = useState(false);
  const [modelDefaults, setModelDefaults] = useState<Record<string, ModelChoice>>(
    existing?.modelDefaults || {},
  );
  const [stepModels, setStepModels] = useState<Record<string, StepModelChoice>>(
    existing?.stepModels || {},
  );
  const [projectId, setProjectId] = useState(existing?.projectId || initialProjectId || "");
  const [directory, setDirectory] = useState(existing?.directory || "");
  const [approval, setApproval] = useState<ApprovalRule>(existing?.approval || { kind: "none" });
  const [schedule, setSchedule] = useState<TaskSchedule>(existing?.schedule || { kind: "manual" });
  const [handoffs, setHandoffs] = useState<HandoffStep[]>(existing?.handoffs || []);
  const [seedAssignment] = useState<TaskAssignment>(() =>
    existing?.assignment
      ? existing.assignment
      : initialAgentId
        ? { kind: "agents", targets: [initialAgentId] }
        : initialDomain
          ? { kind: "domains", targets: [initialDomain] }
          : { kind: "agents", targets: [] },
  );
  const [canvas, setCanvas] = useState<TaskCanvasGraph | undefined>(() => {
    if (existing?.canvas) return existing.canvas;
    if (existing?.handoffs?.length) return undefined;
    return taskCanvasFromAssignment(company, {
      id: taskId,
      title,
      brief,
      assignment: seedAssignment,
      status: "planned",
      createdAt,
    });
  });
  const [previewTime, setPreviewTime] = useState(() => new Date());
  const [submitting, setSubmitting] = useState<"save" | "start" | "">("");
  const [submitError, setSubmitError] = useState("");
  const live = useLiveRuntime();
  const taskRuns = live.runs
    .filter((r) => r.request.key === `task:${taskId}`)
    .sort((a, b) => b.createdAt - a.createdAt);
  const [viewRunId, setViewRunId] = useState("");
  const lastRun = taskRuns[0];
  const viewedRun = taskRuns.find((r) => r.request.id === viewRunId) || lastRun;
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [mode, setMode] = useState<"build" | "run">(() =>
    lastRun && isActiveRun(lastRun) ? "run" : "build",
  );
  // When a run finishes, show its result instead of leaving the user in the builder.
  const wasActive = useRef(!!lastRun && isActiveRun(lastRun));
  useEffect(() => {
    const active = !!lastRun && isActiveRun(lastRun);
    if (wasActive.current && !active) {
      setViewRunId("");
      setMode("run");
    }
    wasActive.current = active;
  }, [lastRun?.request.id, lastRun?.status]);
  useEffect(() => {
    const timer = window.setInterval(() => setPreviewTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const scheduleResult = useMemo(
    () => schedulePreview(schedule, previewTime),
    [schedule, previewTime],
  );
  const handoffError = canvas ? null : workflowError(company, taskId, handoffs);
  const assignment = canvas ? taskCanvasAssignment(company, canvas) : seedAssignment;
  const team = taskParticipants(company, assignment);
  const automaticTitle = canvas ? inferredTaskTitle(canvas) : "";
  const resolvedTitle = title.trim() || automaticTitle;
  const hasTitle = !!resolvedTitle;
  const gateError = approvalError(
    company,
    approval,
    team.map((a) => a.id),
  );
  // A workflow may execute directly on Codex or Claude without a company agent.
  // Office and agent blocks are routing choices, not draft requirements.
  const canSave = hasTitle && !scheduleResult.error && !handoffError && !gateError;
  const saveBlocker = !hasTitle
    ? "Add a workflow name first."
    : gateError || scheduleResult.error || handoffError || "";
  function changeCanvas(next: TaskCanvasGraph) {
    const root = next.nodes.find((node) => node.kind === "task");
    setCanvas(next);
    if (root) {
      setTitle(root.title);
      setBrief(root.prompt);
    }
  }
  const draftTask: CompanyTask = {
    id: taskId,
    title: resolvedTitle || "Untitled workflow",
    brief: brief.trim(),
    assignment,
    status: "planned",
    createdAt,
    attachments,
    modelDefaults,
    stepModels,
    ...(projectId ? { projectId } : {}),
    ...(directory ? { directory } : {}),
    ...(existing?.officeId || initialOfficeId
      ? { officeId: (existing?.officeId || initialOfficeId)! }
      : {}),
    schedule,
    handoffs: canvas ? [] : handoffs,
    approval,
    ...(canvas ? { canvas } : {}),
  };
  const executionBlocker = canSave ? taskRunError(company, draftTask) : saveBlocker;
  const canRun = canSave && !executionBlocker;
  async function submitTask(run: boolean, fromStepId?: string) {
    if (!(run ? canRun : canSave) || attaching || submitting) return;
    setSubmitting(run ? "start" : "save");
    setSubmitError("");
    try {
      if (run && start) {
        await start(draftTask, fromStepId);
        setViewRunId("");
        setMode("run");
        setNotice(
          fromStepId ? "Run started from that step." : "Run started. Watch each block in Run.",
        );
      } else {
        save(draftTask);
        setNotice(existing ? "Changes saved." : "Draft saved.");
      }
      setSubmitting("");
    } catch (error) {
      setSubmitError(String(error).replace(/^Error: /, ""));
      setSubmitting("");
    }
  }
  return (
    <form
      className="co-form co-task-form"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLSelectElement)
          event.preventDefault();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void submitTask(schedule.kind === "manual" && !!start);
      }}
    >
      <div className="co-task-panel">
        {canvas ? (
          <TaskCanvas
            embedded
            company={company}
            task={{ ...draftTask, canvas }}
            save={changeCanvas}
            back={() => {}}
            storageError={storageError}
            changeProject={setProjectId}
            changeDirectory={setDirectory}
            changeAttachments={setAttachments}
            onAttachmentsBusy={setAttaching}
            changeApproval={setApproval}
            {...(canSave && openResourceSettings
              ? {
                  openResourceSettings: (kind: ResourceSetupKind, engine: Engine) =>
                    openResourceSettings(draftTask, kind, engine),
                }
              : {})}
            changeTaskDetails={({ title: nextTitle, brief: nextBrief }) => {
              setTitle(nextTitle);
              setBrief(nextBrief);
            }}
            saveModels={(next) => {
              setModelDefaults(next.modelDefaults || {});
              setStepModels(next.stepModels || {});
            }}
            schedule={schedule}
            changeSchedule={setSchedule}
            schedulePreview={scheduleResult}
            mode={mode}
            setMode={setMode}
            run={viewedRun}
            runs={taskRuns}
            selectRun={setViewRunId}
            runAgain={start && canRun ? () => void submitTask(true) : undefined}
            runFrom={start && canRun ? (stepId) => void submitTask(true, stepId) : undefined}
          />
        ) : (
          <>
            <section className="co-workflow-migration">
              <div>
                <strong>Move this workflow to the visual map</strong>
                <p>
                  This older workflow has {handoffs.length} step handoffs. Convert it when you are
                  ready to rebuild those routes visually.
                </p>
              </div>
              <button
                type="button"
                className="co-button"
                onClick={() => {
                  setHandoffs([]);
                  setCanvas(taskCanvasFromAssignment(company, { ...draftTask, handoffs: [] }));
                }}
              >
                <GitBranch size={13} /> Use visual canvas
              </button>
            </section>
            <div className="co-workflow-legacy-basics">
              <label>
                Workflow name
                <input
                  required
                  maxLength={120}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                Workflow outcome
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                />
              </label>
            </div>
            <WorkflowEditor
              company={company}
              taskId={taskId}
              title={title}
              steps={handoffs}
              change={setHandoffs}
              error={handoffError}
            />
            <ScheduleEditor schedule={schedule} change={setSchedule} preview={scheduleResult} />
          </>
        )}
      </div>
      {submitError && (
        <p role="alert" className="co-form-error co-task-submit-error">
          {submitError}
        </p>
      )}
      <div className="co-task-submit">
        <p
          className={
            notice
              ? "co-task-notice"
              : (!canSave && saveBlocker) || (start && !canRun && executionBlocker)
                ? "co-task-blocker"
                : ""
          }
          role="status"
        >
          {notice ? (
            <>✓ {notice}</>
          ) : !canSave && saveBlocker ? (
            <>Can’t save yet: {saveBlocker}</>
          ) : start && !canRun && executionBlocker ? (
            <>Can’t run yet: {executionBlocker} You can still save this draft.</>
          ) : schedule.kind === "cron" ? (
            <>Save the schedule, then enable it when you are ready.</>
          ) : existing ? (
            <>Save changes or run the updated workflow now.</>
          ) : (
            <>Run now, or save it as a draft for later.</>
          )}
        </p>
        <div className="co-task-submit-actions">
          {start && schedule.kind === "manual" && (
            <button
              type="button"
              className="co-button"
              disabled={!canSave || attaching || !!submitting}
              title={saveBlocker || undefined}
              onClick={() => void submitTask(false)}
            >
              {existing ? "Save changes" : "Save draft"}
            </button>
          )}
          <button
            type="submit"
            className="co-button co-button-primary"
            disabled={
              (start && schedule.kind === "manual" ? !canRun : !canSave) ||
              attaching ||
              !!submitting
            }
            title={
              (start && schedule.kind === "manual" ? executionBlocker : saveBlocker) || undefined
            }
          >
            {attaching
              ? "Adding files…"
              : submitting === "start"
                ? "Starting…"
                : submitting === "save"
                  ? "Saving…"
                  : start && schedule.kind === "manual"
                    ? existing
                      ? "Save & run"
                      : "Create & run"
                    : existing
                      ? "Save workflow"
                      : schedule.kind === "cron"
                        ? "Save schedule"
                        : "Create workflow"}
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </form>
  );
}
