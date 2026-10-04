import type { Company, CompanyTask } from "./company-model";

export type StructureTarget =
  | { kind: "agent"; id: string; officeId: string }
  | { kind: "office"; id: string }
  | { kind: "domain"; id: string };

export type StructureDeletion = {
  label: string;
  officeIds: string[];
  agentIds: string[];
  domainIds: string[];
  blockingTasks: { id: string; title: string; lifecycle: "active" | "archived" | "removed" }[];
  affectedProjects: number;
};

const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

function references(task: CompanyTask, agents: Set<string>, domains: Set<string>) {
  if (
    task.assignment.targets.some((id) =>
      task.assignment.kind === "agents" ? agents.has(id) : domains.has(id.toLowerCase()),
    )
  )
    return true;
  if (task.approval?.kind === "agent" && agents.has(task.approval.agentId)) return true;
  if (
    task.handoffs?.some(
      (step) =>
        (step.kind === "agent" && agents.has(step.targetId)) ||
        (step.approval?.kind === "agent" && agents.has(step.approval.agentId)),
    )
  )
    return true;
  return !!task.canvas?.nodes.some(
    (node) =>
      (node.kind === "agent" && agents.has(node.reference)) ||
      (node.kind === "domain" && domains.has(node.reference.toLowerCase())) ||
      (node.kind === "approval" && node.reviewer !== "human" && agents.has(node.reviewer)),
  );
}

export function structureDeletion(company: Company, target: StructureTarget): StructureDeletion {
  const offices =
    target.kind === "domain"
      ? company.offices.filter((office) => same(office.domain, target.id))
      : target.kind === "office"
        ? company.offices.filter((office) => office.id === target.id)
        : company.offices.filter((office) => office.id === target.officeId);
  const agents =
    target.kind === "agent"
      ? offices.flatMap((office) => office.agents.filter((agent) => agent.id === target.id))
      : offices.flatMap((office) => office.agents);
  const domainIds = target.kind === "domain" ? [target.id] : [];
  const agentIds = agents.map((agent) => agent.id);
  const agentSet = new Set(agentIds);
  const domainSet = new Set(domainIds.map((domain) => domain.toLowerCase()));
  const blockingTasks = (company.tasks || [])
    .filter((task) => references(task, agentSet, domainSet))
    .map(({ id, title, lifecycle }) => ({ id, title, lifecycle: lifecycle || "active" }));
  const affectedProjects = (company.projects || []).filter(
    (project) =>
      project.agentIds.some((id) => agentSet.has(id)) ||
      project.domains.some((domain) => domainSet.has(domain.toLowerCase())),
  ).length;
  const label =
    target.kind === "agent"
      ? agents[0]?.name || "Unavailable agent"
      : target.kind === "office"
        ? offices[0]?.name || "Unavailable office"
        : target.id;
  return {
    label,
    officeIds: target.kind === "agent" ? [] : offices.map((office) => office.id),
    agentIds,
    domainIds,
    blockingTasks,
    affectedProjects,
  };
}

/** Deletes an office, domain, or agent. With `removeTasks`, workflows that depend on it go too. */
export function deleteStructure(
  company: Company,
  target: StructureTarget,
  { removeTasks = false }: { removeTasks?: boolean } = {},
): Company {
  const impact = structureDeletion(company, target);
  if (impact.blockingTasks.length && !removeTasks)
    throw new Error("Reassign or edit the listed tasks before deleting this company structure.");
  const removedTasks = new Set(impact.blockingTasks.map((task) => task.id));
  const agentIds = new Set(impact.agentIds);
  const domainIds = new Set(impact.domainIds.map((domain) => domain.toLowerCase()));
  const officeIds = new Set(impact.officeIds);
  const offices = company.offices
    .filter((office) => !officeIds.has(office.id))
    .map((office) =>
      target.kind === "agent" && office.id === target.officeId
        ? { ...office, agents: office.agents.filter((agent) => agent.id !== target.id) }
        : office,
    );
  const projects = company.projects?.map((project) => ({
    ...project,
    domains: project.domains.filter((domain) => !domainIds.has(domain.toLowerCase())),
    agentIds: project.agentIds.filter((id) => !agentIds.has(id)),
  }));
  const tasks = company.tasks
    ?.filter(
      (task) =>
        !removedTasks.has(task.id) &&
        !(removeTasks && task.officeId && officeIds.has(task.officeId)),
    )
    .map((task) => ({
      ...task,
      ...(task.stepModels
        ? {
            stepModels: Object.fromEntries(
              Object.entries(task.stepModels).filter(([, choice]) => !agentIds.has(choice.agentId)),
            ),
          }
        : {}),
    }));
  const hiddenDomains =
    target.kind === "domain"
      ? [...(company.hiddenDomains || []).filter((domain) => !same(domain, target.id)), target.id]
      : company.hiddenDomains;
  return {
    ...company,
    offices,
    ...(projects ? { projects } : {}),
    ...(tasks ? { tasks } : {}),
    ...(company.domains
      ? { domains: company.domains.filter((domain) => !domainIds.has(domain.toLowerCase())) }
      : {}),
    ...(hiddenDomains ? { hiddenDomains } : {}),
  };
}
