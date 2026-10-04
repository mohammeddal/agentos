import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Building2,
  Check,
  Eye,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { type Company } from "../company/company-model";
import {
  conflictingIds,
  duplicateEntry,
  entryError,
  memoryContext,
  memoryDocuments,
  memoryKinds,
  parseEntryDocument,
  parseMemory,
  renderEntryDocument,
  renderMemory,
  type MemoryEntry,
  type MemoryLibrary,
} from "./company-memory";
import { memoryFile, type MemoryFile } from "./memory-storage";
import { isRehearsalRun } from "../activity/task-rehearsal";
import "../activity/company-activity.css";
import "./company-memory.css";
import { useLiveRuntime } from "../engines/live-runtime";

function issueCandidates(): MemoryEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("agentos:rehearsals:v1") || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(isRehearsalRun).flatMap((run) =>
      run.actions
        .filter((a) => ["failed", "rejected"].includes(a.status))
        .map((action) => ({
          id: crypto.randomUUID(),
          title: `Review: ${action.label}`.slice(0, 120),
          kind: "lesson" as const,
          status: "draft" as const,
          scope: "company",
          source: "rehearsal" as const,
          sourceId: `${run.id}:${action.id}`,
          body: `In a simulated run, “${action.label}” was ${action.status}. This is a rehearsal observation, not evidence of a real-world failure.`,
          evidence: `Rehearsal ${run.id}, task: ${run.title}. ${action.gates
            .filter((g) => g.decision === "rejected")
            .map((g) => `${g.reviewerName}: ${g.note}`)
            .join(" ")}`,
          prevention: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
    );
  } catch {
    return [];
  }
}
function freshEntry(): MemoryEntry {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    kind: "fact",
    status: "draft",
    title: "",
    body: "",
    evidence: "",
    prevention: "",
    scope: "company",
    source: "manual",
    sourceId: "",
    createdAt: now,
    updatedAt: now,
  };
}
const editableDocument = (markdown: string) => {
  const markerEnd = markdown.indexOf("\n-->\n");
  return markerEnd < 0 ? markdown : markdown.slice(markerEnd + 5);
};
const replaceEditableDocument = (markdown: string, editable: string) => {
  const markerEnd = markdown.indexOf("\n-->\n");
  return markerEnd < 0 ? editable : `${markdown.slice(0, markerEnd + 5)}${editable}`;
};
/** The file's name is its "# " heading; renaming rewrites only that line. */
const documentTitle = (markdown: string) => {
  const editable = editableDocument(markdown);
  if (!editable.startsWith("# ")) return "";
  const end = editable.indexOf("\n");
  return editable.slice(2, end < 0 ? undefined : end).trim();
};
const withTitle = (markdown: string, title: string) => {
  const editable = editableDocument(markdown);
  const end = editable.indexOf("\n");
  const rest = editable.startsWith("# ")
    ? end < 0
      ? "\n"
      : editable.slice(end)
    : `\n\n${editable}`;
  return replaceEditableDocument(markdown, `# ${title.replace(/\n/g, " ")}${rest}`);
};

export function CompanyMemory({
  company,
  query,
  createRequest,
  back,
}: {
  company: Company;
  query: string;
  createRequest?: number;
  /** Return to the workflow that asked for new context. */
  back?: (() => void) | undefined;
}) {
  const live = useLiveRuntime();
  const [library, setLibrary] = useState<MemoryLibrary | null>(null);
  const [file, setFile] = useState<MemoryFile | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<MemoryEntry | null>(null);
  const [documentDraft, setDocumentDraft] = useState("");
  const [editorMode, setEditorMode] = useState<"write" | "preview" | "details">("write");
  const [tab, setTab] = useState<"library" | "issues" | "context">("library");
  const [filter, setFilter] = useState("all"),
    [scope, setScope] = useState("company"),
    [contextQuery, setContextQuery] = useState("");
  const [rehearsalCandidates, setCandidates] = useState(issueCandidates);
  const candidates: MemoryEntry[] = [
    ...live.runs
      .filter((run) => run.status === "failed")
      .map(
        (run): MemoryEntry => ({
          id: `live-${run.request.id}`,
          kind: "issue",
          status: "draft",
          title: `Review: ${run.request.title}`.slice(0, 120),
          body: run.error.slice(0, 5500),
          evidence: `Live run ${run.request.id}; engine: ${run.engine}; recorded ${new Date(run.updatedAt).toISOString()}. Open the chat or workflow for full execution evidence.`,
          prevention: "",
          scope: "company",
          source: "manual",
          sourceId: `live:${run.request.id}`,
          createdAt: new Date(run.updatedAt).toISOString(),
          updatedAt: new Date(run.updatedAt).toISOString(),
        }),
      ),
    ...rehearsalCandidates,
  ];
  const handledCreateRequest = useRef(0);
  const officeScopes = Array.from(
    new Map(
      company.offices.map((office) => [
        `domain:${office.domain}`,
        { value: `domain:${office.domain}`, label: office.name },
      ]),
    ).values(),
  );
  const agentScopes = company.offices.flatMap((office) =>
    office.agents.map((agent) => ({
      value: `agent:${agent.id}`,
      label: agent.name,
      office: office.name,
    })),
  );
  const scopes = [
    { value: "company", label: "Main memory" },
    ...officeScopes.map((office) => ({ ...office, label: `Office · ${office.label}` })),
    ...agentScopes.map((agent) => ({
      value: agent.value,
      label: `Agent · ${agent.label} (${agent.office})`,
    })),
  ];
  const scopeTier =
    scope === "company" ? "company" : scope.startsWith("domain:") ? "office" : "agent";
  const selectedScope = scopes.find((item) => item.value === scope);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const next = await memoryFile();
      const legacy = parseMemory(next.contents);
      const savedDocuments = next.documents.filter((document) => document.path !== "MEMORY.md");
      const parsed = savedDocuments.length
        ? {
            ...legacy,
            entries: savedDocuments.map((document) => parseEntryDocument(document.contents)),
          }
        : legacy;
      setFile(next);
      setLibrary(parsed);
      setCandidates(issueCandidates());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!library || !createRequest || handledCreateRequest.current === createRequest) return;
    handledCreateRequest.current = createRequest;
    setTab("library");
    setFilter("all");
    setScope("company");
    const entry = freshEntry();
    setDraft(entry);
    setDocumentDraft(renderEntryDocument(entry));
  }, [library, createRequest]);
  useEffect(() => {
    if (!scopes.some((item) => item.value === scope)) {
      setScope("company");
      setDraft(null);
    }
  }, [company, scope]);
  async function persist(next: MemoryLibrary): Promise<boolean> {
    if (!file) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await memoryFile({
        expected: file.contents,
        contents: renderMemory(next),
        expectedDocuments: file.documents,
        documents: memoryDocuments(next),
      });
      setFile(saved);
      setLibrary(next);
      setNotice("Saved to Markdown on this device.");
      return true;
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const conflicts = library ? conflictingIds(library) : new Set<string>();
  const visible =
    library?.entries.filter(
      (e) =>
        e.scope === scope &&
        (filter === "all" || e.status === filter) &&
        `${e.title} ${e.body} ${e.evidence}`.toLowerCase().includes(query.toLowerCase()),
    ) || [];
  const selectedAgentOffice = company.offices.find((o) =>
    o.agents.some((a) => `agent:${a.id}` === scope),
  );
  const context = library
    ? memoryContext(
        library,
        [scope, ...(selectedAgentOffice ? [`domain:${selectedAgentOffice.domain}`] : [])],
        contextQuery,
      )
    : [];
  function patch(change: Partial<MemoryEntry>) {
    setDraft((current) => (current ? { ...current, ...change } : current));
  }
  function openEntry(entry: MemoryEntry) {
    setDraft({ ...entry });
    setDocumentDraft(renderEntryDocument(entry));
    setEditorMode("write");
  }
  function newEntry() {
    const entry = { ...freshEntry(), scope };
    setDraft(entry);
    setDocumentDraft(renderEntryDocument(entry));
    setEditorMode("write");
  }
  function chooseScope(next: string) {
    setScope(next);
    setDraft(null);
  }
  function chooseTier(next: "company" | "office" | "agent") {
    if (next === "company") chooseScope("company");
    else if (next === "office") chooseScope(officeScopes[0]?.value || "company");
    else chooseScope(agentScopes[0]?.value || "company");
  }
  const companyCount = library?.entries.filter((entry) => entry.scope === "company").length || 0;
  const officeCount =
    library?.entries.filter((entry) => entry.scope.startsWith("domain:")).length || 0;
  const agentCount =
    library?.entries.filter((entry) => entry.scope.startsWith("agent:")).length || 0;
  return (
    <section className="co-memory">
      <div className="co-memory-bar">
        <nav className="co-memory-levels" aria-label="Memory level">
          {(
            [
              ["company", "Main", companyCount],
              ["office", "Offices", officeCount],
              ["agent", "Agents", agentCount],
            ] as const
          ).map(([tier, label, count]) => (
            <button
              key={tier}
              type="button"
              aria-pressed={tab === "library" && scopeTier === tier}
              disabled={
                (tier === "office" && !officeScopes.length) ||
                (tier === "agent" && !agentScopes.length)
              }
              onClick={() => {
                setTab("library");
                chooseTier(tier);
              }}
            >
              {label}
              <small>{count}</small>
            </button>
          ))}
        </nav>
        {tab === "library" && scopeTier !== "company" && (
          <select
            aria-label={scopeTier === "office" ? "Office" : "Agent"}
            value={scope}
            onChange={(event) => chooseScope(event.target.value)}
          >
            {(scopeTier === "office" ? officeScopes : agentScopes).map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        )}
        <span className="co-memory-bar-gap" />
        {back && (
          <button className="co-button" onClick={back}>
            <ArrowLeft size={14} />
            Back to workflow
          </button>
        )}
        <button
          className="co-button co-button-primary"
          disabled={busy || !library}
          onClick={() => {
            setTab("library");
            newEntry();
          }}
        >
          <Plus size={14} />
          New note
        </button>
        <details className="co-memory-menu">
          <summary aria-label="Memory settings" title="Memory settings">
            <SlidersHorizontal size={15} />
          </summary>
          <div>
            <label>
              <input
                type="checkbox"
                checked={library?.enabled || false}
                disabled={!library || busy}
                onChange={() => library && void persist({ ...library, enabled: !library.enabled })}
              />
              <span>
                Memory on<small>Share notes with agents</small>
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={library ? library.learn !== false : false}
                disabled={!library || busy}
                onChange={() =>
                  library && void persist({ ...library, learn: library.learn === false })
                }
              />
              <span>
                Learn from runs<small>Save lessons and failures automatically</small>
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={library?.strict || false}
                disabled={!library || busy}
                onChange={() => library && void persist({ ...library, strict: !library.strict })}
              />
              <span>
                Strict review<small>Only reviewed notes with evidence reach agents</small>
              </span>
            </label>
            <button type="button" onClick={() => setTab(tab === "context" ? "library" : "context")}>
              <Eye size={13} /> {tab === "context" ? "Back to notes" : "Preview what agents see"}
            </button>
            <button type="button" disabled={busy} onClick={() => void load()}>
              <RefreshCw size={13} /> Reload from disk
            </button>
            {file?.directory && (
              <small className="co-memory-path" title={file.directory}>
                <FolderOpen size={12} /> {file.directory}
              </small>
            )}
          </div>
        </details>
      </div>
      {error && (
        <p className="co-form-error" role="alert">
          {error} Your unsaved editor text is retained.
        </p>
      )}
      {notice && (
        <p className="co-memory-notice" role="status">
          <Check size={13} />
          {notice}
        </p>
      )}
      {!library ? (
        <p>
          {busy
            ? "Opening memory file…"
            : "Memory cannot be loaded. No existing file has been changed."}
        </p>
      ) : (
        <>
          {conflicts.size > 0 && (
            <div className="co-memory-warning">
              {conflicts.size} reviewed records have conflicting statements under the same title and
              scope. They are excluded from context until you edit or archive the conflicting
              records. This detects matching-title conflicts, not every semantic contradiction.
            </div>
          )}
          {tab === "library" && (
            <>
              {library.strict && (
                <div className="co-memory-tools">
                  <label>
                    Show
                    <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                      <option value="all">All notes</option>
                      <option value="draft">Needs review</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="co-memory-workspace">
                <aside className="co-memory-files" aria-label="Markdown memory files">
                  {visible.map((entry) => (
                    <button
                      className={draft?.id === entry.id ? "selected" : ""}
                      key={entry.id}
                      onClick={() => openEntry(entry)}
                    >
                      <FileText size={14} />
                      <span>
                        <strong>{entry.title}</strong>
                        <small>
                          {conflicts.has(entry.id)
                            ? "Conflict · excluded"
                            : library.strict
                              ? `${memoryKinds[entry.kind]} · ${entry.status}`
                              : entry.status === "archived"
                                ? "Archived · hidden from agents"
                                : entry.source === "run"
                                  ? `Learned · ${memoryKinds[entry.kind]}`
                                  : "Shared with agents"}
                        </small>
                      </span>
                    </button>
                  ))}
                  {!visible.length && <p>No notes here yet.</p>}
                </aside>
                {!draft ? (
                  <article className="co-memory-file-view co-memory-empty">
                    <FileText size={20} />
                    <p>Select a note, or create one with New note.</p>
                  </article>
                ) : (
                  <form
                    className="co-memory-file-view"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      let parsed: MemoryEntry;
                      try {
                        parsed = parseEntryDocument(documentDraft);
                      } catch (reason) {
                        setError(
                          reason instanceof Error
                            ? reason.message
                            : "Invalid Markdown memory file.",
                        );
                        return;
                      }
                      const entry = {
                        ...parsed,
                        kind: draft.kind,
                        status: draft.status,
                        scope: draft.scope,
                        updatedAt: new Date().toISOString(),
                      };
                      const validation =
                        entryError(entry, library.strict) ||
                        (duplicateEntry(library, entry)
                          ? "This statement is already recorded in the same scope."
                          : null);
                      if (validation) {
                        setError(validation);
                        return;
                      }
                      if (
                        await persist({
                          ...library,
                          entries: library.entries.some((v) => v.id === entry.id)
                            ? library.entries.map((v) => (v.id === entry.id ? entry : v))
                            : [...library.entries, entry],
                        })
                      ) {
                        openEntry(entry);
                        if (library.strict && entry.status !== "reviewed")
                          setNotice(
                            "Saved as a draft. Set Status to Reviewed in Details (with evidence) so agents can use it as context.",
                          );
                      }
                    }}
                  >
                    <header className="co-memory-editor-bar">
                      <span>
                        <FileText size={16} />
                        <strong>{documentTitle(documentDraft) || "Untitled note"}</strong>
                        <small>
                          {editorMode === "details"
                            ? "File settings"
                            : `${editorMode === "write" ? "Editing" : "Previewing"} Markdown`}
                        </small>
                      </span>
                      <nav aria-label="Editor mode">
                        <button
                          type="button"
                          aria-pressed={editorMode === "write"}
                          onClick={() => setEditorMode("write")}
                        >
                          <Pencil size={13} />
                          Write
                        </button>
                        <button
                          type="button"
                          aria-pressed={editorMode === "preview"}
                          onClick={() => setEditorMode("preview")}
                        >
                          <Eye size={13} />
                          Preview
                        </button>
                        <button
                          type="button"
                          aria-pressed={editorMode === "details"}
                          onClick={() => setEditorMode("details")}
                        >
                          <SlidersHorizontal size={13} />
                          Details
                        </button>
                      </nav>
                    </header>
                    <label className="co-memory-name">
                      Name
                      <input
                        required
                        maxLength={120}
                        autoFocus={!draft.title}
                        placeholder="e.g. Brand voice guidelines"
                        value={documentTitle(documentDraft)}
                        onChange={(event) =>
                          setDocumentDraft(withTitle(documentDraft, event.target.value))
                        }
                      />
                    </label>
                    {editorMode === "write" && (
                      <textarea
                        className="co-memory-source"
                        aria-label="Markdown file contents"
                        spellCheck
                        value={editableDocument(documentDraft)}
                        onChange={(event) =>
                          setDocumentDraft(
                            replaceEditableDocument(documentDraft, event.target.value),
                          )
                        }
                      />
                    )}
                    {editorMode === "preview" && (
                      <div className="co-memory-rendered">
                        <ReactMarkdown>{editableDocument(documentDraft)}</ReactMarkdown>
                      </div>
                    )}
                    {editorMode === "details" && !library.strict && (
                      <div className="co-memory-details">
                        <label>
                          Applies to
                          <select
                            value={draft.scope}
                            onChange={(e) => patch({ scope: e.target.value })}
                          >
                            {!scopes.some((s) => s.value === draft.scope) && (
                              <option value={draft.scope}>{draft.scope} (unavailable)</option>
                            )}
                            {scopes.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="co-memory-archive">
                          <input
                            type="checkbox"
                            checked={draft.status === "archived"}
                            onChange={(e) =>
                              patch({ status: e.target.checked ? "archived" : "draft" })
                            }
                          />
                          Archive · keep the file but hide it from agents
                        </label>
                      </div>
                    )}
                    {editorMode === "details" && library.strict && (
                      <div className="co-memory-details">
                        <div className="co-form-pair">
                          <label>
                            Kind
                            <select
                              value={draft.kind}
                              onChange={(e) =>
                                patch({ kind: e.target.value as MemoryEntry["kind"] })
                              }
                            >
                              {Object.entries(memoryKinds).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Status
                            <select
                              value={draft.status}
                              onChange={(e) =>
                                patch({ status: e.target.value as MemoryEntry["status"] })
                              }
                            >
                              <option value="draft">Draft · needs review</option>
                              <option value="reviewed" disabled={draft.source === "rehearsal"}>
                                Reviewed by me
                              </option>
                              <option value="archived">Archived · excluded</option>
                            </select>
                          </label>
                          <label>
                            Applies to
                            <select
                              value={draft.scope}
                              onChange={(e) => patch({ scope: e.target.value })}
                            >
                              {!scopes.some((s) => s.value === draft.scope) && (
                                <option value={draft.scope}>{draft.scope} (unavailable)</option>
                              )}
                              {scopes.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <p className="co-automation-hint">
                          The title and content live in the Markdown file. Reviewed files require
                          evidence; archived and draft files stay out of agent context.
                        </p>
                      </div>
                    )}
                    <footer>
                      <button
                        type="button"
                        className="co-button"
                        disabled={busy}
                        onClick={() =>
                          openEntry(library.entries.find((entry) => entry.id === draft.id) || draft)
                        }
                      >
                        Revert
                      </button>
                      <button
                        className="co-button co-button-primary"
                        disabled={
                          busy ||
                          (library.entries.length >= 500 &&
                            !library.entries.some((e) => e.id === draft.id))
                        }
                      >
                        {busy ? "Saving…" : "Save file"}
                      </button>
                    </footer>
                  </form>
                )}
              </div>
            </>
          )}
          {tab === "context" && (
            <>
              <div className="co-form-pair">
                <label>
                  Context for
                  <select value={scope} onChange={(e) => setScope(e.target.value)}>
                    {scopes.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Relevant to
                  <input
                    value={contextQuery}
                    onChange={(e) => setContextQuery(e.target.value)}
                    placeholder="Optional keywords from a task"
                  />
                </label>
              </div>
              <p className="co-automation-hint">
                {context.length} eligible records. Includes company memory and the selected scope;
                agent scope also includes its current office. This is a preview, not a live engine
                prompt. Retrieved memory is reference data, never instructions that override
                approvals.
              </p>
              <div className="co-memory-records">
                {context.map((entry) => (
                  <article className="co-memory-record" key={entry.id}>
                    <span>
                      <em>{memoryKinds[entry.kind]}</em>
                      <small>{library.strict ? "Reviewed" : "Shared"}</small>
                    </span>
                    <h3>{entry.title}</h3>
                    <p>{entry.body}</p>
                    {entry.evidence && <p>Evidence: {entry.evidence}</p>}
                    {entry.prevention && <p>Next time: {entry.prevention}</p>}
                  </article>
                ))}
                {!context.length && (
                  <div className="co-activity-empty">
                    <h3>{library.enabled ? "No notes match this context." : "Memory is off."}</h3>
                    <p>
                      {library.strict
                        ? "Drafts, archived records, and conflicts are excluded."
                        : "Archived notes and conflicting notes are excluded."}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
