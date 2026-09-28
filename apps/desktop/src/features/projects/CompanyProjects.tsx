import { useEffect, useState } from "react";
import { ArrowRight, Check, FolderOpen, GitBranch, X } from "lucide-react";
import type { Company, CompanyProject } from "../company/company-model";
import { projectRepository, type RepositoryInfo } from "./project-repository";
import "./company-projects.css";

/** Codex-style project: a name, the folder it works in, and optionally a git branch. */
export function ProjectForm({
  company,
  existing,
  save,
}: {
  company: Company;
  existing?: CompanyProject | undefined;
  save: (project: CompanyProject) => void;
}) {
  const [name, setName] = useState(existing?.name || "");
  const [brief, setBrief] = useState(existing?.brief || "");
  const [directory, setDirectory] = useState(existing?.directory || "");
  const [branch, setBranch] = useState(existing?.branch || "");
  const [repo, setRepo] = useState<RepositoryInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const duplicate = (company.projects || []).some(
    (p) => p.id !== existing?.id && p.name.toLowerCase() === name.trim().toLowerCase(),
  );
  useEffect(() => {
    if (!existing?.directory) return;
    projectRepository("inspect", existing.directory)
      .then(setRepo)
      .catch((cause) => setError(String(cause).replace(/^Error: /, "")));
  }, [existing?.directory]);
  async function chooseFolder() {
    setBusy(true);
    setError("");
    try {
      const picked = await projectRepository("pick");
      if (!picked) return;
      setRepo(picked);
      setDirectory(picked.path);
      setBranch(picked.git ? picked.currentBranch : "");
      if (!name.trim()) setName(picked.path.split("/").filter(Boolean).at(-1)?.slice(0, 80) || "");
    } catch (cause) {
      setError(String(cause).replace(/^Error: /, ""));
    } finally {
      setBusy(false);
    }
  }
  const branches = [...new Set([...(repo?.branches || []), ...(branch ? [branch] : [])])];
  return (
    <form
      className="co-form co-project-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || duplicate) return;
        const { directory: _directory, branch: _branch, ...rest } = existing || {};
        save({
          ...rest,
          id: existing?.id || crypto.randomUUID(),
          name: name.trim(),
          brief: brief.trim(),
          domains: existing?.domains || [],
          agentIds: existing?.agentIds || [],
          createdAt: existing?.createdAt || new Date().toISOString(),
          ...(directory ? { directory } : {}),
          ...(directory && branch ? { branch } : {}),
        });
      }}
    >
      <label>
        Project name
        <input
          autoFocus
          required
          maxLength={80}
          value={name}
          placeholder="e.g. Customer insights"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {duplicate && (
        <p className="co-form-error" role="alert">
          A project with this name already exists.
        </p>
      )}
      <div className="co-project-folder">
        <span>Folder</span>
        <div>
          <FolderOpen size={15} />
          <code title={directory}>{directory || "AgentOS workspace (no folder chosen)"}</code>
          {directory && (
            <button
              type="button"
              className="co-icon-button"
              aria-label="Use the AgentOS workspace instead"
              onClick={() => {
                setDirectory("");
                setBranch("");
                setRepo(null);
              }}
            >
              <X size={14} />
            </button>
          )}
          <button type="button" className="co-button" disabled={busy} onClick={chooseFolder}>
            {busy ? "Choosing…" : directory ? "Change…" : "Choose folder…"}
          </button>
        </div>
        <small>Chats and workflows in this project run in this folder, like Codex.</small>
      </div>
      {directory && (repo?.git || branch) && (
        <label>
          <span className="co-project-branch-label">
            <GitBranch size={13} /> Branch
          </span>
          <select value={branch} onChange={(e) => setBranch(e.target.value)}>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
                {b === repo?.currentBranch ? " (checked out)" : ""}
              </option>
            ))}
          </select>
          <small>
            {branch && repo && branch !== repo.currentBranch
              ? "Runs on a separate worktree for this branch, so your checkout stays untouched."
              : "Runs directly in the folder on the checked-out branch."}
          </small>
        </label>
      )}
      {directory && repo && !repo.git && (
        <p className="co-project-hint">
          This folder is not a git repository, so it has no branches.
        </p>
      )}
      <label>
        Notes <small>(optional)</small>
        <textarea
          rows={2}
          maxLength={3000}
          value={brief}
          placeholder="What are we working toward?"
          onChange={(e) => setBrief(e.target.value)}
        />
      </label>
      {error && (
        <p className="co-form-error" role="alert">
          {error}
        </p>
      )}
      <button className="co-button co-button-primary" disabled={!name.trim() || duplicate}>
        {existing ? "Save project" : "Create project"}
        {existing ? <Check size={14} /> : <ArrowRight size={14} />}
      </button>
    </form>
  );
}
