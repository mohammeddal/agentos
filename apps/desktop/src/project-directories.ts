import { projectDirectoryTeam, projectDomainNames, type Company, type CompanyProject } from "./company-model";
import { invoke } from "@tauri-apps/api/core";

export type ProjectFolder = { relative: string; label: string; domain?: string; agentId?: string };
export type FolderStatus = { root: string; existing: string[] };
// Names remain readable; full SHA-256 identity keeps duplicate names and unsafe characters apart.
async function segment(label: string, identity: string) {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity))), b => b.toString(16).padStart(2, "0")).join("");
  return `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "item"}--${hash}`;
}
export async function projectFolders(company: Company, project: CompanyProject): Promise<ProjectFolder[]> {
  const root = `project-${project.id}`;
  const result: ProjectFolder[] = [{ relative: root, label: project.name }, { relative: `${root}/shared`, label: "Shared" }];
  const team = projectDirectoryTeam(company, project);
  for (const domain of projectDomainNames(company, project)) {
    const path = `${root}/domains/${await segment(domain, domain)}`;
    result.push({ relative: path, label: domain, domain });
    for (const agent of team.filter(a => a.office.domain === domain)) {
      // Use stable agent ID as label too, so renaming an agent cannot move its directory.
      result.push({ relative: `${path}/agents/${await segment(agent.id, agent.id)}`, label: agent.name, domain, agentId: agent.id });
    }
  }
  return result;
}
export async function projectFolderRequest(action: "status" | "create" | "reveal", folders: string[]): Promise<FolderStatus> {
  if ("__TAURI_INTERNALS__" in window) {
    return invoke<FolderStatus>("project_directories", { action, folders });
  }
  const response = await fetch("/api/project-directories", { method: "POST", headers: { "Content-Type": "application/json", "X-AgentOS-Projects": "1" }, body: JSON.stringify({ action, folders }) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Project folders are unavailable. Use the local development server or the desktop app."); }
  return response.json();
}
