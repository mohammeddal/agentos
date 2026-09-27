import { describe, expect, it } from "vitest";
import { isCompany, starterCompany, type CompanyTask } from "./company-model";
import { evaluateCondition, previewHandoffs, schedulePreview, workflowError, type HandoffStep, type SampleResult } from "./task-workflow";

const now = new Date("2026-09-25T17:00:00Z");
const task: CompanyTask = { id: "task-a", title: "Analyze", brief: "", assignment: { kind: "agents", targets: ["analyst"] }, status: "planned", createdAt: now.toISOString() };
const step = (overrides: Partial<HandoffStep> = {}): HandoffStep => ({ id: "one", after: "start", kind: "agent", targetId: "reviewer", instruction: "Review output", condition: { kind: "success" }, ...overrides });
const sample = (overrides: Partial<SampleResult> = {}): SampleResult => ({ outcome: "success", approved: false, output: { score: 90, review: { approved: true }, summary: "ready to ship" }, ...overrides });

describe("cron schedule planning", () => {
  it("keeps manual tasks unscheduled", () => expect(schedulePreview({ kind: "manual" }, now)).toEqual({ dates: [], error: null }));
  it("previews weekdays in the selected time zone", () => {
    const result = schedulePreview({ kind: "cron", expression: "0 9 * * 1-5", timeZone: "America/Los_Angeles" }, now);
    expect(result.error).toBeNull();
    expect(result.dates).toEqual(["2026-09-28T16:00:00.000Z", "2026-09-29T16:00:00.000Z", "2026-09-30T16:00:00.000Z"]);
  });
  it("supports lists, ranges and steps", () => {
    const result = schedulePreview({ kind: "cron", expression: "*/15 9-17 * * 1,3,5", timeZone: "UTC" }, new Date("2026-09-25T09:01:00Z"));
    expect(result.dates[0]).toBe("2026-09-25T09:15:00.000Z");
  });
  it("previews daylight-saving offset changes", () => {
    const result = schedulePreview({ kind: "cron", expression: "0 9 * * *", timeZone: "America/New_York" }, new Date("2026-10-31T12:00:00Z"));
    expect(result.dates.slice(0, 2)).toEqual(["2026-10-31T13:00:00.000Z", "2026-11-01T14:00:00.000Z"]);
  });
  it("uses OR semantics for restricted day-of-month and weekday", () => {
    const result = schedulePreview({ kind: "cron", expression: "0 9 1 * 1", timeZone: "UTC" }, new Date("2026-09-26T00:00:00Z"));
    expect(result.dates.slice(0, 2)).toEqual(["2026-09-28T09:00:00.000Z", "2026-10-01T09:00:00.000Z"]);
  });
  it.each(["", "* * * *", "* * * * * *", "61 * * * *", "0 24 * * *", "*/0 * * * *", "0 9 31 2 *", "@daily", "H * * * *"])("rejects invalid or unsupported cron %s", expression => {
    expect(schedulePreview({ kind: "cron", expression, timeZone: "UTC" }, now).error).not.toBeNull();
  });
  it("rejects blank and invalid time zones", () => {
    for (const timeZone of ["", "Mars/City"]) expect(schedulePreview({ kind: "cron", expression: "0 9 * * *", timeZone }, now).error).toContain("time zone");
  });
});

describe("conditional handoffs", () => {
  it("routes success, failure and completion independently", () => {
    expect(evaluateCondition({ kind: "success" }, sample())).toBe("ready");
    expect(evaluateCondition({ kind: "success" }, sample({ outcome: "failure" }))).toBe("skipped");
    expect(evaluateCondition({ kind: "failure" }, sample({ outcome: "failure" }))).toBe("ready");
    expect(evaluateCondition({ kind: "failure" }, sample())).toBe("skipped");
    expect(evaluateCondition({ kind: "always" }, sample({ outcome: "failure" }))).toBe("ready");
  });
  it("gates approval on success and explicit approval", () => {
    expect(evaluateCondition({ kind: "approval" }, sample())).toBe("waiting");
    expect(evaluateCondition({ kind: "approval" }, sample({ approved: true }))).toBe("ready");
    expect(evaluateCondition({ kind: "approval" }, sample({ outcome: "failure", approved: true }))).toBe("skipped");
  });
  it("supports nested fields, text and numeric comparisons", () => {
    expect(evaluateCondition({ kind: "match", field: "review.approved", operator: "equals", value: "true" }, sample())).toBe("ready");
    expect(evaluateCondition({ kind: "match", field: "summary", operator: "contains", value: "ship" }, sample())).toBe("ready");
    expect(evaluateCondition({ kind: "match", field: "score", operator: "gt", value: "80" }, sample())).toBe("ready");
    expect(evaluateCondition({ kind: "match", field: "score", operator: "lt", value: "80" }, sample())).toBe("skipped");
  });
  it("does not coerce strings to numbers or inspect inherited output", () => {
    const rule = { kind: "match", field: "score", operator: "gt", value: "80" } as const;
    expect(evaluateCondition(rule, sample({ output: { score: "90" } }))).toBe("skipped");
    expect(evaluateCondition(rule, sample({ output: Object.create({ score: 90 }) }))).toBe("skipped");
    expect(evaluateCondition(rule, sample({ outcome: "failure" }))).toBe("skipped");
  });
  it("propagates waiting and skipped states through a chain while routing branches", () => {
    const steps = [step({ condition: { kind: "approval" } }), step({ id: "two", after: "one" }), step({ id: "fallback", condition: { kind: "failure" } })];
    expect(previewHandoffs(steps, { start: sample(), one: sample() })).toMatchObject({ one: "waiting", two: "waiting", fallback: "skipped" });
    expect(previewHandoffs(steps, { start: sample({ outcome: "failure" }), one: sample() })).toMatchObject({ one: "skipped", two: "skipped", fallback: "ready" });
    expect(previewHandoffs(steps, { start: sample({ approved: true }), one: sample() })).toMatchObject({ one: "ready", two: "ready", fallback: "skipped" });
  });
  it("accepts valid chains, branches and saved-task links", () => {
    const company = { ...starterCompany, tasks: [task] };
    expect(workflowError(company, "new-task", [step(), step({ id: "two", after: "one" }), step({ id: "three", kind: "task", targetId: task.id })])).toBeNull();
  });
  it("rejects missing targets, duplicate IDs, later parents and empty agent instructions", () => {
    for (const steps of [[step({ targetId: "missing" })], [step(), step()], [step({ after: "later" })], [step({ id: "start" })], [step({ instruction: " " })]]) expect(workflowError(starterCompany, task.id, steps)).not.toBeNull();
  });
  it("rejects self-reference and cross-task recursion", () => {
    const taskB: CompanyTask = { ...task, id: "task-b", handoffs: [step({ kind: "task", targetId: task.id })] };
    const company = { ...starterCompany, tasks: [task, taskB] };
    expect(workflowError(company, task.id, [step({ kind: "task", targetId: task.id })])).toContain("itself");
    expect(workflowError(company, task.id, [step({ kind: "task", targetId: taskB.id })])).toContain("loop");
  });
  it("rejects unsafe fields and nonnumeric thresholds", () => {
    expect(workflowError(starterCompany, task.id, [step({ condition: { kind: "match", field: "__proto__.score", operator: "gt", value: "1" } })])).toContain("output field");
    expect(workflowError(starterCompany, task.id, [step({ condition: { kind: "match", field: "score", operator: "gt", value: "many" } })])).toContain("numeric");
  });
  it("persists plans without breaking existing tasks", () => {
    const planned: CompanyTask = { ...task, schedule: { kind: "cron", expression: "0 9 * * *", timeZone: "UTC" }, handoffs: [step()] };
    expect(isCompany(JSON.parse(JSON.stringify({ ...starterCompany, tasks: [task, planned] })))).toBe(true);
    expect(isCompany({ ...starterCompany, tasks: [{ ...task, schedule: null }] })).toBe(false);
    expect(isCompany({ ...starterCompany, tasks: [{ ...task, handoffs: [{ condition: null }] }] })).toBe(false);
  });
});
