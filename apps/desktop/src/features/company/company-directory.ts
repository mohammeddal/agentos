import type { Company } from "./company-model";

export type DirectoryKind = "project" | "chat" | "task";
export type Lifecycle = "active" | "archived" | "removed";
export type DirectoryEntry = {
  kind: DirectoryKind;
  id: string;
  title: string;
  projectId?: string | undefined;
  lifecycle: Lifecycle;
  createdAt: string;
};
export function directoryEntries(company: Company): DirectoryEntry[] {
  return [
    ...(company.projects || []).map((p) => ({
      kind: "project" as const,
      id: p.id,
      title: p.name,
      lifecycle: p.lifecycle || ("active" as const),
      createdAt: p.createdAt,
    })),
    ...(company.chats || []).map((c) => ({
      kind: "chat" as const,
      id: c.id,
      title: c.messages[0]?.text || "New chat",
      projectId: c.projectId,
      lifecycle: c.lifecycle || ("active" as const),
      createdAt: c.createdAt,
    })),
    ...(company.tasks || []).map((t) => ({
      kind: "task" as const,
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      lifecycle: t.lifecycle || ("active" as const),
      createdAt: t.createdAt,
    })),
  ];
}
export function activeCompany(company: Company): Company {
  const projects = (company.projects || []).filter((p) => !p.lifecycle || p.lifecycle === "active");
  const visible = (item: { lifecycle?: Lifecycle; projectId?: string }) =>
    (!item.lifecycle || item.lifecycle === "active") &&
    (!item.projectId || projects.some((p) => p.id === item.projectId));
  return {
    ...company,
    projects,
    chats: company.chats?.filter(visible) || [],
    tasks: company.tasks?.filter(visible) || [],
  };
}
export function affectedRunKeys(
  company: Company,
  entry: Pick<DirectoryEntry, "id" | "kind">,
): string[] {
  const keys =
    entry.kind === "project"
      ? directoryEntries(company)
          .filter((e) => e.projectId === entry.id)
          .map((e) => `${e.kind}:${e.id}`)
      : [`${entry.kind}:${entry.id}`];
  // Frozen schedules may include linked tasks. Pause/block their parents too.
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of company.tasks || [])
      if (
        !keys.includes(`task:${task.id}`) &&
        task.handoffs?.some((h) => h.kind === "task" && keys.includes(`task:${h.targetId}`))
      ) {
        keys.push(`task:${task.id}`);
        changed = true;
      }
  }
  return keys;
}
export function changeLifecycle(
  company: Company,
  entry: Pick<DirectoryEntry, "id" | "kind">,
  lifecycle: Lifecycle,
  activeKeys: string[] = [],
): Company {
  if (!directoryEntries(company).some((e) => e.kind === entry.kind && e.id === entry.id))
    throw new Error("This item is no longer available.");
  if (
    lifecycle !== "active" &&
    affectedRunKeys(company, entry).some((key) => activeKeys.includes(key))
  )
    throw new Error(
      "Stop or finish the active run in its chat or workflow before archiving or removing this item.",
    );
  const update = <T extends { id: string; lifecycle?: Lifecycle }>(rows: T[] | undefined) =>
    (rows || []).map((r) => (r.id === entry.id ? { ...r, lifecycle } : r));
  if (entry.kind === "project") return { ...company, projects: update(company.projects) };
  if (entry.kind === "task") return { ...company, tasks: update(company.tasks) };
  return { ...company, chats: update(company.chats) };
}
export function validLifecycle(value: unknown) {
  return (
    value === undefined ||
    (typeof value === "string" && ["active", "archived", "removed"].includes(value))
  );
}
