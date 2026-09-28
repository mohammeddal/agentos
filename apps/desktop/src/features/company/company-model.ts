import {
  isHandoffStep,
  isTaskSchedule,
  type HandoffStep,
  type TaskSchedule,
} from "../tasks/task-workflow";
import { isApprovalRule, type ApprovalRule } from "../tasks/task-approvals";
import { isTaskCanvas, type TaskCanvasGraph } from "../tasks/task-canvas-model";
import {
  isModelChoice,
  isModelDefaults,
  isStepModels,
  type ModelChoice,
  type StepModelChoice,
} from "../engines/model-choice";
import { validLifecycle, type Lifecycle } from "./company-directory";
import { validAttachments, type Attachment } from "../attachments/attachment-model";

export type AgentSkillReference = {
  id: string;
  name: string;
  engine: "codex" | "claude";
  source: string;
  scope: string;
};
export type CompanyAgent = {
  id: string;
  name: string;
  role: string;
  engine: string;
  prompt?: string;
  skills?: AgentSkillReference[];
};
export type Office = {
  id: string;
  name: string;
  domain: string;
  color: string;
  agents: CompanyAgent[];
};
export type TaskAssignment = { kind: "domains" | "agents"; targets: string[] };
export type CompanyChat = {
  lifecycle?: Lifecycle;
  modelChoice?: ModelChoice;
  id: string;
  engine: string;
  projectId?: string;
  taskId?: string;
  createdAt: string;
  messages: {
    id: string;
    text: string;
    createdAt: string;
    attachments?: Attachment[];
    /** Provider used for this turn. Older chats fall back to the chat preference. */
    engine?: string;
    modelChoice?: ModelChoice;
  }[];
};
export type CompanyProject = {
  lifecycle?: Lifecycle;
  id: string;
  name: string;
  brief: string;
  domains: string[];
  agentIds: string[];
  createdAt: string;
};
export type CompanyTask = {
  attachments?: Attachment[];
  lifecycle?: Lifecycle;
  modelDefaults?: Record<string, ModelChoice>;
  stepModels?: Record<string, StepModelChoice>;
  id: string;
  title: string;
  brief: string;
  assignment: TaskAssignment;
  status: "planned";
  createdAt: string;
  projectId?: string;
  schedule?: TaskSchedule;
  handoffs?: HandoffStep[];
  approval?: ApprovalRule;
  canvas?: TaskCanvasGraph;
};
export type Company = {
  version: 1;
  name: string;
  offices: Office[];
  domains?: string[];
  hiddenDomains?: string[];
  tasks?: CompanyTask[];
  projects?: CompanyProject[];
  chats?: CompanyChat[];
};
export const officeColors = ["sage", "blue", "coral", "lavender", "gold"] as const;
export const domainTemplates: Record<string, string[]> = {
  "Data & Analytics": [
    "Data Engineer",
    "Data Analyst",
    "Incident Investigator",
    "Snowflake Cost Agent",
  ],
  "Software Engineering": ["Software Engineer", "PR Reviewer", "Test Engineer", "DevOps Agent"],
  Marketing: ["Content Strategist", "SEO Specialist", "Campaign Analyst", "Copywriter"],
  Finance: ["Financial Analyst", "Budget Planner", "Reporting Agent"],
  Research: ["Research Analyst", "Source Reviewer", "Report Writer"],
  Operations: ["Operations Analyst", "Project Coordinator", "Documentation Agent"],
  Custom: ["General Assistant", "Researcher", "Reviewer"],
};
export const starterCompany: Company = {
  version: 1,
  name: "My company",
  offices: [
    {
      id: "data",
      name: "Data & Analytics",
      domain: "Data & Analytics",
      color: "sage",
      agents: [
        {
          id: "data-engineer",
          name: "Data Engineer",
          role: "Pipelines & data models",
          engine: "Codex",
        },
        {
          id: "analyst",
          name: "Data Analyst",
          role: "Insights & reporting",
          engine: "Claude Code",
        },
        {
          id: "investigator",
          name: "Incident Investigator",
          role: "Evidence & root cause",
          engine: "Codex",
        },
      ],
    },
    {
      id: "engineering",
      name: "Engineering",
      domain: "Software Engineering",
      color: "blue",
      agents: [
        {
          id: "developer",
          name: "Software Engineer",
          role: "Build & maintain software",
          engine: "Codex",
        },
        {
          id: "reviewer",
          name: "PR Reviewer",
          role: "Quality & code review",
          engine: "Claude Code",
        },
      ],
    },
    { id: "marketing", name: "Marketing", domain: "Marketing", color: "coral", agents: [] },
  ],
};
export function isCompany(value: unknown): value is Company {
  if (!value || typeof value !== "object") return false;
  const c = value as Company;
  if (c.chats !== undefined && (!Array.isArray(c.chats) || !c.chats.every(isCompanyChat)))
    return false;
  if (
    c.projects !== undefined &&
    (!Array.isArray(c.projects) ||
      !c.projects.every(isCompanyProject) ||
      new Set(c.projects.map((p) => p.id)).size !== c.projects.length)
  )
    return false;
  if (c.tasks !== undefined && (!Array.isArray(c.tasks) || !c.tasks.every(isCompanyTask)))
    return false;
  if (
    c.domains !== undefined &&
    (!Array.isArray(c.domains) ||
      !c.domains.every((d) => typeof d === "string" && d.trim().length > 0))
  )
    return false;
  if (
    c.hiddenDomains !== undefined &&
    (!Array.isArray(c.hiddenDomains) ||
      !c.hiddenDomains.every((d) => typeof d === "string" && d.trim().length > 0))
  )
    return false;
  return (
    c.version === 1 &&
    typeof c.name === "string" &&
    Array.isArray(c.offices) &&
    c.offices.every(
      (o) =>
        o !== null &&
        typeof o === "object" &&
        typeof o.id === "string" &&
        typeof o.name === "string" &&
        typeof o.domain === "string" &&
        officeColors.includes(o.color as (typeof officeColors)[number]) &&
        Array.isArray(o.agents) &&
        o.agents.every(
          (a) =>
            a !== null &&
            typeof a === "object" &&
            typeof a.id === "string" &&
            typeof a.name === "string" &&
            typeof a.role === "string" &&
            typeof a.engine === "string" &&
            (a.prompt === undefined || (typeof a.prompt === "string" && a.prompt.length <= 6000)) &&
            (a.skills === undefined ||
              (Array.isArray(a.skills) &&
                a.skills.length <= 24 &&
                new Set(a.skills.map((skill) => skill.id)).size === a.skills.length &&
                a.skills.every(
                  (skill) =>
                    skill !== null &&
                    typeof skill === "object" &&
                    typeof skill.id === "string" &&
                    !!skill.id &&
                    skill.id.length <= 1600 &&
                    typeof skill.name === "string" &&
                    !!skill.name.trim() &&
                    skill.name.length <= 600 &&
                    ["codex", "claude"].includes(skill.engine) &&
                    typeof skill.source === "string" &&
                    !!skill.source &&
                    skill.source.length <= 1200 &&
                    typeof skill.scope === "string" &&
                    !!skill.scope &&
                    skill.scope.length <= 120 &&
                    (a.engine === "Codex"
                      ? skill.engine === "codex"
                      : a.engine === "Claude Code" && skill.engine === "claude"),
                ))),
        ),
    )
  );
}

export function isCompanyChat(value: unknown): value is CompanyChat {
  if (!value || typeof value !== "object") return false;
  const chat = value as CompanyChat;
  if (!validLifecycle(chat.lifecycle)) return false;
  if (chat.modelChoice !== undefined && !isModelChoice(chat.modelChoice)) return false;
  return (
    typeof chat.id === "string" &&
    !!chat.id &&
    typeof chat.engine === "string" &&
    typeof chat.createdAt === "string" &&
    Number.isFinite(Date.parse(chat.createdAt)) &&
    (chat.projectId === undefined || typeof chat.projectId === "string") &&
    (chat.taskId === undefined || typeof chat.taskId === "string") &&
    Array.isArray(chat.messages) &&
    chat.messages.length > 0 &&
    chat.messages.every(
      (m) =>
        m &&
        (m.attachments === undefined || validAttachments(m.attachments)) &&
        (m.engine === undefined || typeof m.engine === "string") &&
        (m.modelChoice === undefined || isModelChoice(m.modelChoice)) &&
        typeof m.id === "string" &&
        typeof m.text === "string" &&
        !!m.text.trim() &&
        m.text.length <= 3000 &&
        typeof m.createdAt === "string" &&
        Number.isFinite(Date.parse(m.createdAt)),
    )
  );
}

export function companyDomains(company: Company): string[] {
  const hidden = new Set((company.hiddenDomains || []).map((name) => name.toLowerCase()));
  const names = [
    ...Object.keys(domainTemplates),
    ...(company.domains || []),
    ...company.offices.map((o) => o.domain),
  ];
  return names.filter(
    (name, index) =>
      !hidden.has(name.toLowerCase()) &&
      names.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === index,
  );
}

export function isCompanyTask(value: unknown): value is CompanyTask {
  if (!value || typeof value !== "object") return false;
  const task = value as CompanyTask;
  if (task.attachments !== undefined && !validAttachments(task.attachments)) return false;
  if (!validLifecycle(task.lifecycle)) return false;
  if (task.modelDefaults !== undefined && !isModelDefaults(task.modelDefaults)) return false;
  if (task.stepModels !== undefined && !isStepModels(task.stepModels)) return false;
  if (task.canvas !== undefined && !isTaskCanvas(task.canvas)) return false;
  if (task.projectId !== undefined && (typeof task.projectId !== "string" || !task.projectId))
    return false;
  if (task.approval !== undefined && !isApprovalRule(task.approval)) return false;
  if (task.schedule !== undefined && !isTaskSchedule(task.schedule)) return false;
  if (
    task.handoffs !== undefined &&
    (!Array.isArray(task.handoffs) || !task.handoffs.every(isHandoffStep))
  )
    return false;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    !!task.title.trim() &&
    typeof task.brief === "string" &&
    task.status === "planned" &&
    typeof task.createdAt === "string" &&
    Number.isFinite(Date.parse(task.createdAt)) &&
    !!task.assignment &&
    (task.assignment.kind === "domains" || task.assignment.kind === "agents") &&
    Array.isArray(task.assignment.targets) &&
    task.assignment.targets.length > 0 &&
    task.assignment.targets.every((target) => typeof target === "string" && !!target.trim())
  );
}

/** Domain membership follows the current office structure; direct assignments follow agent IDs. */
export function taskParticipants(company: Company, assignment: TaskAssignment) {
  const targets = new Set(assignment.targets);
  return company.offices.flatMap((office) =>
    office.agents
      .filter((agent) =>
        assignment.kind === "domains" ? targets.has(office.domain) : targets.has(agent.id),
      )
      .map((agent) => ({ ...agent, office })),
  );
}

export function isCompanyProject(value: unknown): value is CompanyProject {
  if (!value || typeof value !== "object") return false;
  const p = value as CompanyProject;
  if (!validLifecycle(p.lifecycle)) return false;
  return (
    typeof p.id === "string" &&
    /^[a-f0-9-]{36}$/.test(p.id) &&
    typeof p.name === "string" &&
    !!p.name.trim() &&
    p.name.length <= 80 &&
    typeof p.brief === "string" &&
    p.brief.length <= 3000 &&
    typeof p.createdAt === "string" &&
    Number.isFinite(Date.parse(p.createdAt)) &&
    [p.domains, p.agentIds].every(
      (values) =>
        Array.isArray(values) &&
        values.every((v) => typeof v === "string" && !!v.trim()) &&
        new Set(values).size === values.length,
    )
  );
}

/** Whole domains follow current membership; hand-picked agents follow their stable IDs. */
export function projectParticipants(company: Company, project: CompanyProject) {
  return company.offices.flatMap((office) =>
    office.agents
      .filter(
        (agent) => project.domains.includes(office.domain) || project.agentIds.includes(agent.id),
      )
      .map((agent) => ({ ...agent, office })),
  );
}

/** Include task owners as well, so every project task can be found under its team. */
export function projectDirectoryTeam(company: Company, project: CompanyProject) {
  const ids = new Set(projectParticipants(company, project).map((a) => a.id));
  for (const task of company.tasks || [])
    if (task.projectId === project.id)
      for (const agent of taskParticipants(company, task.assignment)) ids.add(agent.id);
  return company.offices.flatMap((office) =>
    office.agents.filter((a) => ids.has(a.id)).map((agent) => ({ ...agent, office })),
  );
}

export function projectDomainNames(company: Company, project: CompanyProject) {
  return [
    ...new Set([
      ...project.domains,
      ...projectDirectoryTeam(company, project).map((a) => a.office.domain),
      ...(company.tasks || [])
        .filter((t) => t.projectId === project.id && t.assignment.kind === "domains")
        .flatMap((t) => t.assignment.targets),
    ]),
  ];
}
