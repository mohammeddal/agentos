import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, ClipboardList, GitBranch, Layers3, Users } from "lucide-react";
import {
  taskParticipants,
  type Company,
  type CompanyTask,
  type TaskAssignment,
} from "../company/company-model";
import "./company-tasks.css";
import { useLiveRuntime } from "../engines/live-runtime";
import { latestRun, matchesRunFilter, runLabel, type RunFilter } from "../engines/run-presentation";
import type { ModelChoice } from "../engines/model-choice";
import type { StepModelChoice } from "../engines/model-choice";
import { approvalError, type ApprovalRule } from "./task-approvals";
import { ScheduleEditor, WorkflowEditor } from "./TaskAutomation";
import { TaskCanvas, type ResourceSetupKind } from "./TaskCanvas";
import type { Engine } from "../engines/engine-inventory";
import {
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

const countLabel = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export function CompanyTasks({
  company,
  query,
  edit,
}: {
  company: Company;
  query: string;
  edit: (task: CompanyTask) => void;
}) {
  const live = useLiveRuntime();
  const [statusFilter, setStatusFilter] = useState<RunFilter | "planned">("all");
  const tasks = (company.tasks || []).filter((task) => {
    const team = taskParticipants(company, task.assignment);
    return [
      task.title,
      task.brief,
      company.projects?.find((p) => p.id === task.projectId)?.name || "",
      ...task.assignment.targets,
      ...team.flatMap((a) => [a.name, a.office.name, a.office.domain]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase());
  });
  if (!(company.tasks || []).length)
    return (
      <section className="co-tasks-empty">
        <span>
          <ClipboardList size={30} />
        </span>
        <h2>No tasks yet.</h2>
      </section>
    );
  const matchesStatus = (task: CompanyTask, filter: RunFilter | "planned") => {
    const run = latestRun(live.runs, `task:${task.id}`);
    return (
      filter === "all" || (filter === "planned" ? !run : !!run && matchesRunFilter(run, filter))
    );
  };
  const visible = tasks.filter((task) => matchesStatus(task, statusFilter));
  return (
    <div className="co-task-list">
      <div className="co-work-filters" role="group" aria-label="Filter tasks">
        {(
          [
            { id: "all", label: "All tasks" },
            { id: "attention", label: "Needs attention" },
            { id: "active", label: "Running" },
            { id: "planned", label: "Planned" },
            { id: "finished", label: "Finished" },
          ] as const
        ).map((filter) => (
          <button
            key={filter.id}
            aria-pressed={statusFilter === filter.id}
            onClick={() => setStatusFilter(filter.id)}
          >
            {filter.label}
            <span>{tasks.filter((task) => matchesStatus(task, filter.id)).length}</span>
          </button>
        ))}
      </div>
      {!visible.length && (
        <div className="co-filter-empty">
          <p>
            {query
              ? `No tasks match “${query}” in this view.`
              : statusFilter === "attention"
                ? "No tasks need your attention."
                : "No tasks in this view."}
          </p>
          {statusFilter !== "all" && (
            <button className="co-button" onClick={() => setStatusFilter("all")}>
              Show all tasks
            </button>
          )}
        </div>
      )}
      {visible.map((task) => {
        const team = taskParticipants(company, task.assignment);
        const labels =
          task.assignment.kind === "domains"
            ? task.assignment.targets
            : task.assignment.targets.map(
                (id) => team.find((a) => a.id === id)?.name || "Unavailable agent",
              );
        return (
          <button
            className="co-task-card"
            key={task.id}
            onClick={() => edit(task)}
            aria-label={`Open task: ${task.title}`}
          >
            <span className="co-task-card-icon">
              <ClipboardList size={21} />
            </span>
            <span className="co-task-card-body">
              <span className="co-task-card-heading">
                <strong>{task.title}</strong>
                <em>{runLabel(latestRun(live.runs, `task:${task.id}`))}</em>
              </span>
              <span className="co-task-brief">
                {task.projectId && (
                  <strong>
                    {company.projects?.find((p) => p.id === task.projectId)?.name ||
                      "Unavailable project"}{" "}
                    ·{" "}
                  </strong>
                )}
                {task.brief || "No brief added yet."}
              </span>
              <span className="co-task-targets">
                {task.assignment.kind === "domains" ? <Layers3 size={13} /> : <Users size={13} />}
                {labels.map((label, i) => (
                  <span key={i}>{label}</span>
                ))}
              </span>
              <small>
                {team.length} {team.length === 1 ? "agent" : "agents"} ·{" "}
                {countLabel(new Set(team.map((a) => a.office.id)).size, "office")} ·{" "}
                {task.assignment.kind === "domains" ? "Office team" : "Direct assignment"}
                {!team.length ? " · Needs agents" : ""}
              </small>
              {(task.schedule?.kind === "cron" || !!task.handoffs?.length) && (
                <span className="co-task-automation-summary">
                  {task.schedule?.kind === "cron" && (
                    <>
                      <CalendarClock size={13} />
                      <code>{task.schedule.expression}</code>
                      <span>{task.schedule.timeZone}</span>
                      <em>Schedule draft</em>
                    </>
                  )}
                  {!!task.handoffs?.length && (
                    <>
                      <GitBranch size={13} />
                      <span>{task.handoffs.length} conditional handoffs</span>
                    </>
                  )}
                </span>
              )}
            </span>
            <ArrowRight size={15} />
          </button>
        );
      })}
    </div>
  );
}

export function TaskForm({
  company,
  existing,
  initialDomain,
  initialProjectId,
  initialAgentId,
  save,
  storageError,
  openResourceSettings,
}: {
  company: Company;
  existing: CompanyTask | undefined;
  initialDomain: string | undefined;
  initialProjectId?: string | undefined;
  initialAgentId?: string | undefined;
  save: (task: CompanyTask) => void;
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
  const [panel, setPanel] = useState<"schedule" | "workflow">("workflow");
  const [approval, setApproval] = useState<ApprovalRule>(
    existing?.approval || (existing ? { kind: "none" } : { kind: "human" }),
  );
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
  const assignmentValid = !!title.trim() && assignment.targets.length > 0;
  const gateError = approvalError(
    company,
    approval,
    team.map((a) => a.id),
  );
  const canSave = assignmentValid && !scheduleResult.error && !handoffError && !gateError;
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
    title: title.trim() || "Untitled task",
    brief: brief.trim(),
    assignment,
    status: "planned",
    createdAt,
    attachments,
    modelDefaults,
    stepModels,
    ...(projectId ? { projectId } : {}),
    schedule,
    handoffs: canvas ? [] : handoffs,
    approval,
    ...(canvas ? { canvas } : {}),
  };
  return (
    <form
      className="co-form co-task-form"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLSelectElement)
          event.preventDefault();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave && !attaching)
          save({
            id: taskId,
            attachments,
            ...(canvas ? { canvas } : {}),
            modelDefaults,
            stepModels,
            ...(projectId ? { projectId } : {}),
            schedule,
            handoffs: canvas ? [] : handoffs,
            approval,
            title: title.trim(),
            brief: brief.trim(),
            assignment,
            status: "planned",
            createdAt,
          });
      }}
    >
      <nav className="co-task-editor-nav" aria-label="Task editor">
        <button
          type="button"
          aria-label="Workflow map"
          aria-pressed={panel === "workflow"}
          onClick={() => setPanel("workflow")}
        >
          <GitBranch size={14} />
          Workflow map
          {(canvas?.nodes.length || handoffs.length) > 0 && (
            <em>{canvas?.nodes.length || handoffs.length}</em>
          )}
        </button>
        <button
          type="button"
          aria-label="Schedule"
          aria-pressed={panel === "schedule"}
          onClick={() => setPanel("schedule")}
        >
          <CalendarClock size={14} />
          Schedule{schedule.kind === "cron" && <em>CRON</em>}
        </button>
      </nav>
      <div className="co-task-panel" hidden={panel !== "schedule"}>
        <ScheduleEditor schedule={schedule} change={setSchedule} preview={scheduleResult} />
      </div>
      <div className="co-task-panel" hidden={panel !== "workflow"}>
        {panel === "workflow" &&
          (canvas ? (
            <TaskCanvas
              embedded
              company={company}
              task={{ ...draftTask, canvas }}
              save={changeCanvas}
              back={() => setPanel("workflow")}
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
            />
          ) : (
            <>
              <section className="co-workflow-migration">
                <div>
                  <strong>Move this task to the workflow map</strong>
                  <p>
                    This older task has {handoffs.length} step handoffs. Convert it when you are
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
                  Task name
                  <input
                    required
                    maxLength={120}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label>
                  Task outcome
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
            </>
          ))}
      </div>
      {!canSave && (
        <div className="co-task-save-errors">
          {!assignmentValid ? (
            <button type="button" onClick={() => setPanel("workflow")}>
              Add a task name and connect an office or agent to save.
            </button>
          ) : gateError ? (
            <button type="button" onClick={() => setPanel("workflow")}>
              {gateError}
            </button>
          ) : scheduleResult.error ? (
            <button type="button" onClick={() => setPanel("schedule")}>
              Fix the schedule to save.
            </button>
          ) : (
            <button type="button" onClick={() => setPanel("workflow")}>
              Complete the workflow to save: {handoffError}
            </button>
          )}
        </div>
      )}
      <div className="co-task-submit">
        <p>
          Saved locally as <strong>Planned</strong>.<br />
          Schedules and workflows run only after you enable or start them.
        </p>
        <button
          type="submit"
          className="co-button co-button-primary"
          disabled={!canSave || attaching}
        >
          {attaching ? "Adding files…" : existing ? "Save task" : "Create task"}
          <ArrowRight size={15} />
        </button>
      </div>
    </form>
  );
}
