import { describe, expect, it } from "vitest";
import { isCompanyProject } from "../company/company-model";

const project = {
  id: "00000000-0000-4000-8000-000000000000",
  name: "Repo",
  brief: "",
  domains: [],
  agentIds: [],
  createdAt: new Date(0).toISOString(),
};

describe("Codex-style project folders", () => {
  it("accepts projects with or without a chosen folder and branch", () => {
    expect(isCompanyProject(project)).toBe(true);
    expect(isCompanyProject({ ...project, directory: "/Users/me/repo" })).toBe(true);
    expect(isCompanyProject({ ...project, directory: "/Users/me/repo", branch: "main" })).toBe(
      true,
    );
  });
  it("rejects relative folders and malformed branches", () => {
    expect(isCompanyProject({ ...project, directory: "repo" })).toBe(false);
    expect(isCompanyProject({ ...project, directory: 42 })).toBe(false);
    expect(isCompanyProject({ ...project, branch: "x".repeat(201) })).toBe(false);
  });
});
