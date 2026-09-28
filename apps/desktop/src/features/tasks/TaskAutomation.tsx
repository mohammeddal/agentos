import { useState } from "react";
import {
  ArrowDown,
  Bot,
  CalendarClock,
  ClipboardList,
  GitBranch,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import type { Company } from "../company/company-model";
import {
  conditionLabels,
  handoffName,
  previewHandoffs,
  type HandoffCondition,
  type HandoffStep,
  type SampleResult,
  type TaskSchedule,
} from "./task-workflow";
import "./task-automation.css";
import { ApprovalPicker } from "./ApprovalPicker";
import { assignedAgentIds } from "./task-approvals";

const presets = [
  ["Every hour", "0 * * * *"],
  ["Daily at 9 AM", "0 9 * * *"],
  ["Weekdays at 9 AM", "0 9 * * 1-5"],
  ["Mondays at 9 AM", "0 9 * * 1"],
] as const;
const timeZones = [
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Paris",
  "Asia/Baghdad",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Australia/Sydney",
];
export function defaultCron(): TaskSchedule {
  return {
    kind: "cron",
    expression: "0 9 * * 1-5",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
}

export function ScheduleEditor({
  schedule,
  change,
  preview,
  compact = false,
  subject = "task",
}: {
  schedule: TaskSchedule;
  change: (schedule: TaskSchedule) => void;
  preview: { dates: string[]; error: string | null };
  compact?: boolean;
  subject?: "task" | "workflow";
}) {
  return (
    <section
      className={`co-automation-panel ${compact ? "is-compact" : ""}`}
      aria-label={`${subject === "workflow" ? "Workflow" : "Task"} schedule`}
    >
      {!compact && (
        <div className="co-automation-intro">
          <CalendarClock size={22} />
          <div>
            <h3>Give your work a rhythm.</h3>
            <p>Use a preset or write a cron expression in your time zone.</p>
          </div>
        </div>
      )}
      <div className="co-assignment-modes">
        <button
          type="button"
          aria-pressed={schedule.kind === "manual"}
          onClick={() => change({ kind: "manual" })}
        >
          <span>
            <strong>Manual</strong>
            <small>No recurring schedule</small>
          </span>
        </button>
        <button
          type="button"
          aria-pressed={schedule.kind === "cron"}
          onClick={() => {
            if (schedule.kind !== "cron") change(defaultCron());
          }}
        >
          <CalendarClock size={17} />
          <span>
            <strong>Recurring · cron</strong>
            <small>Plan a repeating trigger</small>
          </span>
        </button>
      </div>
      {schedule.kind === "cron" && (
        <>
          <div className="co-cron-presets" aria-label="Schedule presets">
            {presets.map(([label, expression]) => (
              <button
                key={label}
                type="button"
                aria-pressed={schedule.expression === expression}
                onClick={() => change({ ...schedule, expression })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="co-form-pair">
            <label>
              Cron expression
              <input
                spellCheck={false}
                maxLength={100}
                value={schedule.expression}
                aria-invalid={!!preview.error}
                aria-describedby="cron-format cron-error"
                onChange={(event) => change({ ...schedule, expression: event.target.value })}
                placeholder="0 9 * * 1-5"
              />
            </label>
            <label>
              Time zone
              <input
                list="task-time-zones"
                maxLength={80}
                value={schedule.timeZone}
                onChange={(event) => change({ ...schedule, timeZone: event.target.value })}
              />
              <datalist id="task-time-zones">
                {[...new Set([Intl.DateTimeFormat().resolvedOptions().timeZone, ...timeZones])].map(
                  (zone) => (
                    <option key={zone} value={zone} />
                  ),
                )}
              </datalist>
            </label>
          </div>
          <div className="co-cron-key" id="cron-format">
            <span>
              minute <b>0–59</b>
            </span>
            <span>
              hour <b>0–23</b>
            </span>
            <span>
              day <b>1–31</b>
            </span>
            <span>
              month <b>1–12</b>
            </span>
            <span>
              weekday <b>0–7</b>
            </span>
          </div>
          <p className="co-automation-hint">
            Sunday is 0 or 7. Times follow the selected zone, including daylight-saving changes. If
            both day and weekday are restricted, either can match.
          </p>
          {preview.error ? (
            <p className="co-form-error" id="cron-error" role="alert">
              {preview.error}
            </p>
          ) : (
            <section className="co-cron-preview" aria-label="Upcoming schedule preview">
              <div>
                <strong>Next 3 planned occurrences</strong>
                <span>Preview only</span>
              </div>
              <ol>
                {preview.dates.map((date) => (
                  <li key={date}>
                    <CalendarClock size={14} />
                    <time dateTime={date}>
                      {new Intl.DateTimeFormat("en-US", {
                        timeZone: schedule.timeZone,
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZoneName: "short",
                      }).format(new Date(date))}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
      <div className="co-form-note">
        {schedule.kind === "cron"
          ? `Save this schedule, then enable it in ${subject} details. AgentOS must stay open and your Mac awake; missed occurrences are skipped.`
          : `This ${subject} has no automatic trigger. Open ${subject} details and choose Run to start it.`}
      </div>
    </section>
  );
}

const defaultSample = (): SampleResult => ({ outcome: "success", approved: false, output: {} });
const stateLabels = { ready: "Would continue", waiting: "Would wait", skipped: "Would skip" };

export function WorkflowEditor({
  company,
  taskId,
  title,
  steps,
  change,
  error,
}: {
  company: Company;
  taskId: string;
  title: string;
  steps: HandoffStep[];
  change: (steps: HandoffStep[]) => void;
  error: string | null;
}) {
  const [selected, setSelected] = useState("start");
  const [testing, setTesting] = useState(false);
  const [samples, setSamples] = useState<Record<string, SampleResult>>({});
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
  const [jsonErrors, setJsonErrors] = useState<Record<string, boolean>>({});
  const active = steps.find((step) => step.id === selected);
  const activeId = active?.id || "start";
  const index = active ? steps.indexOf(active) : -1;
  const agents = company.offices.flatMap((office) =>
    office.agents.map((agent) => ({ ...agent, office })),
  );
  const tasks = (company.tasks || []).filter((task) => task.id !== taskId);
  const resolvedSamples = Object.fromEntries(
    ["start", ...steps.map((step) => step.id)].map((id) => [id, samples[id] || defaultSample()]),
  );
  const states = previewHandoffs(steps, resolvedSamples);
  const hasJsonError = Object.values(jsonErrors).some(Boolean);
  function update(patch: Partial<HandoffStep>) {
    change(steps.map((step) => (step.id === activeId ? { ...step, ...patch } : step)));
  }
  function add(kind: "agent" | "task") {
    const id = crypto.randomUUID();
    change([
      ...steps,
      { id, after: activeId, kind, targetId: "", instruction: "", condition: { kind: "success" } },
    ]);
    setSelected(id);
  }
  function sampleChange(patch: Partial<SampleResult>) {
    setSamples({
      ...samples,
      [activeId]: { ...(resolvedSamples[activeId] || defaultSample()), ...patch },
    });
  }
  const sample = resolvedSamples[activeId] || defaultSample();
  return (
    <section className="co-automation-panel" aria-label="Task workflow">
      <div className="co-automation-intro">
        <GitBranch size={22} />
        <div>
          <h3>Connect the next move.</h3>
          <p>Select a step, then add a handoff. Add two from the same step to branch.</p>
        </div>
        <button
          type="button"
          className="co-button"
          aria-pressed={testing}
          onClick={() => setTesting(!testing)}
        >
          <Play size={13} />
          {testing ? "Close test" : "Test flow"}
        </button>
      </div>
      <div className="co-workflow-builder">
        <div className="co-workflow-canvas" aria-label="Workflow steps">
          <button
            type="button"
            className={`co-flow-node ${!active ? "selected" : ""}`}
            onClick={() => setSelected("start")}
          >
            <span className="co-flow-node-icon">
              <ClipboardList size={18} />
            </span>
            <span>
              <small>STARTING TASK</small>
              <strong>{title || "Your task"}</strong>
              {testing && <em className="route-ready">Sample start</em>}
            </span>
          </button>
          {steps.map((step, i) => (
            <div className="co-flow-branch" key={step.id}>
              <div className="co-flow-edge">
                <ArrowDown size={13} />
                <span>
                  From{" "}
                  {step.after === "start"
                    ? "starting task"
                    : `step ${steps.findIndex((parent) => parent.id === step.after) + 1}`}{" "}
                  · {conditionLabels[step.condition.kind]}
                </span>
              </div>
              <button
                type="button"
                className={`co-flow-node ${activeId === step.id ? "selected" : ""}`}
                onClick={() => setSelected(step.id)}
              >
                <span className="co-flow-node-icon">
                  {step.kind === "agent" ? <Bot size={18} /> : <ClipboardList size={18} />}
                </span>
                <span>
                  <small>
                    STEP {i + 1} · {step.kind.toUpperCase()}
                  </small>
                  <strong>{handoffName(company, step)}</strong>
                  {testing && !error && !hasJsonError && (
                    <em className={`route-${states[step.id]}`}>
                      {stateLabels[states[step.id] || "waiting"]}
                    </em>
                  )}
                </span>
              </button>
            </div>
          ))}
          <div className="co-flow-add">
            <span>Hand off from {active ? `step ${index + 1}` : "starting task"}</span>
            <div>
              <button type="button" onClick={() => add("agent")} disabled={!agents.length}>
                <Plus size={13} />
                Agent
              </button>
              <button type="button" onClick={() => add("task")} disabled={!tasks.length}>
                <Plus size={13} />
                Task
              </button>
            </div>
            {!tasks.length && <small>Save another task to link it here.</small>}
          </div>
        </div>
        <div className="co-flow-inspector">
          {active ? (
            <>
              <div className="co-flow-inspector-heading">
                <strong>Step {index + 1}</strong>
                <button
                  type="button"
                  aria-label={`Remove step ${index + 1}`}
                  title={
                    steps.some((step) => step.after === activeId)
                      ? "Remove this step’s dependent steps first"
                      : "Remove this step"
                  }
                  disabled={steps.some((step) => step.after === activeId)}
                  onClick={() => {
                    change(steps.filter((step) => step.id !== activeId));
                    setSelected(active.after);
                    setJsonErrors({ ...jsonErrors, [activeId]: false });
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <label>
                After
                <select
                  value={active.after}
                  onChange={(event) => update({ after: event.target.value })}
                >
                  <option value="start">Starting task</option>
                  {steps.slice(0, index).map((step, i) => (
                    <option key={step.id} value={step.id}>
                      Step {i + 1} · {handoffName(company, step)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {active.kind === "agent" ? "Agent" : "Linked task"}
                <select
                  value={active.targetId}
                  onChange={(event) => update({ targetId: event.target.value })}
                >
                  <option value="">Choose {active.kind}…</option>
                  {active.kind === "agent"
                    ? agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} · {agent.office.name}
                        </option>
                      ))
                    : tasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                </select>
              </label>
              <label>
                Continue when
                <select
                  value={active.condition.kind}
                  onChange={(event) => {
                    const kind = event.target.value as HandoffCondition["kind"];
                    update({
                      condition:
                        kind === "match"
                          ? { kind, field: "score", operator: "gt", value: "80" }
                          : { kind },
                    });
                  }}
                >
                  {Object.entries(conditionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {active.condition.kind === "match" && (
                <ConditionFields
                  condition={active.condition}
                  change={(condition) => update({ condition })}
                />
              )}
              {active.condition.kind === "approval" && (
                <p className="co-automation-hint">
                  Wait for explicit human approval after the source succeeds. The test checkbox only
                  simulates approval.
                </p>
              )}
              <ApprovalPicker
                company={company}
                rule={active.approval || { kind: "none" }}
                change={(approval) => update({ approval })}
                executorIds={
                  active.kind === "agent"
                    ? [active.targetId]
                    : assignedAgentIds(
                        company,
                        tasks.find((t) => t.id === active.targetId)?.assignment || {
                          kind: "agents",
                          targets: [],
                        },
                      )
                }
                label="Before this handoff starts"
              />
              <label>
                {active.kind === "agent" ? "Agent instruction" : "Handoff note (optional)"}
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={active.instruction}
                  placeholder={
                    active.kind === "agent"
                      ? "Review the previous result and…"
                      : "Context to pass with this task…"
                  }
                  onChange={(event) => update({ instruction: event.target.value })}
                />
              </label>
              <p className="co-automation-hint">
                Receives the source step’s output.{" "}
                {active.kind === "task"
                  ? "Uses the linked task’s assignment and workflow; its own cron trigger is not invoked by a handoff."
                  : "Runs only this agent at this step."}
              </p>
              {steps.some((step) => step.after === activeId) && (
                <p className="co-automation-hint">
                  Remove dependent steps before removing this step.
                </p>
              )}
            </>
          ) : (
            <div className="co-flow-start">
              <span className="co-section-kicker">YOUR STARTING POINT</span>
              <h3>{title || "Your task"}</h3>
              <p>
                This runs with the team selected in the Task tab. Hand off the result to an agent or
                another task.
              </p>
              <p>
                Use <strong>On failure</strong> for a fallback, <strong>After approval</strong> for
                a review gate, or compare an output field.
              </p>
            </div>
          )}
          {testing && (
            <section className="co-flow-sample" aria-label="Sample result">
              <strong>Sample result · {active ? `step ${index + 1}` : "starting task"}</strong>
              <label>
                Sample outcome
                <select
                  value={sample.outcome}
                  onChange={(event) =>
                    sampleChange({ outcome: event.target.value as SampleResult["outcome"] })
                  }
                >
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                </select>
              </label>
              <label className="co-sample-check">
                <input
                  type="checkbox"
                  checked={sample.approved}
                  onChange={(event) => sampleChange({ approved: event.target.checked })}
                />
                Simulate human approval
              </label>
              <label>
                Sample output (JSON)
                <textarea
                  rows={3}
                  spellCheck={false}
                  value={jsonDrafts[activeId] ?? "{}"}
                  onChange={(event) => {
                    const text = event.target.value;
                    setJsonDrafts({ ...jsonDrafts, [activeId]: text });
                    try {
                      const output: unknown = JSON.parse(text);
                      sampleChange({ output });
                      setJsonErrors({ ...jsonErrors, [activeId]: false });
                    } catch {
                      setJsonErrors({ ...jsonErrors, [activeId]: true });
                    }
                  }}
                />
              </label>
              {jsonErrors[activeId] && (
                <p className="co-form-error" role="alert">
                  Enter valid JSON to test the flow.
                </p>
              )}
              <p className="co-automation-hint">
                Sample outcomes default to success. Select any node to change its sample result.
                Linked tasks are treated as one step; their internal workflows are not simulated
                here.
              </p>
            </section>
          )}
        </div>
      </div>
      {error && (
        <p className="co-form-error" role="alert">
          {error}
        </p>
      )}
      {testing && hasJsonError && (
        <p className="co-form-error" role="alert">
          Flow preview paused: fix the invalid sample JSON.
        </p>
      )}
      <div className="co-form-note">
        {testing
          ? "Condition preview only. Action approval gates remain waiting; use the workflow's Rehearsals tab to test scoped decisions. No agents run or real approvals are granted."
          : "Save the workflow, then choose Run task in the installed Mac app. Conditions use real step results; approval gates stop execution until resolved."}
      </div>
    </section>
  );
}

function ConditionFields({
  condition,
  change,
}: {
  condition: Extract<HandoffCondition, { kind: "match" }>;
  change: (condition: HandoffCondition) => void;
}) {
  return (
    <div className="co-condition-fields">
      <label>
        Output field
        <input
          value={condition.field}
          maxLength={80}
          placeholder="review.score"
          onChange={(event) => change({ ...condition, field: event.target.value })}
        />
      </label>
      <div className="co-form-pair">
        <label>
          Comparison
          <select
            value={condition.operator}
            onChange={(event) =>
              change({ ...condition, operator: event.target.value as typeof condition.operator })
            }
          >
            <option value="equals">Equals</option>
            <option value="contains">Contains text</option>
            <option value="gt">Greater than</option>
            <option value="lt">Less than</option>
          </select>
        </label>
        <label>
          Value
          <input
            value={condition.value}
            maxLength={160}
            placeholder="80"
            onChange={(event) => change({ ...condition, value: event.target.value })}
          />
        </label>
      </div>
      <p className="co-automation-hint">
        Matches successful output only. Use dot notation for nested fields; numeric comparisons
        require a JSON number.
      </p>
    </div>
  );
}
