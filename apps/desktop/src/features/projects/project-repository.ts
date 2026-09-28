import { invoke, isTauri } from "@tauri-apps/api/core";

export type RepositoryInfo = {
  path: string;
  git: boolean;
  currentBranch: string;
  branches: string[];
};

/** Pick a project folder with the macOS picker, or inspect a folder's git branches. */
export async function projectRepository(
  action: "pick" | "inspect",
  path = "",
): Promise<RepositoryInfo | null> {
  if (!isTauri()) throw new Error("Choosing a project folder is available in the Mac app.");
  return invoke<RepositoryInfo | null>("project_repository", { action, path });
}
