import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  ClipboardList,
  GitBranch,
  Layers3,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import {
  companyDomains,
  taskParticipants,
  type Company,
  type CompanyTask,
  type TaskAssignment,
} from "../company/company-model";
import "./company-tasks.css";
import { useLiveRuntime } from "../engines/live-runtime";
import { engineId } from "../engines/live-runtime";
import { ModelPicker } from "../engines/ModelPicker";
import { AttachmentEditor } from "../attachments/Attachments";
import { latestRun, matchesRunFilter, runLabel, type RunFilter } from "../engines/run-presentation";
import type { ModelChoice } from "../engines/model-choice";
import { ApprovalPicker } from "./ApprovalPicker";
import { approvalError, type ApprovalRule } from "./task-approvals";
import { ScheduleEditor, WorkflowEditor } from "./TaskAutomation";
import {
  schedulePreview,
  workflowError,
  type HandoffStep,
  type TaskSchedule,
} from "./task-workflow";

const countLabel = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const templates = [
  {
    title: "Investigate an incident",
    brief: "Find the root cause, gather evidence, and propose a fix with a verification plan.",
  },
  {
    title: "Plan a product launch",
    brief:
      "Prepare a coordinated launch plan, including deliverables, owners, risks, and success measures.",
  },
  {
    title: "Research an opportunity",
    brief:
      "Research the opportunity, compare options, and deliver an evidence-backed recommendation.",
  },
];

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
                {task.assignment.kind === "domains" ? "Domain team" : "Direct assignment"}
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
}: {
  company: Company;
  existing: CompanyTask | undefined;
  initialDomain: string | undefined;
  initialProjectId?: string | undefined;
  initialAgentId?: string | undefined;
  save: (task: CompanyTask) => void;
}) {
  const [taskId] = useState(() => existing?.id || crypto.randomUUID());
  const [attachments, setAttachments] = useState(existing?.attachments || []);
  const [attaching, setAttaching] = useState(false);
  const [modelDefaults, setModelDefaults] = useState<Record<string, ModelChoice>>(
    existing?.modelDefaults || {},
  );
  const [projectId, setProjectId] = useState(existing?.projectId || initialProjectId || "");
  const [panel, setPanel] = useState<"task" | "schedule" | "workflow">("task");
  const [approval, setApproval] = useState<ApprovalRule>(
    existing?.approval || (existing ? { kind: "none" } : { kind: "human" }),
  );
  const [schedule, setSchedule] = useState<TaskSchedule>(existing?.schedule || { kind: "manual" });
  const [handoffs, setHandoffs] = useState<HandoffStep[]>(existing?.handoffs || []);
  const [previewTime, setPreviewTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setPreviewTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const scheduleResult = useMemo(
    () => schedulePreview(schedule, previewTime),
    [schedule, previewTime],
  );
  const handoffError = workflowError(company, taskId, handoffs);
  const [title, setTitle] = useState(existing?.title || "");
  const [brief, setBrief] = useState(existing?.brief || "");
  const [kind, setKind] = useState<TaskAssignment["kind"]>(
    existing?.assignment.kind || (initialAgentId ? "agents" : "domains"),
  );
  const [selectedDomains, setSelectedDomains] = useState<string[]>(
    existing?.assignment.kind === "domains"
      ? existing.assignment.targets
      : initialDomain
        ? [initialDomain]
        : [],
  );
  const [selectedAgents, setSelectedAgents] = useState<string[]>(
    existing?.assignment.kind === "agents"
      ? existing.assignment.targets
      : initialAgentId
        ? [initialAgentId]
        : [],
  );
  const [search, setSearch] = useState("");
  const assignment = { kind, targets: kind === "domains" ? selectedDomains : selectedAgents };
  const team = taskParticipants(company, assignment);
  const domains = companyDomains(company);
  const allAgents = company.offices.flatMap((office) =>
    office.agents.map((agent) => ({ ...agent, office })),
  );
  const options =
    kind === "domains"
      ? domains.map((domain) => ({
          id: domain,
          name: domain,
          detail: `${countLabel(company.offices.filter((o) => o.domain === domain).length, "office")} · ${countLabel(allAgents.filter((a) => a.office.domain === domain).length, "agent")}`,
        }))
      : allAgents.map((a) => ({ id: a.id, name: a.name, detail: `${a.office.name} · ${a.role}` }));
  const visibleOptions = options.filter((option) =>
    `${option.name} ${option.detail}`.toLowerCase().includes(search.toLowerCase()),
  );
  const missing = assignment.targets.filter((id) => !options.some((option) => option.id === id));
  const emptyDomains =
    kind === "domains"
      ? selectedDomains.filter((domain) => !team.some((a) => a.office.domain === domain))
      : [];
  const assignmentValid = !!title.trim() && assignment.targets.length > 0 && !missing.length;
  const gateError = approvalError(
    company,
    approval,
    team.map((a) => a.id),
  );
  const canSave = assignmentValid && !scheduleResult.error && !handoffError && !gateError;
  function toggle(id: string) {
    const update = (values: string[]) =>
      values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
    if (kind === "domains") setSelectedDomains(update);
    else setSelectedAgents(update);
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
        if (canSave && !attaching)
          save({
            id: taskId,
            attachments,
            ...(existing?.canvas ? { canvas: existing.canvas } : {}),
            modelDefaults,
            ...(existing?.stepModels ? { stepModels: existing.stepModels } : {}),
            ...(projectId ? { projectId } : {}),
            schedule,
            handoffs,
            approval,
            title: title.trim(),
            brief: brief.trim(),
            assignment,
            status: "planned",
            createdAt: existing?.createdAt || new Date().toISOString(),
          });
      }}
    >
      <nav className="co-task-editor-nav" aria-label="Task editor">
        <button
          type="button"
          aria-label="Task and team"
          aria-pressed={panel === "task"}
          onClick={() => setPanel("task")}
        >
          <ClipboardList size={14} />
          Task & team
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
        <button
          type="button"
          aria-label="Workflow"
          aria-pressed={panel === "workflow"}
          onClick={() => setPanel("workflow")}
        >
          <GitBranch size={14} />
          Workflow{handoffs.length > 0 && <em>{handoffs.length}</em>}
        </button>
      </nav>
      <div className="co-task-panel" hidden={panel !== "task"}>
        <p className="co-automation-hint">
          Define the outcome. Bring in one specialist or a team across your company.
        </p>
        {!existing && (
          <label>
            <span>
              Start from a template <span className="co-field-optional">Optional</span>
            </span>
            <select
              defaultValue=""
              onChange={(event) => {
                const template = templates[Number(event.target.value)];
                if (event.target.value && template) {
                  setTitle(template.title);
                  setBrief(template.brief);
                }
              }}
            >
              <option value="">Write your own task</option>
              {templates.map((template, index) => (
                <option key={template.title} value={index}>
                  {template.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Task name
          <input
            required
            maxLength={120}
            placeholder="What would you like your team to accomplish?"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Company project
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project · Company-wide task</option>
            {projectId && !company.projects?.some((p) => p.id === projectId) && (
              <option value={projectId}>Unavailable project (retained)</option>
            )}
            {(company.projects || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <small>
            Task owners also appear in this project’s directory tree. Assignment and approval rules
            stay independent.
          </small>
        </label>
        <label>
          <span>
            Task brief <span className="co-field-optional">Optional</span>
          </span>
          <textarea
            rows={3}
            maxLength={3000}
            placeholder="Describe the outcome, context, and what done looks like…"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
          />
        </label>
        <AttachmentEditor value={attachments} onChange={setAttachments} onBusy={setAttaching}>
          {null}
        </AttachmentEditor>
        <fieldset className="co-assignment-field">
          <legend>Assign to</legend>
          <div className="co-assignment-modes">
            {(["domains", "agents"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={kind === mode}
                onClick={() => {
                  setKind(mode);
                  setSearch("");
                }}
              >
                {mode === "domains" ? <Layers3 size={17} /> : <Bot size={17} />}
                <span>
                  <strong>{mode === "domains" ? "Domain teams" : "Specific agents"}</strong>
                  <small>
                    {mode === "domains"
                      ? "One or more areas of expertise"
                      : "Hand-pick across any office"}
                  </small>
                </span>
                {kind === mode && <Check size={15} />}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="co-assignee-picker">
          <div className="co-assignee-heading">
            <strong>Select {kind}</strong>
            <span>{assignment.targets.length} selected</span>
          </div>
          <input
            aria-label="Filter assignees"
            placeholder={`Find ${kind}…`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="co-assignee-options">
            {visibleOptions.map((option) => (
              <label
                key={option.id}
                className={assignment.targets.includes(option.id) ? "is-selected" : ""}
              >
                <input
                  type="checkbox"
                  checked={assignment.targets.includes(option.id)}
                  onChange={() => toggle(option.id)}
                />
                <span>
                  <strong>{option.name}</strong>
                  <small>{option.detail}</small>
                </span>
              </label>
            ))}
            {!visibleOptions.length && (
              <p>
                {options.length
                  ? "No matches. Try a different search."
                  : "Add an agent to an office to assign them directly."}
              </p>
            )}
          </div>
        </div>
        {missing.length > 0 && (
          <div className="co-form-error" role="alert">
            Some assignees are no longer available.{" "}
            <button
              type="button"
              onClick={() => {
                if (kind === "domains")
                  setSelectedDomains(selectedDomains.filter((id) => !missing.includes(id)));
                else setSelectedAgents(selectedAgents.filter((id) => !missing.includes(id)));
              }}
            >
              Remove unavailable assignees
            </button>
          </div>
        )}
        <section className="co-task-team" aria-label="Assignment preview" aria-live="polite">
          <div>
            <Users size={16} />
            <strong>
              {team.length
                ? `${team.length} ${team.length === 1 ? "agent" : "agents"} on this task`
                : "Build your task team"}
            </strong>
            <span>
              {countLabel(
                kind === "domains"
                  ? selectedDomains.length
                  : new Set(team.map((a) => a.office.domain)).size,
                "domain",
              )}
            </span>
          </div>
          {team.length > 0 && (
            <div className="co-task-team-members">
              {team.map((agent) => (
                <span key={agent.id} title={`${agent.office.domain} · ${agent.office.name}`}>
                  <Bot size={12} />
                  {agent.name}
                  <small>{agent.office.name}</small>
                </span>
              ))}
            </div>
          )}
          <p>
            {kind === "domains"
              ? "Includes every agent in the selected domains. Membership updates when your office teams change."
              : "Only the selected agents are assigned, even if they move to another office."}
          </p>
          {emptyDomains.length > 0 && (
            <p className="co-task-warning">
              No agents yet in {emptyDomains.join(", ")}. You can save the plan and staff these
              domains later.
            </p>
          )}
        </section>
        {[...new Set(team.map((a) => a.engine))]
          .filter((e) => ["Codex", "Claude Code"].includes(e))
          .map((engine) => (
            <div key={engine}>
              <strong>{engine} · Task default</strong>
              <ModelPicker
                engine={engineId(engine)}
                value={modelDefaults[engineId(engine)]}
                label={`${engine} task default`}
                onChange={(choice) =>
                  setModelDefaults((current) => ({ ...current, [engineId(engine)]: choice }))
                }
              />
            </div>
          ))}
        <ApprovalPicker
          company={company}
          rule={approval}
          change={setApproval}
          executorIds={team.map((a) => a.id)}
          label="Before this task starts"
        />
      </div>
      <div className="co-task-panel" hidden={panel !== "schedule"}>
        <ScheduleEditor schedule={schedule} change={setSchedule} preview={scheduleResult} />
      </div>
      <div className="co-task-panel" hidden={panel !== "workflow"}>
        <WorkflowEditor
          company={company}
          taskId={taskId}
          title={title}
          steps={handoffs}
          change={setHandoffs}
          error={handoffError}
        />
      </div>
      {!canSave && (
        <div className="co-task-save-errors">
          {!assignmentValid ? (
            <button type="button" onClick={() => setPanel("task")}>
              Add a task name and valid team to save.
            </button>
          ) : gateError ? (
            <button type="button" onClick={() => setPanel("task")}>
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
          Schedules and handoffs are drafts, not active runs.
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
