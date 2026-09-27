import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Download, FileText, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { companyDomains, type Company } from "../company/company-model";
import {
  conflictingIds,
  duplicateEntry,
  entryError,
  memoryContext,
  memoryKinds,
  parseMemory,
  renderMemory,
  type MemoryEntry,
  type MemoryLibrary,
} from "./company-memory";
import { memoryFile, type MemoryFile } from "./memory-storage";
import { isRehearsalRun } from "../activity/task-rehearsal";
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

export function CompanyMemory({
  company,
  query,
  createRequest,
}: {
  company: Company;
  query: string;
  createRequest?: number;
}) {
  const live = useLiveRuntime();
  const [library, setLibrary] = useState<MemoryLibrary | null>(null);
  const [file, setFile] = useState<MemoryFile | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<MemoryEntry | null>(null);
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
          evidence: `Live run ${run.request.id}; engine: ${run.engine}; recorded ${new Date(run.updatedAt).toISOString()}. Inspect Activity for full execution evidence.`,
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
  const [showMarkdown, setShowMarkdown] = useState(false);
  const handledCreateRequest = useRef(0);
  const scopes = [
    { value: "company", label: "Company-wide" },
    ...companyDomains(company).map((domain) => ({
      value: `domain:${domain}`,
      label: `Domain · ${domain}`,
    })),
    ...company.offices.flatMap((o) =>
      o.agents.map((a) => ({ value: `agent:${a.id}`, label: `Agent · ${a.name} (${o.name})` })),
    ),
  ];
  async function load() {
    setBusy(true);
    setError("");
    try {
      const next = await memoryFile();
      const parsed = parseMemory(next.contents);
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
    setDraft(freshEntry());
  }, [library, createRequest]);
  async function persist(next: MemoryLibrary): Promise<boolean> {
    if (!file) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await memoryFile({ expected: file.contents, contents: renderMemory(next) });
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
  const draftError = draft
    ? entryError(draft) ||
      (library && duplicateEntry(library, draft)
        ? "This statement is already recorded in the same scope."
        : null)
    : null;
  function patch(change: Partial<MemoryEntry>) {
    setDraft((current) => (current ? { ...current, ...change } : current));
  }
  return (
    <section className="co-memory">
      <div className="co-memory-header">
        <div>
          <BookOpen size={21} />
          <span>
            <strong>Evidence before memory.</strong>
            <small>Facts, lessons, known issues, and decisions—each with a source.</small>
          </span>
        </div>
        <button className="co-button" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={14} />
          Reload from disk
        </button>
        <button
          role="switch"
          aria-label="Memory enabled"
          aria-checked={library?.enabled || false}
          disabled={!library || busy}
          className="co-button"
          onClick={() => library && void persist({ ...library, enabled: !library.enabled })}
        >
          {library?.enabled ? "Memory on" : "Memory off"}
        </button>
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
          <div className="co-memory-storage">
            <FileText size={17} />
            <div>
              <strong>
                {file?.contents
                  ? "Persistent Markdown"
                  : "Ready to create a Markdown file on first save"}
              </strong>
              <code>{file?.path}</code>
              <small>
                {library.enabled
                  ? "Reviewed, non-conflicting records are included in matching native runs."
                  : "Memory is off. Existing files are retained; context preview and issue capture are disabled."}{" "}
                Memory is reference context, never permission to bypass approvals.
              </small>
            </div>
            <button
              className="co-button"
              disabled={!file?.contents}
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([file!.contents!], { type: "text/markdown" }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "company-memory.md";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={14} />
              Download .md
            </button>
          </div>
          <nav className="co-activity-filters" aria-label="Memory view">
            <button aria-pressed={tab === "library"} onClick={() => setTab("library")}>
              Library · {library.entries.length}
            </button>
            <button
              aria-pressed={tab === "issues"}
              onClick={() => {
                setCandidates(issueCandidates());
                setTab("issues");
              }}
            >
              Learn from issues
            </button>
            <button aria-pressed={tab === "context"} onClick={() => setTab("context")}>
              Context preview
            </button>
          </nav>
          {conflicts.size > 0 && (
            <div className="co-memory-warning">
              {conflicts.size} reviewed records have conflicting statements under the same title and
              scope. They are excluded from context until you edit or archive the conflicting
              records. This detects matching-title conflicts, not every semantic contradiction.
            </div>
          )}
          {tab === "library" && (
            <>
              <div className="co-memory-tools">
                <label>
                  Show
                  <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">All records</option>
                    <option value="draft">Needs review</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <button
                  className="co-button co-button-primary"
                  disabled={busy}
                  onClick={() => setDraft(freshEntry())}
                >
                  <Plus size={14} />
                  New memory
                </button>
              </div>
              <div className={`co-memory-layout ${draft ? "editing" : ""}`}>
                <div className="co-memory-records">
                  {visible.map((entry) => (
                    <button
                      className={`co-memory-record ${draft?.id === entry.id ? "selected" : ""}`}
                      key={entry.id}
                      onClick={() => setDraft({ ...entry })}
                    >
                      <span>
                        <em>{memoryKinds[entry.kind]}</em>
                        <small>
                          {conflicts.has(entry.id) ? "Conflict · excluded" : entry.status}
                        </small>
                      </span>
                      <h3>{entry.title}</h3>
                      <p>{entry.body}</p>
                      <footer>
                        {scopes.find((s) => s.value === entry.scope)?.label || entry.scope} ·{" "}
                        {new Date(entry.updatedAt).toLocaleDateString()}
                      </footer>
                    </button>
                  ))}
                  {!visible.length && (
                    <div className="co-activity-empty">
                      <BookOpen size={26} />
                      <h3>No matching memory yet.</h3>
                      <p>Record a fact with its source, or a lesson with a prevention step.</p>
                    </div>
                  )}
                </div>
                {draft && (
                  <form
                    className="co-memory-editor"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (draftError) return;
                      const entry = {
                        ...draft,
                        title: draft.title.trim(),
                        body: draft.body.trim(),
                        evidence: draft.evidence.trim(),
                        prevention: draft.prevention.trim(),
                        updatedAt: new Date().toISOString(),
                      };
                      if (
                        await persist({
                          ...library,
                          entries: library.entries.some((v) => v.id === entry.id)
                            ? library.entries.map((v) => (v.id === entry.id ? entry : v))
                            : [...library.entries, entry],
                        })
                      )
                        setDraft(null);
                    }}
                  >
                    <header>
                      <ShieldCheck size={17} />
                      <strong>
                        {library.entries.some((e) => e.id === draft.id)
                          ? "Edit memory"
                          : "Capture memory"}
                      </strong>
                    </header>
                    <div className="co-form-pair">
                      <label>
                        Kind
                        <select
                          value={draft.kind}
                          onChange={(e) => patch({ kind: e.target.value as MemoryEntry["kind"] })}
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
                    </div>
                    <label>
                      Title
                      <input
                        required
                        maxLength={120}
                        value={draft.title}
                        onChange={(e) => patch({ title: e.target.value })}
                      />
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
                    <label>
                      {draft.kind === "lesson" ? "What happened and what we learned" : "Statement"}
                      <textarea
                        required
                        rows={4}
                        maxLength={4000}
                        value={draft.body}
                        onChange={(e) => patch({ body: e.target.value })}
                      />
                    </label>
                    <label>
                      Evidence / source
                      <textarea
                        rows={2}
                        maxLength={2000}
                        placeholder="A file, test result, issue, URL, or directly observed evidence"
                        value={draft.evidence}
                        onChange={(e) => patch({ evidence: e.target.value })}
                      />
                    </label>
                    <label>
                      Next time / prevention
                      <textarea
                        rows={2}
                        maxLength={2000}
                        placeholder="A concrete check or change that prevents repeating the mistake"
                        value={draft.prevention}
                        onChange={(e) => patch({ prevention: e.target.value })}
                      />
                    </label>
                    <p className="co-automation-hint">
                      {draft.source === "rehearsal"
                        ? "Rehearsal observations stay drafts. To record a real lesson, create a separate entry supported by real evidence."
                        : "Reviewed means you checked the evidence. It is not an automated truth guarantee. Do not store passwords or API keys."}
                    </p>
                    {draftError && (
                      <p className="co-form-error" role="alert">
                        {draftError}
                      </p>
                    )}
                    <footer>
                      <button
                        type="button"
                        className="co-button"
                        disabled={busy}
                        onClick={() => setDraft(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="co-button co-button-primary"
                        disabled={
                          busy ||
                          !!draftError ||
                          (library.entries.length >= 500 &&
                            !library.entries.some((e) => e.id === draft.id))
                        }
                      >
                        {busy ? "Saving…" : "Save to Markdown"}
                      </button>
                    </footer>
                  </form>
                )}
              </div>
            </>
          )}
          {tab === "issues" && (
            <>
              <div className="co-runtime-notice">
                <ShieldCheck size={21} />
                <div>
                  <strong>Turn an issue into a reviewed lesson.</strong>
                  <p>
                    Record the failure, evidence, and a prevention step. Live failures and rehearsal
                    observations are labeled separately. Captured records remain drafts until you
                    review them; they are never promoted to facts automatically.
                  </p>
                </div>
              </div>
              <div className="co-memory-records">
                {candidates
                  .filter((e) => !library.entries.some((saved) => saved.sourceId === e.sourceId))
                  .map((entry) => (
                    <article className="co-memory-record" key={entry.sourceId}>
                      <span>
                        <em>
                          {entry.sourceId.startsWith("live:")
                            ? "LIVE RUN ISSUE"
                            : "REHEARSAL OBSERVATION"}
                        </em>
                        <small>Unverified</small>
                      </span>
                      <h3>{entry.title}</h3>
                      <p>{entry.evidence}</p>
                      <button
                        className="co-button"
                        disabled={!library.enabled || busy}
                        onClick={() => {
                          setDraft(entry);
                          setTab("library");
                        }}
                      >
                        Draft a lesson
                      </button>
                    </article>
                  ))}
                {!candidates.some(
                  (e) => !library.entries.some((saved) => saved.sourceId === e.sourceId),
                ) && (
                  <p>No uncaptured issues. You can record an issue or lesson with New memory.</p>
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
                agent scope also includes its current domain. This is a preview, not a live engine
                prompt. Retrieved memory is reference data, never instructions that override
                approvals.
              </p>
              <div className="co-memory-records">
                {context.map((entry) => (
                  <article className="co-memory-record" key={entry.id}>
                    <span>
                      <em>{memoryKinds[entry.kind]}</em>
                      <small>Reviewed</small>
                    </span>
                    <h3>{entry.title}</h3>
                    <p>{entry.body}</p>
                    <p>Evidence: {entry.evidence}</p>
                    {entry.prevention && <p>Next time: {entry.prevention}</p>}
                  </article>
                ))}
                {!context.length && (
                  <div className="co-activity-empty">
                    <h3>
                      {library.enabled
                        ? "No reviewed memory matches this context."
                        : "Memory is off."}
                    </h3>
                    <p>Drafts, archived records, and conflicts are excluded.</p>
                  </div>
                )}
              </div>
            </>
          )}
          <button className="co-memory-file-toggle" onClick={() => setShowMarkdown(!showMarkdown)}>
            {showMarkdown ? "Hide" : "View"} saved Markdown
          </button>
          {showMarkdown && (
            <pre className="co-memory-markdown">{file?.contents || "No file written yet."}</pre>
          )}
        </>
      )}
    </section>
  );
}
