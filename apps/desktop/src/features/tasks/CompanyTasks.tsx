import { useEffect, useMemo, useState } from "react";
import { ArrowRight, GitBranch } from "lucide-react";
import {
  taskParticipants,
  type Company,
  type CompanyTask,
  type TaskAssignment,
} from "../company/company-model";
import "./company-tasks.css";
import { isActiveRun, useLiveRuntime } from "../engines/live-runtime";
import { latestRun } from "../engines/run-presentation";
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
  start?: ((task: CompanyTask) => Promise<void>) | undefined;
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
  const lastRun = latestRun(live.runs, `task:${taskId}`);
  const [mode, setMode] = useState<"build" | "run">(() =>
    lastRun && isActiveRun(lastRun) ? "run" : "build",
  );
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
  const hasAssignment = assignment.targets.length > 0;
  const hasTitle = !!resolvedTitle;
  const assignmentValid = hasTitle && hasAssignment;
  const gateError = approvalError(
    company,
    approval,
    team.map((a) => a.id),
  );
  const canSave = assignmentValid && !scheduleResult.error && !handoffError && !gateError;
  const saveBlocker = !hasAssignment
    ? "Connect an office or agent first."
    : !hasTitle
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
    ...(existing?.officeId || initialOfficeId
      ? { officeId: (existing?.officeId || initialOfficeId)! }
      : {}),
    schedule,
    handoffs: canvas ? [] : handoffs,
    approval,
    ...(canvas ? { canvas } : {}),
  };
  async function submitTask(run: boolean) {
    if (!canSave || attaching || submitting) return;
    setSubmitting(run ? "start" : "save");
    setSubmitError("");
    try {
      if (run && start) {
        await start(draftTask);
        setMode("run");
      } else save(draftTask);
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
            run={lastRun}
            runAgain={start && canSave ? () => void submitTask(true) : undefined}
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
        <p>
          {schedule.kind === "cron" ? (
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
            disabled={!canSave || attaching || !!submitting}
            title={saveBlocker || undefined}
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
