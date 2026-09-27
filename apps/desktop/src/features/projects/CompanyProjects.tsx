import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  Folder,
  FolderOpen,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  projectDirectoryTeam,
  projectDomainNames,
  taskParticipants,
  type Company,
  type CompanyProject,
  type CompanyTask,
} from "../company/company-model";
import {
  projectFolders,
  projectFolderRequest,
  type FolderStatus,
  type ProjectFolder,
} from "./project-directories";
import { HelpTip } from "../../shared/HelpTip";
import "./company-projects.css";

type Scope = { projectId?: string; domain?: string; agentId?: string; shared?: boolean };
function officeScopeName(company: Company, scope: string) {
  return company.offices.find((office) => office.domain === scope)?.name || scope;
}
export function CompanyProjects({
  company,
  selectedId,
  select,
  edit,
  createTask,
  editTask,
  inspectAgent,
}: {
  company: Company;
  selectedId: string;
  select: (id: string) => void;
  edit: (project: CompanyProject) => void;
  createTask: (projectId: string, domain?: string, agentId?: string) => void;
  editTask: (task: CompanyTask) => void;
  inspectAgent: (id: string) => void;
}) {
  const [scope, setScope] = useState<Scope>({});
  const projects = company.projects || [];
  const project = projects.find((p) => p.id === selectedId) || projects[0];
  useEffect(() => {
    if (!selectedId && project) select(project.id);
  }, [project?.id, selectedId]);
  // Searching may choose a different visible project; never carry another project's scope over.
  const scopeAvailable =
    project &&
    (!scope.domain || projectDomainNames(company, project).includes(scope.domain)) &&
    (!scope.agentId ||
      projectDirectoryTeam(company, project).some(
        (a) => a.id === scope.agentId && a.office.domain === scope.domain,
      ));
  const activeScope = project?.id === scope.projectId && scopeAvailable ? scope : {};
  if (!project)
    return (
      <section className="co-tasks-empty">
        <span>
          <FolderOpen size={30} />
        </span>
        <h2>No projects yet.</h2>
      </section>
    );
  return (
    <section className="co-project-explorer" aria-label="Company project explorer">
      <aside className="co-project-tree">
        <header>
          <span>PROJECT WORKSPACE</span>
        </header>
        <button
          className="co-project-node"
          aria-pressed={!activeScope.domain && !activeScope.shared}
          onClick={() => setScope({})}
        >
          <FolderOpen size={15} />
          <strong>{project.name}</strong>
          <span>
            {(company.tasks || []).filter((task) => task.projectId === project.id).length}
          </span>
        </button>
        <div className="co-project-children">
          <button
            className="co-project-node"
            aria-pressed={!!activeScope.shared}
            onClick={() => setScope({ shared: true, projectId: project.id })}
          >
            <Folder size={14} />
            Shared
          </button>
          {projectDomainNames(company, project).map((domain) => (
            <details key={domain} open>
              <summary>
                <ChevronRight size={12} />
                <Layers3 size={14} />
                <span>{officeScopeName(company, domain)}</span>
              </summary>
              <div>
                <button
                  className="co-project-node"
                  aria-pressed={activeScope.domain === domain && !activeScope.agentId}
                  onClick={() => setScope({ domain, projectId: project.id })}
                >
                  <Folder size={13} />
                  Office workspace
                </button>
                {projectDirectoryTeam(company, project)
                  .filter((agent) => agent.office.domain === domain)
                  .map((agent) => (
                    <button
                      key={agent.id}
                      className="co-project-node"
                      aria-pressed={activeScope.agentId === agent.id}
                      onClick={() => setScope({ domain, agentId: agent.id, projectId: project.id })}
                    >
                      <Bot size={13} />
                      <span>{agent.name}</span>
                    </button>
                  ))}
              </div>
            </details>
          ))}
        </div>
      </aside>
      <ProjectDetail
        key={project.id}
        company={company}
        project={project}
        scope={activeScope}
        edit={() => edit(project)}
        createTask={() => createTask(project.id, activeScope.domain, activeScope.agentId)}
        editTask={editTask}
        inspectAgent={inspectAgent}
      />
    </section>
  );
}

function ProjectDetail({
  company,
  project,
  scope,
  edit,
  createTask,
  editTask,
  inspectAgent,
}: {
  company: Company;
  project: CompanyProject;
  scope: Scope;
  edit: () => void;
  createTask: () => void;
  editTask: (t: CompanyTask) => void;
  inspectAgent: (id: string) => void;
}) {
  const team = projectDirectoryTeam(company, project);
  const agent = team.find((a) => a.id === scope.agentId);
  const visibleTeam = team.filter(
    (a) =>
      !scope.domain ||
      (a.office.domain === scope.domain && (!scope.agentId || a.id === scope.agentId)),
  );
  const tasks = (company.tasks || []).filter(
    (t) =>
      t.projectId === project.id &&
      (!scope.domain ||
        (scope.agentId
          ? taskParticipants(company, t.assignment).some((a) => a.id === scope.agentId)
          : (t.assignment.kind === "domains" && t.assignment.targets.includes(scope.domain)) ||
            taskParticipants(company, t.assignment).some((a) => a.office.domain === scope.domain))),
  );
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [status, setStatus] = useState<FolderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const directoryKey = JSON.stringify([
    project.id,
    projectDomainNames(company, project),
    team.map((a) => [a.id, a.name, a.office.domain]),
  ]);
  useEffect(() => {
    let active = true;
    setStatus(null);
    setFolders([]);
    setError("");
    setNotice("");
    void projectFolders(company, project)
      .then(async (plan) => {
        if (active) setFolders(plan);
        const found = await projectFolderRequest(
          "status",
          plan.map((f) => f.relative),
        );
        if (active) setStatus(found);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to read project directories.");
      });
    return () => {
      active = false;
    };
  }, [directoryKey, revision]);
  const folder = scope.shared
    ? folders[1]
    : scope.agentId
      ? folders.find((f) => f.agentId === scope.agentId)
      : scope.domain
        ? folders.find((f) => f.domain === scope.domain && !f.agentId)
        : folders[0];
  const exists = !!folder && !!status?.existing.includes(folder.relative);
  const path = status && folder ? `${status.root}/${folder.relative}` : "";
  const missing = folders.filter((f) => !status?.existing.includes(f.relative)).length;
  async function action(kind: "create" | "reveal") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await projectFolderRequest(
        kind,
        kind === "create" ? folders.map((f) => f.relative) : [folder!.relative],
      );
      if (kind === "create") {
        setStatus(result);
        setNotice("Folders are ready. Existing files were left untouched.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Folder operation failed. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }
  const title = scope.shared
    ? "Shared"
    : agent?.name || (scope.domain ? officeScopeName(company, scope.domain) : project.name);
  return (
    <div className="co-project-detail">
      <div className="co-project-location">
        <span>Company</span>
        <ChevronRight size={12} />
        <span>{project.name}</span>
        {scope.domain && (
          <>
            <ChevronRight size={12} />
            <span>{officeScopeName(company, scope.domain)}</span>
          </>
        )}
        {agent && (
          <>
            <ChevronRight size={12} />
            <span>{agent.name}</span>
          </>
        )}
        {scope.shared && (
          <>
            <ChevronRight size={12} />
            <span>Shared</span>
          </>
        )}
      </div>
      <header className="co-project-heading">
        <div>
          <span className="co-section-kicker">
            {agent
              ? "AGENT WORKSPACE"
              : scope.domain
                ? "OFFICE WORKSPACE"
                : scope.shared
                  ? "SHARED WORKSPACE"
                  : "COMPANY PROJECT"}
          </span>
          <h2>{title}</h2>
          <p>
            {agent
              ? `${agent.role} · ${agent.office.name}`
              : scope.domain
                ? "One office’s part in this project."
                : scope.shared
                  ? "A common folder for briefs, references, and deliverables."
                  : project.brief || "Add a brief to give your team a shared direction."}
          </p>
        </div>
        <button className="co-button" onClick={edit}>
          <Pencil size={13} />
          Edit project
        </button>
      </header>
      <div className="co-project-stats">
        <span>
          <strong>{projectDomainNames(company, project).length}</strong> offices
        </span>
        <span>
          <strong>{team.length}</strong> agents
        </span>
        <span>
          <strong>{(company.tasks || []).filter((t) => t.projectId === project.id).length}</strong>{" "}
          planned tasks
        </span>
      </div>
      <section className="co-project-disk" aria-label="Project directory">
        <div>
          <FolderOpen size={18} />
          <strong>Local directory</strong>
          <HelpTip label="About project folders">
            Folders are created only when requested. Team changes can add folders; AgentOS never
            moves or removes existing files. Tasks run from the project root.
          </HelpTip>
          <span className="co-project-disk-status">
            {status ? (exists ? "On disk" : "Not created") : "Not verified"}
          </span>
        </div>
        <code>{path || (error ? "Directory unavailable" : "Checking directory…")}</code>
        <div className="co-project-folder-actions">
          <button
            className="co-button"
            disabled={busy || !folders.length || (!!status && !missing)}
            onClick={() => void action("create")}
          >
            <Plus size={13} />
            {busy
              ? "Working…"
              : missing && status?.existing.length
                ? "Create missing folders"
                : "Create project folders"}
          </button>
          <button
            className="co-button"
            disabled={busy || !exists}
            onClick={() => void action("reveal")}
          >
            <FolderOpen size={13} />
            Open in Finder
          </button>
          <button
            className="co-button"
            disabled={!path}
            onClick={() => {
              void navigator.clipboard.writeText(path).then(
                () => setNotice("Path copied."),
                () => setError("Clipboard unavailable. Select and copy the displayed path."),
              );
            }}
          >
            <Copy size={13} />
            Copy path
          </button>
          <button
            className="co-icon-button"
            aria-label="Refresh project folders"
            disabled={busy}
            onClick={() => {
              setNotice("");
              setRevision((r) => r + 1);
            }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        {error && (
          <p className="co-form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="co-project-notice" role="status">
            {notice}
          </p>
        )}
      </section>
      {!scope.shared && (
        <>
          <div className="co-project-section-heading">
            <h3>{agent ? "Agent" : "Assigned team"}</h3>
            <span>{visibleTeam.length} · Not connected</span>
          </div>
          <div className="co-project-team">
            {visibleTeam.map((a) => (
              <button key={a.id} onClick={() => inspectAgent(a.id)}>
                <Bot size={16} />
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {a.office.name}
                    {!project.domains.includes(a.office.domain) && !project.agentIds.includes(a.id)
                      ? " · Via task"
                      : ""}
                  </small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
            {!visibleTeam.length && (
              <p>No agents assigned here yet. Add an office or choose agents in Edit project.</p>
            )}
          </div>
          <div className="co-project-section-heading">
            <h3>Tasks in this workspace</h3>
            <button className="co-button" onClick={createTask}>
              <Plus size={13} />
              New project task
            </button>
          </div>
          <div className="co-project-tasks">
            {tasks.map((t) => (
              <button key={t.id} onClick={() => editTask(t)}>
                <ClipboardList size={16} />
                <span>
                  <strong>{t.title}</strong>
                  <small>
                    {t.assignment.kind === "domains"
                      ? t.assignment.targets
                          .map((target) => officeScopeName(company, target))
                          .join(" · ")
                      : taskParticipants(company, t.assignment)
                          .map((a) => a.name)
                          .join(" · ")}
                  </small>
                </span>
                <em>Planned</em>
                <ChevronRight size={13} />
              </button>
            ))}
            {!tasks.length && (
              <p>No tasks here yet. Create one, or link an existing task to this project.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

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
  const [domains, setDomains] = useState(existing?.domains || []);
  const [agentIds, setAgentIds] = useState(existing?.agentIds || []);
  const duplicate = (company.projects || []).some(
    (p) => p.id !== existing?.id && p.name.toLowerCase() === name.trim().toLowerCase(),
  );
  const toggle = (items: string[], id: string) =>
    items.includes(id) ? items.filter((v) => v !== id) : [...items, id];
  const allAgents = company.offices.flatMap((o) => o.agents.map((a) => ({ ...a, office: o })));
  const missingAgents = agentIds.filter((id) => !allAgents.some((a) => a.id === id));
  return (
    <form
      className="co-form co-project-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && !duplicate)
          save({
            id: existing?.id || crypto.randomUUID(),
            name: name.trim(),
            brief: brief.trim(),
            domains,
            agentIds,
            createdAt: existing?.createdAt || new Date().toISOString(),
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
      <label>
        Project brief
        <textarea
          rows={3}
          maxLength={3000}
          value={brief}
          placeholder="What are we working toward?"
          onChange={(e) => setBrief(e.target.value)}
        />
      </label>
      <fieldset>
        <legend>Assign whole offices</legend>
        <div className="co-project-options">
          {[...new Set([...company.offices.map((office) => office.domain), ...domains])].map(
            (domain) => (
              <label key={domain}>
                <input
                  type="checkbox"
                  checked={domains.includes(domain)}
                  onChange={() => setDomains(toggle(domains, domain))}
                />
                <Layers3 size={14} />
                <span>{officeScopeName(company, domain)}</span>
              </label>
            ),
          )}
        </div>
        <p className="co-project-hint">
          All agents in these offices join automatically as your teams grow.
        </p>
      </fieldset>
      <fieldset>
        <legend>Add individual agents</legend>
        <div className="co-project-options">
          {allAgents.map((a) => (
            <label key={a.id}>
              <input
                type="checkbox"
                checked={agentIds.includes(a.id)}
                onChange={() => setAgentIds(toggle(agentIds, a.id))}
              />
              <Bot size={14} />
              <span>
                {a.name}
                <small>
                  {a.office.name}
                  {domains.includes(a.office.domain) ? " · Already included through office" : ""}
                </small>
              </span>
            </label>
          ))}
        </div>
        {missingAgents.map((id) => (
          <button
            type="button"
            className="co-button"
            key={id}
            onClick={() => setAgentIds(toggle(agentIds, id))}
          >
            Remove unavailable agent: {id}
          </button>
        ))}
      </fieldset>
      <div className="co-form-note">
        Project and task owners appear in the directory tree. Saving here organizes the project; use
        Create project folders to make its directories on disk.
      </div>
      <button className="co-button co-button-primary" disabled={!name.trim() || duplicate}>
        {existing ? "Save project" : "Create project"}
        {existing ? <Check size={14} /> : <ArrowRight size={14} />}
      </button>
    </form>
  );
}
