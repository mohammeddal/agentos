import { describe, expect, it } from "vitest";
import {
  isCompany,
  isCompanyProject,
  isCompanyTask,
  projectDirectoryTeam,
  projectDomainNames,
  projectParticipants,
  starterCompany,
  type CompanyProject,
  type CompanyTask,
} from "../company/company-model";
import { projectFolders } from "./project-directories";
const project: CompanyProject = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Insights",
  brief: "",
  domains: ["Data & Analytics"],
  agentIds: ["analyst", "reviewer"],
  createdAt: "2026-09-27T12:00:00Z",
};
const task: CompanyTask = {
  id: "task",
  title: "Build",
  brief: "",
  status: "planned",
  createdAt: project.createdAt,
  assignment: { kind: "agents", targets: ["developer"] },
  projectId: project.id,
};
describe("company projects", () => {
  it("keeps older companies and tasks compatible", () => {
    expect(isCompany(starterCompany)).toBe(true);
    expect(isCompany({ ...starterCompany, projects: [project] })).toBe(true);
    expect(isCompanyTask(task)).toBe(true);
    expect(isCompanyTask({ ...task, projectId: 5 })).toBe(false);
    expect(isCompany({ ...starterCompany, projects: [project, project] })).toBe(false);
    expect(isCompanyProject({ ...project, agentIds: null })).toBe(false);
    expect(isCompanyProject({ ...project, id: "../../escape" })).toBe(false);
  });
  it("unions domain and direct membership without duplicates", () => {
    expect(projectParticipants(starterCompany, project).map((a) => a.id)).toEqual([
      "data-engineer",
      "analyst",
      "investigator",
      "reviewer",
    ]);
    expect(projectDomainNames(starterCompany, project)).toEqual([
      "Data & Analytics",
      "Software Engineering",
    ]);
  });
  it("includes only this project's task owners, including empty domains", () => {
    const company = {
      ...starterCompany,
      tasks: [
        task,
        { ...task, id: "empty", assignment: { kind: "domains" as const, targets: ["Research"] } },
      ],
    };
    expect(projectDirectoryTeam(company, project)).toHaveLength(5);
    expect(projectDomainNames(company, project)).toContain("Research");
    expect(
      projectDirectoryTeam({ ...company, tasks: [{ ...task, projectId: "other" }] }, project),
    ).toHaveLength(4);
  });
  it("follows domain changes and stable agent IDs", () => {
    const company = structuredClone(starterCompany);
    const agent = company.offices[0]!.agents.pop()!;
    company.offices[2]!.agents.push(agent);
    expect(projectParticipants(company, project).map((a) => a.id)).not.toContain(agent.id);
    expect(
      projectParticipants(company, { ...project, agentIds: [agent.id] }).map((a) => a.id),
    ).toContain(agent.id);
  });
  it("creates a stable safe folder plan and separates same-slug domains", async () => {
    const p = { ...project, domains: ["A/B", "A B", "../outside"] };
    const folders = await projectFolders(starterCompany, p);
    expect(new Set(folders.map((f) => f.relative)).size).toBe(folders.length);
    expect(folders.every((f) => !f.relative.includes(".."))).toBe(true);
    expect(
      (await projectFolders(starterCompany, { ...p, name: "Renamed" })).map((f) => f.relative),
    ).toEqual(folders.map((f) => f.relative));
    const renamed = structuredClone(starterCompany);
    renamed.offices[1]!.agents[1]!.name = "Another name";
    expect((await projectFolders(renamed, p)).map((f) => f.relative)).toEqual(
      folders.map((f) => f.relative),
    );
  });
});
