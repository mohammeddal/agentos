import { useEffect, useRef, useState } from "react";
import {
  Blocks,
  Bot,
  BookOpen,
  Cable,
  CircleCheck,
  ChevronRight,
  FileSearch,
  Plug,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";
import {
  capabilityNames,
  discoverEngine,
  engineNames,
  type Capability,
  type CapabilityKind,
  type Engine,
  type Inventory,
} from "./engine-inventory";
import "./engine-library.css";
import { NotificationSettings } from "./live-notifications";
import { refreshEngines, useLiveRuntime } from "./live-runtime";
import { HelpTip } from "../../shared/HelpTip";

const icons = { mcp: Cable, skill: BookOpen, agent: Bot, connector: Plug, plugin: Blocks };
const statusNames = {
  found: "Found locally",
  configured: "Configured",
  disabled: "Disabled in source",
  cached: "Cached · not verified",
};
export type LibraryFocus = {
  id: number;
  kind: CapabilityKind;
  engine: Engine;
  openSettings: boolean;
};
export function EngineLibrary({ query, focus }: { query: string; focus?: LibraryFocus | null }) {
  const live = useLiveRuntime();
  const [engine, setEngine] = useState<Engine>(() => {
    try {
      const saved = localStorage.getItem("agentos:inventory-engine");
      return saved === "claude" ? saved : "codex";
    } catch {
      return "codex";
    }
  });
  const [workspace, setWorkspace] = useState("");
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [kind, setKind] = useState<CapabilityKind | "all">("all"),
    [scope, setScope] = useState("all");
  const [selected, setSelected] = useState<Capability | null>(null);
  const [settings, setSettings] = useState(false);
  const [limit, setLimit] = useState(30);
  useEffect(() => {
    if (!focus) return;
    setEngine(focus.engine);
    setKind(focus.kind);
    setScope("all");
    setSettings(focus.openSettings);
  }, [focus?.id]);
  useEffect(() => {
    setLimit(30);
    setSelected(null);
  }, [kind, scope, query, engine]);
  const request = useRef(0);
  async function refresh(target = engine) {
    const id = ++request.current;
    setBusy(true);
    setError("");
    setInventory(null);
    setSelected(null);
    try {
      const next = await discoverEngine(target, workspace.trim() || undefined);
      if (request.current === id) setInventory(next);
    } catch (e) {
      if (request.current === id) setError(e instanceof Error ? e.message : "Discovery failed.");
    } finally {
      if (request.current === id) setBusy(false);
    }
  }
  useEffect(() => {
    void refresh(engine);
    try {
      localStorage.setItem("agentos:inventory-engine", engine);
    } catch {
      /* Selection still works. */
    }
    return () => {
      request.current++;
    };
  }, [engine]);
  const entries = inventory?.entries || [];
  const visible = entries.filter(
    (e) =>
      (kind === "all" || e.kind === kind) &&
      (scope === "all" || e.scope === scope) &&
      `${e.name} ${e.description} ${e.scope} ${e.source}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const errors = inventory?.sources.filter((s) => s.status === "error").length || 0;
  const readyEngines = live.engines.filter((item) => item.installed).length;
  return (
    <section className="co-engines">
      <div className="co-engine-bar">
        <div className="co-engine-picker" role="group" aria-label="Engine">
          {Object.entries(engineNames).map(([id, name]) => (
            <button
              key={id}
              disabled={busy || id === "gemini"}
              aria-pressed={engine === id}
              title={id === "gemini" ? "Gemini support is coming later" : undefined}
              onClick={() => {
                setEngine(id as Engine);
                setScope("all");
                setKind("all");
              }}
            >
              {name}
              {id === "gemini" && <span>Soon</span>}
            </button>
          ))}
        </div>
        <div className="co-engine-actions">
          <span className="co-engine-runtime-state">
            <i aria-hidden="true" data-ready={live.native && readyEngines > 0} />
            {live.native
              ? `${readyEngines} engine${readyEngines === 1 ? "" : "s"} ready`
              : "Preview"}
          </span>
          <button
            className="co-button"
            aria-expanded={settings}
            aria-controls="engine-settings"
            onClick={() => setSettings((open) => !open)}
          >
            <Settings2 size={14} />
            Settings
          </button>
          <button className="co-button" disabled={busy} onClick={() => void refresh()}>
            <RefreshCw size={14} />
            {busy ? "Scanning…" : "Refresh"}
          </button>
        </div>
      </div>
      {settings && (
        <section id="engine-settings" className="co-engine-settings" aria-label="Engine settings">
          <header>
            <div>
              <strong>{focus ? `Set up ${capabilityNames[focus.kind]}` : "Engine settings"}</strong>
              <p>
                {focus
                  ? `Configure it for ${engineNames[engine]}, then refresh the inventory.`
                  : "Connections, inventory location, and notifications."}
              </p>
            </div>
            <button
              className="co-icon-button"
              aria-label="Close engine settings"
              onClick={() => setSettings(false)}
            >
              <X size={16} />
            </button>
          </header>
          {focus && (
            <div className="co-engine-setup-note">
              <strong>Provider-managed setup</strong>
              <p>
                AgentOS reads your existing local configuration but does not copy credentials or
                silently enable capabilities. Complete setup in the selected engine, then choose
                Refresh to make it available to the workflow picker.
              </p>
            </div>
          )}
          <div className="co-engine-settings-grid">
            <section>
              <div className="co-engine-setting-heading">
                <div>
                  <h3>Execution engines</h3>
                  <p>
                    {live.native
                      ? "AgentOS uses your existing CLI sign-ins."
                      : "Connection checks are available in the Mac app."}
                  </p>
                </div>
                <button
                  className="co-button"
                  disabled={!live.native}
                  onClick={() => void refreshEngines()}
                >
                  Check
                </button>
              </div>
              <div className="co-engine-connections">
                {live.native && !live.engines.length && <small>Checking local engines…</small>}
                {live.engines.map((item) => (
                  <details key={item.engine}>
                    <summary>
                      <span>
                        <i aria-hidden="true" data-ready={item.installed} />
                        <strong>{item.engine === "codex" ? "Codex" : "Claude Code"}</strong>
                      </span>
                      <small>{item.installed ? "Ready to try" : "Not found"}</small>
                    </summary>
                    <p>{item.installed ? item.path : item.detail}</p>
                    <p>
                      Sign in from Terminal with{" "}
                      <code>{item.engine === "codex" ? "codex login" : "claude auth login"}</code>.
                    </p>
                  </details>
                ))}
                {!live.native && (
                  <small>Open the installed app to check Codex and Claude Code.</small>
                )}
              </div>
            </section>
            <section>
              <h3>Inventory location</h3>
              <p>Add a project folder only when you need its project-level capabilities.</p>
              <form
                className="co-engine-workspace"
                onSubmit={(e) => {
                  e.preventDefault();
                  void refresh();
                }}
              >
                <label htmlFor="inventory-workspace">Workspace folder</label>
                <div>
                  <input
                    id="inventory-workspace"
                    value={workspace}
                    onChange={(e) => setWorkspace(e.target.value)}
                    placeholder="Optional absolute path"
                    disabled={busy}
                  />
                  <button className="co-button" disabled={busy}>
                    Scan
                  </button>
                </div>
              </form>
            </section>
            <section className="co-engine-notifications">
              <h3>Notifications</h3>
              <NotificationSettings />
            </section>
          </div>
          {live.error && (
            <p role="alert" className="co-form-error">
              {live.error}
            </p>
          )}
          <details className="co-engine-diagnostics">
            <summary>Privacy and discovery details</summary>
            <p>
              Discovery is read-only. AgentOS does not start MCP servers, change permissions, copy
              credentials, or confirm that a capability is available to a live session.
            </p>
            {inventory && (
              <>
                <h4>Coverage</h4>
                <ul>
                  {inventory.limitations.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
                <details className="co-engine-sources-disclosure">
                  <summary>Source paths · {inventory.sources.length}</summary>
                  <div className="co-engine-sources">
                    {inventory.sources.map((source, i) => (
                      <div key={`${source.path}:${i}`}>
                        <span>{source.status}</span>
                        <code>{source.path}</code>
                        {source.note && <small>{source.note}</small>}
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
          </details>
        </section>
      )}
      {error && (
        <div role="alert" className="co-form-error">
          {error} No previous results are shown as current. Try Refresh inventory.
        </div>
      )}
      {busy && <p role="status">Reading capability metadata from local engine folders…</p>}
      {inventory && (
        <>
          <div className="co-engine-inventory-summary">
            <span>
              <CircleCheck size={14} />
              <strong>{entries.length} capabilities</strong>
              <small>
                {inventory.workspace ? "Project and personal sources" : "Personal sources"} ·
                updated{" "}
                {new Date(inventory.scannedAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </small>
            </span>
            <HelpTip label="About this inventory" align="end">
              This is a read-only snapshot of local source records. It does not prove live access or
              authentication.
            </HelpTip>
          </div>
          <nav className="co-engine-tabs" aria-label="Capability type">
            <button
              aria-label="All capabilities"
              aria-pressed={kind === "all"}
              onClick={() => setKind("all")}
            >
              All <em>{entries.length}</em>
            </button>
            {Object.entries(capabilityNames).map(([id, name]) => {
              const Icon = icons[id as CapabilityKind];
              return (
                <button
                  key={id}
                  aria-label={name}
                  aria-pressed={kind === id}
                  onClick={() => setKind(id as CapabilityKind)}
                >
                  <Icon size={14} />
                  {name}
                  <em>{entries.filter((e) => e.kind === id).length}</em>
                </button>
              );
            })}
          </nav>
          <div className="co-engine-list-heading">
            <p>
              {visible.length} {visible.length === 1 ? "source record" : "source records"}
              {errors > 0 ? ` · ${errors} source warnings` : ""}
            </p>
            <label>
              Scope
              <select
                aria-label="Capability scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="all">All sources</option>
                {[...new Set(entries.map((e) => e.scope))].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div className={`co-engine-layout ${selected ? "inspecting" : ""}`}>
            <div className="co-engine-list">
              {visible.slice(0, limit).map((entry) => {
                const Icon = icons[entry.kind];
                return (
                  <button
                    key={entry.id}
                    aria-label={`${entry.name} · ${capabilityNames[entry.kind]}`}
                    className={`co-capability-row ${selected?.id === entry.id ? "selected" : ""}`}
                    onClick={() => setSelected(entry)}
                  >
                    <span className="co-capability-icon">
                      <Icon size={18} />
                    </span>
                    <span className="co-capability-copy">
                      <strong>{entry.name}</strong>
                      <small>
                        {entry.description || `${capabilityNames[entry.kind]} · ${entry.scope}`}
                      </small>
                    </span>
                    <span className="co-capability-state">
                      {statusNames[entry.status]}
                      <small>{entry.scope}</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                );
              })}
              {!visible.length && (
                <div className="co-engine-empty">
                  <FileSearch size={28} />
                  <h3>
                    {engine === "gemini"
                      ? "This adapter is next."
                      : kind === "connector"
                        ? "No local connector records found."
                        : "No matching source records."}
                  </h3>
                  <p>
                    {engine === "gemini"
                      ? "Gemini has not been scanned. Switch to Codex or Claude Code."
                      : kind === "connector"
                        ? "This does not mean your account has no connectors. Cloud account discovery is not connected; inspect MCP servers for locally configured integrations."
                        : "Change the filter, select a workspace, or inspect the discovery sources below. Built-in and session-only capabilities may not have local files."}
                  </p>
                </div>
              )}
            </div>
            {selected && (
              <aside className="co-capability-detail" aria-label="Capability details">
                <div>
                  <span>{capabilityNames[selected.kind]}</span>
                  <button className="co-button" onClick={() => setSelected(null)}>
                    Close details
                  </button>
                </div>
                <h3>{selected.name}</h3>
                <p>{selected.description || "No description in the source metadata."}</p>
                <dl>
                  <dt>Discovery status</dt>
                  <dd>{statusNames[selected.status]}</dd>
                  <dt>Engine</dt>
                  <dd>{engineNames[engine]}</dd>
                  <dt>Scope</dt>
                  <dd>{selected.scope}</dd>
                  <dt>Source</dt>
                  <dd>
                    <code>{selected.source}</code>
                  </dd>
                  <dt>Runtime access</dt>
                  <dd>Not verified</dd>
                </dl>
                <p className="co-engine-detail-note">
                  {selected.status === "cached"
                    ? "A cached package can remain after uninstalling or updating. Its presence does not mean this capability is enabled."
                    : "Refresh after changing the source in your engine. AgentOS does not copy, install, enable, or assign this capability."}
                </p>
              </aside>
            )}
          </div>
          {visible.length > limit && (
            <button className="co-button" onClick={() => setLimit((n) => n + 30)}>
              Show more · {Math.min(limit, visible.length)} of {visible.length}
            </button>
          )}
        </>
      )}
    </section>
  );
}
