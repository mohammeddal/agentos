import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  Download,
  FileCode2,
  GitBranch,
  Layers3,
  Link2,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Square,
  Upload,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import type { Decision, LiveRun, StudioState } from "./studio-types";
import {
  assetHealth,
  buildBrief,
  isFailure,
  isTest,
  parseCatalog,
  related,
  testsFor,
  workflowNames,
  type Asset,
  type Catalog,
  type Workflow,
} from "./data/catalog";
import { exampleCatalog } from "./data/example";
import "./data-workspace.css";

const STORAGE = "dataguild:catalog:v1";
const empty: StudioState = {
  connected: false,
  authenticated: false,
  detail: "Connecting to local runtime",
  workspaces: [],
  runs: [],
  missions: [],
  agents: [],
  skills: [],
  memories: [],
};
const roles = [
  {
    id: "detective",
    name: "Investigator",
    color: "#8bbdc7",
    job: "Evidence & root cause",
  },
  {
    id: "builder",
    name: "Builder",
    color: "#e7b472",
    job: "Plans & implementation",
  },
  {
    id: "reviewer",
    name: "Reviewer",
    color: "#b9c992",
    job: "Independent checks",
  },
  {
    id: "historian",
    name: "Historian",
    color: "#b2a0cf",
    job: "Decisions & context",
  },
];
const running = (run: LiveRun) =>
  run.status === "running" || run.status === "waiting";
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/studio/${path}`, {
    headers: {
      "X-StaffForge-Client": "studio",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Request failed");
  return value as T;
}
function initialCatalog(): Catalog {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE) || "null",
    ) as Catalog | null;
    if (
      saved?.version === 1 &&
      Array.isArray(saved.assets) &&
      saved.assets.every(
        (item) =>
          typeof item.id === "string" &&
          Array.isArray(item.parents) &&
          Array.isArray(item.columns),
      )
    )
      return saved;
  } catch {
    /* Storage can be disabled or stale. */
  }
  return exampleCatalog;
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const date = (value: string) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString()
    : "Not supplied";

export function DataWorkspace() {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [selectedId, setSelectedId] = useState(
    () =>
      catalog.assets.find((item) => item.name === "fct_revenue")?.id ||
      catalog.assets.find((item) => !isTest(item))?.id ||
      "",
  );
  const [state, setState] = useState(empty),
    [connectionError, setConnectionError] = useState("");
  const [page, setPage] = useState<"assets" | "work" | "connections">("assets");
  const [search, setSearch] = useState(""),
    [lens, setLens] = useState<"all" | "impact">("all");
  const [importOpen, setImportOpen] = useState(false),
    [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [agentView, setAgentView] = useState<string | null>(null),
    [runId, setRunId] = useState<string | null>(null);
  const [request, setRequest] = useState(""),
    [workspace, setWorkspace] = useState("project"),
    [agentId, setAgentId] = useState("built-in:detective");
  const [skillIds, setSkillIds] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inspector = useRef<HTMLElement>(null);
  const asset =
    catalog.assets.find((item) => item.id === selectedId) ||
    catalog.assets.find((item) => !isTest(item))!;
  const upstream = useMemo(
    () =>
      related(catalog, asset.id, "upstream").filter((item) => !isTest(item)),
    [catalog, asset.id],
  );
  const downstream = useMemo(
    () =>
      related(catalog, asset.id, "downstream").filter((item) => !isTest(item)),
    [catalog, asset.id],
  );
  const tests = testsFor(catalog, asset.id);
  const failures = catalog.assets.filter(isFailure);
  const activeRuns = state.runs.filter(running),
    waiting = activeRuns.filter((item) => item.decisions.length);
  const selectedRun = state.runs.find((item) => item.id === runId);
  const brief = workflow ? buildBrief(catalog, asset, workflow, request) : "";

  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const next = await api<StudioState>("state");
        if (!stopped) {
          setState(next);
          setConnectionError("");
        }
      } catch {
        if (!stopped)
          setConnectionError(
            "Local runtime unavailable. Your imported catalog still works.",
          );
      }
      if (!stopped) timer = setTimeout(() => void refresh(), 1600);
    };
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  function begin(next: Workflow) {
    setWorkflow(next);
    setRequest("");
    setSkillIds([]);
    setError("");
    setAgentId(
      next === "review" || next === "change"
        ? "built-in:reviewer"
        : next === "build"
          ? "built-in:builder"
          : "built-in:detective",
    );
  }
  function select(id: string) {
    setSelectedId(id);
    setPage("assets");
    if (window.matchMedia("(max-width: 900px)").matches)
      requestAnimationFrame(() =>
        inspector.current?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        }),
      );
  }
  async function action(callback: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await callback();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  function openRun(id: string) {
    setRunId(id);
    setAgentView(null);
    setPage("work");
  }
  function saveCatalog(next: Catalog) {
    const serialized = JSON.stringify(next);
    if (serialized.length > 4_000_000)
      throw new Error(
        "The normalized catalog is too large for local storage. Import a smaller project.",
      );
    // Persist first: a quota error never replaces the working catalog.
    localStorage.setItem(STORAGE, serialized);
    setCatalog(next);
    setSelectedId(next.assets.find((item) => !isTest(item))!.id);
    setSearch("");
    setLens("all");
    setImportOpen(false);
    setPage("assets");
    setNotice("Snapshot saved in this browser. Re-import to refresh it.");
  }

  return (
    <div className="dg-app">
      <aside className="dg-sidebar">
        <a className="dg-brand" href="/" aria-label="DataGuild home">
          <span className="dg-mark">
            <i />
            <i />
            <i />
          </span>
          <strong>
            DataGuild<span>LOCAL WORKSPACE</span>
          </strong>
        </a>
        <div className="dg-workspace">
          <span>C</span>
          <div>
            <strong>{catalog.name}</strong>
            <small>
              {catalog.example ? "Example workspace" : "Your dbt project"}
            </small>
          </div>
        </div>
        <div className="dg-nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            aria-label="Data canvas"
            className={page === "assets" ? "is-active" : ""}
            onClick={() => setPage("assets")}
          >
            <Layers3 size={18} />
            <span>Data canvas</span>
          </button>
          <button
            aria-label="Agent work"
            className={page === "work" ? "is-active" : ""}
            onClick={() => setPage("work")}
          >
            <Activity size={18} />
            <span>Agent work</span>
            <b>{activeRuns.length || state.runs.length}</b>
          </button>
          <button
            aria-label="Connections"
            className={page === "connections" ? "is-active" : ""}
            onClick={() => setPage("connections")}
          >
            <Link2 size={18} />
            <span>Connections</span>
          </button>
        </nav>
        <div className="dg-sidebar-note">
          <GitBranch size={22} />
          <strong>Context before code.</strong>
          <p>
            Trace the impact. Gather evidence. Give an agent a precise brief.
          </p>
        </div>
        <div className="dg-sidebar-bottom">
          <a href="/?studio=1&memory=1">
            <BookOpen size={17} />
            <span>Project memory</span>
            <ArrowUpRight size={13} />
          </a>
          <a href="/?studio=1">
            <Plus size={17} />
            <span>Agents & skills</span>
            <ArrowUpRight size={13} />
          </a>
          <div className="dg-runtime">
            <i
              className={
                state.connected && state.authenticated && !connectionError
                  ? "online"
                  : ""
              }
            />
            <span>
              {state.connected && state.authenticated && !connectionError
                ? "Codex connected"
                : "Codex unavailable"}
              <small>Local runtime · {activeRuns.length}/4 active</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="dg-main">
        <header className="dg-topbar">
          <div>
            Workspace <ChevronRight size={14} />
            <strong>
              {page === "assets"
                ? "Data canvas"
                : page === "work"
                  ? "Agent work"
                  : "Connections"}
            </strong>
          </div>
          <span className="dg-source-pill">
            <i />
            {catalog.example ? "EXAMPLE DATA" : "IMPORTED SNAPSHOT"}
          </span>
          <button className="dg-button" onClick={() => setImportOpen(true)}>
            <Upload size={15} />
            Import dbt artifacts
          </button>
        </header>
        {connectionError && (
          <div className="dg-banner error" role="status">
            {connectionError}
          </div>
        )}
        {catalog.warnings.length > 0 && page === "assets" && (
          <div className="dg-banner" role="status">
            Snapshot caveat: {catalog.warnings.join(" ")}
          </div>
        )}
        {notice && (
          <div className="dg-banner" role="status">
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {error && !workflow && (
          <div className="dg-banner error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {waiting.length > 0 && (
          <button
            className="dg-attention-banner"
            onClick={() => openRun(waiting[0]!.id)}
          >
            <ShieldCheck size={17} />
            {waiting.length} request{waiting.length === 1 ? " needs" : "s need"}{" "}
            your decision. Review here.
            <ArrowRight size={16} />
          </button>
        )}

        {page === "assets" && (
          <>
            <section className="dg-heading">
              <div>
                <span className="dg-eyebrow">YOUR DATA, WITH CONTEXT</span>
                <h1>
                  {catalog.name}
                  <span>.</span>
                </h1>
                <p>See what depends on it. Decide what to do next.</p>
              </div>
              <div className="dg-quick-crew" aria-label="Agent availability">
                <div>
                  {roles.map((role) => {
                    const count = activeRuns.filter(
                      (run) => run.role === role.id,
                    ).length;
                    return (
                      <button
                        key={role.id}
                        title={`${role.name}: ${count ? `${count} active` : "available"}`}
                        aria-label={`Inspect ${role.name} work`}
                        onClick={() => setAgentView(role.id)}
                      >
                        <Robot color={role.color} working={count > 0} />
                      </button>
                    );
                  })}
                </div>
                <span>
                  {activeRuns.length
                    ? `${activeRuns.length} active requests`
                    : "Your crew is ready"}
                </span>
              </div>
              <button
                className="dg-button primary"
                onClick={() => begin("build")}
              >
                <Plus size={17} />
                Build something new
              </button>
            </section>
            <div className="dg-content">
              <div className="dg-canvas-column">
                <div
                  className={`dg-signal ${failures.length ? "has-failure" : ""}`}
                >
                  <span className="dg-signal-icon">
                    {failures.length ? (
                      <Activity size={20} />
                    ) : (
                      <CircleHelp size={20} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {failures.length
                        ? `${failures.length} failed ${failures.length === 1 ? "result" : "results"} to investigate`
                        : "Start with the evidence you have"}
                    </strong>
                    <p>
                      {catalog.example
                        ? "Try the example: a revenue model has a failing uniqueness test."
                        : `${catalog.assets.filter(isTest).length} tests in the manifest. Results reflect only the imported run.`}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const failed = failures[0];
                      if (failed)
                        select(
                          isTest(failed)
                            ? failed.parents[0] || failed.id
                            : failed.id,
                        );
                      else setImportOpen(true);
                    }}
                  >
                    {failures.length ? "Inspect" : "Add results"}
                    <ArrowRight size={15} />
                  </button>
                </div>
                <section className="dg-map" aria-label="Data lineage">
                  <div className="dg-map-toolbar">
                    <div className="dg-segment" aria-label="Lineage scope">
                      <button
                        aria-pressed={lens === "all"}
                        onClick={() => setLens("all")}
                      >
                        Lineage
                      </button>
                      <button
                        aria-pressed={lens === "impact"}
                        onClick={() => setLens("impact")}
                      >
                        Downstream impact <span>{downstream.length}</span>
                      </button>
                    </div>
                    <label className="dg-search">
                      <Search size={15} />
                      <input
                        aria-label="Search assets"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Find an asset…"
                      />
                    </label>
                  </div>
                  <Lineage
                    catalog={catalog}
                    asset={asset}
                    search={search}
                    lens={lens}
                    onSelect={select}
                  />
                  <footer className="dg-map-footer">
                    <span>
                      <i className="attention" />
                      Needs attention
                      <i className="passed" />
                      Run succeeded
                      <i />
                      Not measured
                    </span>
                    <small>Arrows = dbt dependencies</small>
                  </footer>
                </section>
                <section className="dg-team">
                  <header>
                    <div>
                      <span className="dg-eyebrow">YOUR CREW</span>
                      <h2>Specialists, one workspace.</h2>
                    </div>
                    <span>
                      {activeRuns.length
                        ? `${activeRuns.length} working`
                        : "Ready for a brief"}
                    </span>
                  </header>
                  <div className="dg-crew">
                    {roles.map((role) => {
                      const tasks = activeRuns.filter(
                        (run) => run.role === role.id,
                      );
                      return (
                        <button
                          key={role.id}
                          onClick={() => setAgentView(role.id)}
                          className={tasks.length ? "working" : ""}
                        >
                          <Robot color={role.color} working={!!tasks.length} />
                          <strong>{role.name}</strong>
                          <small>
                            {tasks.length
                              ? `${tasks.length} active · ${tasks[0]!.phase}`
                              : role.job}
                          </small>
                          <span className="dg-seat-status">
                            <i />
                            {tasks.length ? "Working" : "Available"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
                <p className="dg-provenance">
                  <ShieldCheck size={14} />
                  {catalog.example
                    ? "Fictional example. No production systems were queried."
                    : `Manifest: ${date(catalog.generatedAt)}. Snapshot only; freshness is not measured.`}
                </p>
              </div>
              <aside
                ref={inspector}
                className="dg-inspector"
                aria-label="Selected asset details"
                key={asset.id}
              >
                <div className="dg-inspector-top">
                  <span className="dg-eyebrow">
                    SELECTED {asset.kind.toUpperCase()}
                  </span>
                  <span className={`dg-status ${assetHealth(catalog, asset)}`}>
                    {assetHealth(catalog, asset) === "attention"
                      ? "Needs attention"
                      : asset.status === "unknown"
                        ? "Not measured"
                        : asset.status}
                  </span>
                </div>
                <div className="dg-asset-symbol">
                  <Database size={24} />
                </div>
                <h2>{asset.name}</h2>
                <p className="dg-description">
                  {asset.description ||
                    "No description was included in this manifest."}
                </p>
                <div className="dg-next">
                  <span className="dg-eyebrow">NEXT BEST ACTION</span>
                  <button
                    className="dg-button primary"
                    onClick={() => begin("investigate")}
                  >
                    <Search size={16} />
                    Investigate with context
                    <ArrowRight size={16} />
                  </button>
                  <div>
                    <button onClick={() => begin("change")}>
                      <GitBranch size={15} />
                      Plan a change
                    </button>
                    <button onClick={() => begin("review")}>
                      <ShieldCheck size={15} />
                      Review model
                    </button>
                  </div>
                  <p>You review the brief before an agent starts.</p>
                </div>
                <div className="dg-asset-meta">
                  <span>
                    Owner<strong>{asset.owner || "Not recorded"}</strong>
                  </span>
                  <span>
                    Freshness<strong>Not measured</strong>
                  </span>
                  <span>
                    Run result
                    <strong>
                      {asset.status === "unknown"
                        ? "Not supplied"
                        : asset.status}
                    </strong>
                  </span>
                </div>
                <div className="dg-impact-summary">
                  <div>
                    <strong>{upstream.length}</strong>
                    <span>upstream assets</span>
                  </div>
                  <ArrowRight size={16} />
                  <div>
                    <strong>{downstream.length}</strong>
                    <span>may be affected</span>
                  </div>
                </div>
                <section className="dg-evidence">
                  <h3>
                    <ShieldCheck size={15} />
                    Test evidence <span>{tests.length}</span>
                  </h3>
                  {tests.length ? (
                    tests.map((test) => (
                      <button
                        key={test.id}
                        className="dg-test"
                        onClick={() => {
                          setSelectedId(test.id);
                          setSearch("");
                        }}
                      >
                        <i
                          className={
                            isFailure(test)
                              ? "attention"
                              : test.status === "pass"
                                ? "passed"
                                : ""
                          }
                        />
                        <span>
                          {test.name}
                          <small>{test.status} · imported result</small>
                        </span>
                        <ChevronRight size={13} />
                      </button>
                    ))
                  ) : (
                    <p>
                      No attached tests recorded. This does not mean the asset
                      is verified.
                    </p>
                  )}
                  <small>Results: {date(catalog.resultsAt)}</small>
                </section>
                <details className="dg-detail">
                  <summary>
                    Source & columns <span>{asset.columns.length}</span>
                  </summary>
                  <code>{asset.file || "No source file recorded"}</code>
                  <code>{asset.relation || "No relation recorded"}</code>
                  {asset.columns.map((column) => (
                    <div key={column.name}>
                      <span>{column.name}</span>
                      <small>{column.type}</small>
                    </div>
                  ))}
                </details>
                <details className="dg-detail">
                  <summary>
                    Downstream assets <span>{downstream.length}</span>
                  </summary>
                  {downstream.length ? (
                    downstream.map((item) => (
                      <button key={item.id} onClick={() => select(item.id)}>
                        {item.name}
                        <ArrowUpRight size={13} />
                      </button>
                    ))
                  ) : (
                    <p>None recorded in this manifest.</p>
                  )}
                </details>
              </aside>
            </div>
          </>
        )}

        {page === "work" && (
          <section className="dg-work-page">
            <div className="dg-heading">
              <div>
                <span className="dg-eyebrow">EXECUTION & EVIDENCE</span>
                <h1>
                  Agent work<span>.</span>
                </h1>
                <p>
                  Real runtime activity. Decisions and outcomes in the same
                  place.
                </p>
              </div>
              <a className="dg-button" href="/?studio=1">
                Multi-agent projects
                <ArrowUpRight size={15} />
              </a>
            </div>
            <div className="dg-work-layout">
              <div className="dg-run-list">
                {state.runs.length ? (
                  state.runs.map((run) => (
                    <button
                      key={run.id}
                      className={run.id === runId ? "selected" : ""}
                      onClick={() => setRunId(run.id)}
                    >
                      <span className={`dg-status ${run.status}`}>
                        {run.status}
                      </span>
                      <strong>
                        {run.displayObjective ||
                          run.objective.split("\n")[0]?.replace(/^# /, "")}
                      </strong>
                      <small>
                        {run.agentName} · {date(run.startedAt)}
                      </small>
                    </button>
                  ))
                ) : (
                  <div className="dg-empty">
                    <WorkflowIcon size={30} />
                    <h2>No runs yet</h2>
                    <p>
                      Select an asset and prepare a brief. Nothing starts
                      without your click.
                    </p>
                    <button
                      className="dg-button"
                      onClick={() => setPage("assets")}
                    >
                      Go to data canvas
                      <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </div>
              <div className="dg-run-detail">
                {selectedRun ? (
                  <>
                    <header>
                      <span className={`dg-status ${selectedRun.status}`}>
                        {selectedRun.status}
                      </span>
                      <h2>
                        {selectedRun.displayObjective ||
                          selectedRun.objective
                            .split("\n")[0]
                            ?.replace(/^# /, "")}
                      </h2>
                      <p>
                        {selectedRun.agentName} ·{" "}
                        {selectedRun.intent === "read"
                          ? "Read-only task"
                          : "Change task"}
                      </p>
                      <code>{selectedRun.workspace}</code>
                      {running(selectedRun) && (
                        <button
                          className="dg-button"
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              await api("stop", { runId: selectedRun.id });
                            })
                          }
                        >
                          <Square size={13} />
                          Stop request
                        </button>
                      )}
                    </header>
                    {selectedRun.decisions.map((decision) => (
                      <InlineDecision
                        key={decision.id}
                        decision={decision}
                        busy={busy}
                        onDecide={(allow, answers) =>
                          action(async () => {
                            await api("decision", {
                              runId: selectedRun.id,
                              decisionId: decision.id,
                              allow,
                              answers,
                            });
                          })
                        }
                      />
                    ))}
                    {selectedRun.error && (
                      <p className="dg-banner error">{selectedRun.error}</p>
                    )}
                    <h3>
                      {running(selectedRun) ? "Current activity" : "Outcome"}
                    </h3>
                    {selectedRun.answer ? (
                      <pre className="dg-answer">{selectedRun.answer}</pre>
                    ) : (
                      <p>{selectedRun.action || "No answer was returned."}</p>
                    )}
                    {selectedRun.files && (
                      <ul>
                        {selectedRun.files.map((file) => (
                          <li key={file.name}>
                            {file.name} <small>({file.kind})</small>
                          </li>
                        ))}
                      </ul>
                    )}
                    <details className="dg-detail" open>
                      <summary>
                        Activity log{" "}
                        <span>{selectedRun.activities.length}</span>
                      </summary>
                      {selectedRun.activities.map((item) => (
                        <div className="dg-log" key={item.id}>
                          <span className={`dg-status ${item.state}`}>
                            {item.state}
                          </span>
                          <div>
                            <strong>{item.label}</strong>
                            <p>{item.detail}</p>
                          </div>
                        </div>
                      ))}
                    </details>
                    <details className="dg-detail">
                      <summary>Original brief</summary>
                      <pre className="dg-answer">{selectedRun.objective}</pre>
                    </details>
                    {selectedRun.answer && (
                      <button
                        className="dg-button"
                        onClick={() =>
                          download(
                            `dataguild-result-${selectedRun.id}.md`,
                            selectedRun.answer,
                          )
                        }
                      >
                        <Download size={15} />
                        Export outcome
                      </button>
                    )}
                  </>
                ) : (
                  <div className="dg-empty">
                    <Activity size={32} />
                    <h2>Follow the work, not a spinner.</h2>
                    <p>
                      Select a request to see its agent, live activity,
                      approvals, and complete outcome.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {page === "connections" && (
          <section className="dg-connections">
            <div className="dg-heading">
              <div>
                <span className="dg-eyebrow">EVIDENCE BOUNDARIES</span>
                <h1>
                  Know what’s connected<span>.</span>
                </h1>
                <p>A vendor name on the canvas is not an integration.</p>
              </div>
            </div>
            <div className="dg-connection-list">
              {[
                [
                  "dbt Core",
                  catalog.example ? "Example only" : "Snapshot imported",
                  "Models, sources, tests, exposures, and dependency impact from your artifacts.",
                ],
                [
                  "Codex",
                  state.connected && state.authenticated && !connectionError
                    ? "Local runtime connected"
                    : "Unavailable",
                  "Runs the selected agent with the selected skills in a local workspace.",
                ],
                [
                  "GitHub",
                  "Not connected",
                  "Repository files may be inspected locally. PRs, CI checks, and remote review status are not fetched.",
                ],
                [
                  "Snowflake",
                  "Not connected",
                  "Relation names are metadata only. No queries, cost, row counts, or freshness checks.",
                ],
                [
                  "Airflow",
                  "Not connected",
                  "No DAG runs, task logs, schedules, or backfills are fetched.",
                ],
                [
                  "Monte Carlo",
                  "Not connected",
                  "No alerts, incident timelines, or monitoring coverage are fetched.",
                ],
                [
                  "Sigma",
                  "Not connected",
                  "dbt exposures may describe dashboards. No live dashboards or usage are fetched.",
                ],
              ].map(([name, status, description]) => (
                <article key={name}>
                  <span className="dg-connection-icon">
                    {name?.slice(0, 2)}
                  </span>
                  <div>
                    <h2>{name}</h2>
                    <p>{description}</p>
                  </div>
                  <span className="dg-status">{status}</span>
                </article>
              ))}
            </div>
            <div className="dg-local-note">
              <ShieldCheck size={23} />
              <div>
                <h3>Your artifacts stay local until you start a run.</h3>
                <p>
                  The compact catalog is stored in this browser. Starting an
                  agent sends the previewed brief to your configured Codex
                  runtime/provider. No credentials are needed for artifact
                  import.
                </p>
              </div>
            </div>
            <div className="dg-connection-actions">
              <button
                className="dg-button primary"
                onClick={() => setImportOpen(true)}
              >
                <Upload size={15} />
                Import artifacts
              </button>
              <button
                className="dg-button"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await api("reconnect", {});
                    setNotice(
                      "Reconnect requested. Runtime status will refresh.",
                    );
                  })
                }
              >
                Reconnect Codex
              </button>
              {!catalog.example && (
                <button
                  className="dg-button"
                  onClick={() => {
                    localStorage.removeItem(STORAGE);
                    setCatalog(exampleCatalog);
                    setSelectedId("model.shop.fct_revenue");
                    setNotice(
                      "Imported snapshot removed from this browser. Existing agent run history is unchanged.",
                    );
                  }}
                >
                  Remove snapshot
                </button>
              )}
            </div>
            {catalog.warnings.map((warning) => (
              <p className="dg-banner" key={warning}>
                {warning}
              </p>
            ))}
          </section>
        )}
      </main>

      {importOpen && (
        <Modal
          title="Bring your data into focus"
          onClose={() => setImportOpen(false)}
        >
          <ImportForm onImport={saveCatalog} />
        </Modal>
      )}
      {workflow && (
        <Modal
          title={workflowNames[workflow]}
          onClose={() => setWorkflow(null)}
          wide
        >
          <div className="dg-brief-layout">
            <div>
              <span className="dg-eyebrow">01 / DEFINE THE OUTCOME</span>
              <p className="dg-description">
                {asset.name} · {downstream.length} potential downstream
                dependencies
              </p>
              <label className="dg-field">
                What do you want to understand or build?
                <textarea
                  maxLength={1000}
                  rows={4}
                  placeholder={
                    workflow === "build"
                      ? "e.g. A daily customer revenue model with a documented grain and tests…"
                      : "e.g. Why is order_id no longer unique, and what should we check first?"
                  }
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                />
              </label>
              <label className="dg-field">
                Local repository / workspace
                <select
                  value={workspace}
                  onChange={(event) => setWorkspace(event.target.value)}
                >
                  {state.workspaces.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {item.path}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dg-field">
                Assigned specialist
                <select
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  {state.agents.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.source}
                    </option>
                  ))}
                </select>
              </label>
              <details className="dg-detail">
                <summary>
                  Attach skills <span>{skillIds.length}</span>
                </summary>
                {state.skills.length ? (
                  state.skills.map((skill) => (
                    <label className="dg-skill" key={skill.id}>
                      <input
                        type="checkbox"
                        checked={skillIds.includes(skill.id)}
                        disabled={
                          !skillIds.includes(skill.id) && skillIds.length >= 12
                        }
                        onChange={(event) =>
                          setSkillIds((ids) =>
                            event.target.checked
                              ? [...ids, skill.id]
                              : ids.filter((id) => id !== skill.id),
                          )
                        }
                      />
                      <span>
                        {skill.name}
                        <small>{skill.description}</small>
                      </span>
                    </label>
                  ))
                ) : (
                  <p>No skills discovered. Add them in Agents & skills.</p>
                )}
              </details>
              <div className="dg-safety">
                <ShieldCheck size={18} />
                <p>
                  Planning and investigation only. No file edits, deployments,
                  or database writes are authorized by this brief.
                </p>
              </div>
              {catalog.example && (
                <div className="dg-banner">
                  Example mode: export or inspect this brief. Import your own
                  artifacts to start a real contextual run.
                </div>
              )}
              {error && (
                <p className="dg-banner error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="dg-brief-preview">
              <span className="dg-eyebrow">02 / REVIEW THE EXACT CONTEXT</span>
              <pre>{brief}</pre>
            </div>
          </div>
          <footer className="dg-modal-footer">
            <button
              className="dg-button"
              onClick={() => download("dataguild-brief.md", brief)}
            >
              <Download size={15} />
              Export brief
            </button>
            <span>
              {brief.length.toLocaleString()} characters · read-only scope
            </span>
            <button
              className="dg-button primary"
              disabled={
                busy ||
                catalog.example ||
                !state.connected ||
                !state.authenticated ||
                !!connectionError ||
                activeRuns.length >= 4 ||
                !state.workspaces.some((item) => item.id === workspace)
              }
              onClick={() =>
                void action(async () => {
                  const run = await api<LiveRun>("data/review", {
                    objective: brief,
                    workspace,
                    agentId,
                    skillIds,
                    label: `${workflowNames[workflow]}: ${asset.name}`,
                  });
                  setState((old) => ({
                    ...old,
                    runs: [
                      run,
                      ...old.runs.filter((item) => item.id !== run.id),
                    ],
                  }));
                  setWorkflow(null);
                  openRun(run.id);
                })
              }
            >
              {busy ? <Loader2 size={16} /> : <ArrowUpRight size={16} />}Start
              agent review
            </button>
          </footer>
        </Modal>
      )}
      {agentView && (
        <Modal
          title={`${roles.find((role) => role.id === agentView)?.name || "Agent"} · work history`}
          onClose={() => setAgentView(null)}
        >
          <p className="dg-description">
            Actual runs assigned to this role. Being available does not mean the
            agent is monitoring your systems.
          </p>
          <div className="dg-run-list">
            {state.runs
              .filter((run) => run.role === agentView)
              .map((run) => (
                <button key={run.id} onClick={() => openRun(run.id)}>
                  <span className={`dg-status ${run.status}`}>
                    {run.status}
                  </span>
                  <strong>
                    {run.displayObjective || run.objective.split("\n")[0]}
                  </strong>
                  <small>{date(run.startedAt)}</small>
                  <p>{run.action}</p>
                </button>
              ))}
            {!state.runs.some((run) => run.role === agentView) && (
              <div className="dg-empty">
                <Robot
                  color={
                    roles.find((role) => role.id === agentView)?.color ||
                    "#8bbdc7"
                  }
                />
                <h2>No assignments yet</h2>
                <p>
                  Prepare a brief from the data canvas to give this specialist a
                  focused task.
                </p>
              </div>
            )}
          </div>
          <a className="dg-button" href="/?studio=1">
            Manage agents & skills
            <ArrowUpRight size={15} />
          </a>
        </Modal>
      )}
    </div>
  );
}

function Lineage({
  catalog,
  asset,
  search,
  lens,
  onSelect,
}: {
  catalog: Catalog;
  asset: Asset;
  search: string;
  lens: "all" | "impact";
  onSelect: (id: string) => void;
}) {
  const nodes = catalog.assets.filter((item) => !isTest(item));
  const allowed = new Set([
    asset.id,
    ...related(catalog, asset.id, "downstream").map((item) => item.id),
  ]);
  const matches = nodes.filter(
    (item) =>
      (lens === "all" || allowed.has(item.id)) &&
      (!search.trim() ||
        `${item.name} ${item.id} ${item.file}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())),
  );
  const [limit, setLimit] = useState(24);
  useEffect(() => setLimit(24), [search, lens, catalog]);
  const visible = matches.slice(0, limit);
  const byId = new Map(visible.map((item) => [item.id, item]));
  const depthMemo = new Map<string, number>();
  function depth(id: string, trail = new Set<string>()): number {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    if (trail.has(id) || trail.size > 5) return 0;
    const item = byId.get(id);
    if (!item) return -1;
    const next = new Set([...trail, id]);
    const value = Math.min(
      5,
      Math.max(
        0,
        ...item.parents
          .filter((parent) => byId.has(parent))
          .map((parent) => depth(parent, next) + 1),
      ),
    );
    depthMemo.set(id, value);
    return value;
  }
  visible.forEach((item) => depth(item.id));
  const levels = [...new Set(depthMemo.values())].sort((a, b) => a - b);
  const columns = levels.map((level) =>
    visible.filter((item) => depthMemo.get(item.id) === level),
  );
  const positions = new Map<string, { x: number; y: number }>();
  columns.forEach((column, x) =>
    column.forEach((item, y) =>
      positions.set(item.id, { x: 24 + x * 226, y: 68 + y * 132 }),
    ),
  );
  const height = Math.max(
      350,
      ...columns.map((column) => column.length * 132 + 80),
    ),
    width = Math.max(670, columns.length * 226 + 12);
  return (
    <>
      <div className="dg-map-scroll">
        {visible.length ? (
          <div className="dg-graph" style={{ width, height }}>
            <svg width={width} height={height} aria-hidden="true">
              <defs>
                <marker
                  id="dg-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M0 0 8 4 0 8Z" fill="#65777b" />
                </marker>
              </defs>
              {visible.flatMap((item) =>
                item.parents.map((parent) => {
                  const a = positions.get(parent),
                    b = positions.get(item.id);
                  if (!a || !b) return null;
                  return (
                    <path
                      key={`${parent}-${item.id}`}
                      d={`M ${a.x + 186} ${a.y + 47} C ${a.x + 206} ${a.y + 47}, ${b.x - 20} ${b.y + 47}, ${b.x - 3} ${b.y + 47}`}
                      fill="none"
                      stroke={
                        item.id === asset.id || parent === asset.id
                          ? "#ddb477"
                          : "#4b5b60"
                      }
                      strokeWidth="1.5"
                      markerEnd="url(#dg-arrow)"
                    />
                  );
                }),
              )}
            </svg>
            {columns.map((column, i) => (
              <span
                className="dg-layer-label"
                style={{ left: 24 + i * 226 }}
                key={i}
              >
                {String(i + 1).padStart(2, "0")} /{" "}
                {column.every((item) => item.kind === "source")
                  ? "SOURCES"
                  : column.every((item) => item.kind === "exposure")
                    ? "CONSUMPTION"
                    : "TRANSFORMATION"}
              </span>
            ))}
            {visible.map((item) => {
              const point = positions.get(item.id)!;
              const health = assetHealth(catalog, item);
              return (
                <button
                  key={item.id}
                  className={`dg-node ${item.id === asset.id ? "selected" : ""} ${health}`}
                  style={{ left: point.x, top: point.y }}
                  onClick={() => onSelect(item.id)}
                  aria-pressed={item.id === asset.id}
                >
                  <span className="dg-node-type">
                    {item.kind === "source" ? (
                      <Database size={15} />
                    ) : item.kind === "exposure" ? (
                      <Layers3 size={15} />
                    ) : (
                      <FileCode2 size={15} />
                    )}
                    <span>
                      {item.kind === "exposure"
                        ? "dashboard / exposure"
                        : item.kind}
                    </span>
                    <i />
                  </span>
                  <strong title={item.name}>{item.name}</strong>
                  <small>
                    {health === "attention"
                      ? "Failed evidence"
                      : item.status === "unknown"
                        ? "No run evidence"
                        : `Run: ${item.status}`}
                  </small>
                  {item.id === asset.id && (
                    <span className="dg-node-selected">SELECTED</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="dg-empty">
            <Search size={28} />
            <h2>No matching assets</h2>
            <p>Try another name or switch back to Lineage.</p>
          </div>
        )}
      </div>
      {matches.length > limit && (
        <button
          className="dg-load-more"
          onClick={() => setLimit((value) => value + 24)}
        >
          Showing {visible.length} of {matches.length} assets · Load 24 more
          <ArrowDown size={14} />
        </button>
      )}
      <div className="dg-map-count">
        {visible.length} of {nodes.length} assets shown{search && " · filtered"}
        {lens === "impact" && " · downstream only"}
        {isTest(asset) && " · selected test is attached to its parent model"}
      </div>
    </>
  );
}

function Robot({
  color,
  working = false,
}: {
  color: string;
  working?: boolean;
}) {
  return (
    <svg
      className={`dg-robot ${working ? "is-working" : ""}`}
      style={{ "--bot-color": color } as CSSProperties}
      viewBox="0 0 86 84"
      aria-hidden="true"
    >
      <ellipse cx="43" cy="74" rx="29" ry="5" fill="#000" opacity=".18" />
      <path
        d="M33 58v11m20-11v11"
        stroke="#79858c"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="m25 43-7 13m43-13 7 13"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <rect x="27" y="38" width="32" height="25" rx="9" fill={color} />
      <path d="M43 13V7" stroke="#acb4b4" strokeWidth="3" />
      <circle cx="43" cy="6" r="3" fill={working ? "#d8f7a4" : color} />
      <rect x="19" y="13" width="48" height="31" rx="13" fill={color} />
      <path
        d="M27 17h28"
        stroke="#fff"
        opacity=".4"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="25" y="23" width="36" height="14" rx="7" fill="#25333b" />
      <circle cx="36" cy="30" r="2.4" fill="#e5f5f6" />
      <circle cx="50" cy="30" r="2.4" fill="#e5f5f6" />
      <rect
        x="38"
        y="48"
        width="10"
        height="6"
        rx="2"
        fill="#fff"
        opacity=".55"
      />
    </svg>
  );
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dg-modal ${wide ? "wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          const rect = ref.current.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="dg-modal-body">{children}</div>
    </dialog>
  );
}
function ImportForm({ onImport }: { onImport: (catalog: Catalog) => void }) {
  const [files, setFiles] = useState<File[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (files.length > 2 || !files.length)
        throw new Error(
          "Select manifest.json and optionally run_results.json (up to two files).",
        );
      if (files.some((file) => file.size > 25_000_000))
        throw new Error("Each artifact must be smaller than 25 MB.");
      const values = await Promise.all(
        files.map(async (file) => {
          try {
            return JSON.parse(await file.text()) as Record<string, unknown>;
          } catch {
            throw new Error(`${file.name} is not valid JSON.`);
          }
        }),
      );
      const manifests = values.filter(
        (value) => value && typeof value === "object" && "nodes" in value,
      );
      if (manifests.length !== 1)
        throw new Error(
          "Select exactly one dbt manifest.json. The second file can be run_results.json.",
        );
      const manifest = manifests[0]!;
      const next = parseCatalog(
        manifest,
        values.find((value) => value !== manifest),
      );
      if (!next.assets.some((item) => !isTest(item)))
        throw new Error("No models, sources, or exposures were found.");
      onImport(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not import artifacts.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="dg-description">
        Use artifacts from your own dbt project to explore real
        dependencies—without connecting your warehouse.
      </p>
      <div className="dg-import-steps">
        <span>1</span>
        <div>
          <strong>Find your dbt artifacts</strong>
          <p>
            Use <code>target/manifest.json</code> from a dbt parse, compile, or
            run. Optionally include <code>target/run_results.json</code> from
            the relevant run or test.
          </p>
        </div>
      </div>
      <div className="dg-import-steps">
        <span>2</span>
        <div>
          <strong>Select both files together</strong>
          <p>
            Metadata stays in this browser. SQL and credentials are not
            retained. Up to 5,000 assets; 25 MB per file.
          </p>
        </div>
      </div>
      <label className="dg-upload">
        <Upload size={26} />
        <strong>Choose dbt artifacts</strong>
        <span>
          {files.length
            ? files.map((file) => file.name).join(" + ")
            : "manifest.json + optional run_results.json"}
        </span>
        <input
          aria-label="Choose dbt artifact files"
          type="file"
          accept=".json,application/json"
          multiple
          onChange={(event) => {
            setFiles(Array.from(event.target.files || []));
            setError("");
          }}
        />
      </label>
      {error && (
        <p className="dg-banner error" role="alert">
          {error}
        </p>
      )}
      <p className="dg-description">
        Import replaces the current catalog snapshot, not agent history. Missing
        results are shown as unknown. No freshness or live health is inferred.
      </p>
      <button
        className="dg-button primary"
        disabled={!files.length || busy}
        onClick={() => void submit()}
      >
        {busy ? <Loader2 size={16} /> : <ArrowRight size={16} />}Open my data
        canvas
      </button>
    </>
  );
}
function InlineDecision({
  decision,
  busy,
  onDecide,
}: {
  decision: Decision;
  busy: boolean;
  onDecide: (allow: boolean, answers?: Record<string, string>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return (
    <section className="dg-decision" role="region" aria-label="Decision needed">
      <span className="dg-eyebrow">NEEDS YOU</span>
      <h3>{decision.title}</h3>
      <p>{decision.reason}</p>
      {decision.kind === "question" ? (
        decision.questions?.map((question) => (
          <label key={question.id} className="dg-field">
            {question.question}
            {question.options.length > 0 && (
              <select
                aria-label={`Suggested answer for ${question.question}`}
                value={
                  question.options.includes(answers[question.id] || "")
                    ? answers[question.id]
                    : ""
                }
                onChange={(event) =>
                  setAnswers((old) => ({
                    ...old,
                    [question.id]: event.target.value,
                  }))
                }
              >
                <option value="">Choose or write below</option>
                {question.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            )}
            <input
              value={answers[question.id] || ""}
              onChange={(event) =>
                setAnswers((old) => ({
                  ...old,
                  [question.id]: event.target.value,
                }))
              }
            />
          </label>
        ))
      ) : (
        <pre>{decision.details}</pre>
      )}
      <footer>
        {decision.kind === "approval" && (
          <button
            className="dg-button"
            disabled={busy}
            onClick={() => void onDecide(false)}
          >
            Decline
          </button>
        )}
        <button
          className="dg-button primary"
          disabled={
            busy ||
            (decision.kind === "question" &&
              !decision.questions?.every((question) =>
                answers[question.id]?.trim(),
              ))
          }
          onClick={() => void onDecide(true, answers)}
        >
          <Check size={15} />
          {decision.kind === "question" ? "Send answer" : "Allow once"}
        </button>
      </footer>
    </section>
  );
}
