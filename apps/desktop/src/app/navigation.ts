import type { Company } from "../features/company/company-model";
import { activeCompany } from "../features/company/company-directory";

export type WorkspaceView = "start" | "tasks" | "map" | "memory" | "engines" | "settings";
export type WorkspaceRoute = {
  view: WorkspaceView;
  projectId?: string;
  chatId?: string;
  taskId?: string;
};
export const destinations = [
  { view: "start", label: "Start", description: "Write a prompt or continue a chat" },
  { view: "map", label: "Company", description: "Offices, agents, and workflows" },
  { view: "memory", label: "Library", description: "Memory and local capabilities" },
] as const;
export function primaryView(view: WorkspaceView): WorkspaceView {
  return ["map", "tasks"].includes(view) ? "map" : view === "engines" ? "memory" : view;
}
export const viewLabels: Record<WorkspaceView, string> = {
  start: "Start",
  tasks: "Workflows",
  map: "Company Hub",
  memory: "Memory",
  engines: "Capabilities",
  settings: "Settings",
};
const paths: Record<WorkspaceView, string> = {
  start: "start",
  tasks: "tasks",
  map: "company/map",
  memory: "library/memory",
  engines: "library/engines",
  settings: "settings",
};
export function routeHash(route: WorkspaceRoute): string {
  if (route.chatId) return `#/chats/${encodeURIComponent(route.chatId)}`;
  if (route.taskId) return `#/workflows/${encodeURIComponent(route.taskId)}`;
  if (route.view === "start" && route.projectId)
    return `#/start?project=${encodeURIComponent(route.projectId)}`;
  return `#/${paths[route.view]}`;
}
export function parseRoute(hash: string): WorkspaceRoute {
  const path = hash.replace(/^#\/?/, "");
  // Workflows live inside offices on the map; the old list link opens the map.
  if (path === "tasks") return { view: "map" };
  const exact = Object.entries(paths).find(([, value]) => value === path);
  if (exact) return { view: exact[0] as WorkspaceView };
  // Offices, agents, and projects no longer have pages; old links land on their new homes.
  if (/^company\/(domains|offices|agents)(\/[^/]+)?$/.test(path)) return { view: "map" };
  try {
    if (/^chats\/[^/]+$/.test(path))
      return { view: "start", chatId: decodeURIComponent(path.slice("chats/".length)) };
    if (/^workflows\/[^/]+$/.test(path))
      return { view: "tasks", taskId: decodeURIComponent(path.slice("workflows/".length)) };
    if (path.startsWith("start?")) {
      const projectId = new URLSearchParams(path.slice(6)).get("project");
      return projectId ? { view: "start", projectId } : { view: "start" };
    }
    if (/^projects\/[^/]+$/.test(path))
      return { view: "start", projectId: decodeURIComponent(path.slice("projects/".length)) };
  } catch {
    /* Malformed links return to the safe start page. */
  }
  return { view: "start" };
}
export type FindResult = {
  id: string;
  kind: "page" | "task" | "chat" | "project" | "agent" | "office";
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
    ...(["engines", "settings"] as const).map((view) => ({
      id: `page:${view}`,
      kind: "page" as const,
      title: viewLabels[view],
      detail:
        view === "engines"
          ? "Library · MCPs, skills, agents, connectors"
          : "Engines, project inventory, and notifications",
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
      detail: `Office · ${o.agents.length} ${o.agents.length === 1 ? "agent" : "agents"}`,
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
