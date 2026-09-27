import { companyDomains, type Company } from "../features/company/company-model";
import { activeCompany } from "../features/company/company-directory";

export type WorkspaceView =
  | "start"
  | "tasks"
  | "projects"
  | "map"
  | "offices"
  | "agents"
  | "domains"
  | "activity"
  | "memory"
  | "engines";
export type WorkspaceRoute = {
  view: WorkspaceView;
  officeId?: string;
  projectId?: string;
  chatId?: string;
};
export const destinations = [
  { view: "start", label: "Start", description: "Write a prompt or continue a chat" },
  { view: "tasks", label: "Tasks", description: "Plans, workflows, and task details" },
  { view: "map", label: "Company", description: "Offices, agents, and domains" },
  { view: "activity", label: "Activity", description: "Status, approvals, and rehearsals" },
  { view: "memory", label: "Library", description: "Memory and local capabilities" },
] as const;
export function primaryView(view: WorkspaceView): WorkspaceView {
  return ["map", "offices", "agents", "domains"].includes(view)
    ? "map"
    : view === "engines"
      ? "memory"
      : view;
}
export const viewLabels: Record<WorkspaceView, string> = {
  start: "Start",
  tasks: "Tasks",
  projects: "Projects",
  map: "Office map",
  offices: "Offices",
  agents: "Agents",
  domains: "Domains",
  activity: "Activity",
  memory: "Memory",
  engines: "Capabilities",
};
const paths: Record<WorkspaceView, string> = {
  start: "start",
  tasks: "tasks",
  projects: "projects",
  map: "company/map",
  offices: "company/offices",
  agents: "company/agents",
  domains: "company/domains",
  activity: "activity",
  memory: "library/memory",
  engines: "library/engines",
};
export function routeHash(route: WorkspaceRoute): string {
  if (route.chatId) return `#/chats/${encodeURIComponent(route.chatId)}`;
  if (route.view === "start" && route.projectId)
    return `#/start?project=${encodeURIComponent(route.projectId)}`;
  if (route.officeId) return `#/company/offices/${encodeURIComponent(route.officeId)}`;
  if (route.view === "projects" && route.projectId)
    return `#/projects/${encodeURIComponent(route.projectId)}`;
  return `#/${paths[route.view]}`;
}
export function parseRoute(hash: string): WorkspaceRoute {
  const path = hash.replace(/^#\/?/, "");
  const exact = Object.entries(paths).find(([, value]) => value === path);
  if (exact) return { view: exact[0] as WorkspaceView };
  try {
    if (/^chats\/[^/]+$/.test(path))
      return { view: "start", chatId: decodeURIComponent(path.slice("chats/".length)) };
    if (path.startsWith("start?")) {
      const projectId = new URLSearchParams(path.slice(6)).get("project");
      return projectId ? { view: "start", projectId } : { view: "start" };
    }
    if (/^company\/offices\/[^/]+$/.test(path))
      return {
        view: "offices",
        officeId: decodeURIComponent(path.slice("company/offices/".length)),
      };
    if (/^projects\/[^/]+$/.test(path))
      return { view: "projects", projectId: decodeURIComponent(path.slice("projects/".length)) };
  } catch {
    /* Malformed links return to the safe start page. */
  }
  return { view: "start" };
}
export type FindResult = {
  id: string;
  kind: "page" | "task" | "chat" | "project" | "agent" | "office" | "domain";
  title: string;
  detail: string;
  route?: WorkspaceRoute;
};
export function findWorkspace(company: Company, text: string): FindResult[] {
  company = activeCompany(company);
  const pages: FindResult[] = [
    ...destinations.map((d) => ({
      id: `page:${d.view}`,
      kind: "page" as const,
      title: d.label,
      detail: d.description,
      route: { view: d.view },
    })),
    ...(["projects", "agents", "domains", "offices", "engines"] as const).map((view) => ({
      id: `page:${view}`,
      kind: "page" as const,
      title: viewLabels[view],
      detail:
        view === "engines"
          ? "Library · MCPs, skills, agents, connectors"
          : view === "projects"
            ? "Project details and directories"
            : "Company directory",
      route: { view },
    })),
  ];
  const records: FindResult[] = [
    ...(company.chats || []).map((c) => ({
      id: c.id,
      kind: "chat" as const,
      title: c.messages[0]?.text || "Chat",
      detail: `Chat · ${c.engine}`,
      route: { view: "start" as const, chatId: c.id },
    })),
    ...(company.tasks || []).map((t) => ({
      id: t.id,
      kind: "task" as const,
      title: t.title,
      detail: `Planned task · ${t.brief}`,
    })),
    ...(company.projects || []).map((p) => ({
      id: p.id,
      kind: "project" as const,
      title: p.name,
      detail: `Project · ${p.brief}`,
    })),
    ...company.offices.flatMap((o) =>
      o.agents.map((a) => ({
        id: a.id,
        kind: "agent" as const,
        title: a.name,
        detail: `${o.name} · ${a.role} · ${a.engine}`,
      })),
    ),
    ...company.offices.map((o) => ({
      id: o.id,
      kind: "office" as const,
      title: o.name,
      detail: `Office · ${o.domain}`,
    })),
    ...companyDomains(company).map((d) => ({
      id: d,
      kind: "domain" as const,
      title: d,
      detail: "Domain",
    })),
  ];
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length)
    return [...pages.slice(0, 6), ...records.filter((r) => r.kind === "task").slice(0, 5)];
  return [...pages, ...records]
    .filter((r) => words.every((w) => `${r.title} ${r.detail}`.toLowerCase().includes(w)))
    .sort(
      (a, b) =>
        Number(b.title.toLowerCase().startsWith(words[0]!)) -
        Number(a.title.toLowerCase().startsWith(words[0]!)),
    )
    .slice(0, 40);
}
