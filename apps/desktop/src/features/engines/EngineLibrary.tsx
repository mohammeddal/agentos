import { useEffect, useRef, useState } from "react";
import {
  Blocks,
  Bot,
  BookOpen,
  Cable,
  CircleCheck,
  ChevronRight,
  FileSearch,
  MessageSquarePlus,
  Plug,
  RefreshCw,
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
import { setupPrompt } from "./EngineSettings";
import "./engine-library.css";
import { HelpTip } from "../../shared/HelpTip";

const icons = { mcp: Cable, skill: BookOpen, agent: Bot, connector: Plug, plugin: Blocks };
const statusNames = {
  found: "Found locally",
  configured: "Configured",
  disabled: "Disabled in source",
  cached: "Cached · not verified",
};
export function EngineLibrary({
  query,
  setupWithChat,
  focus,
}: {
  query: string;
  /** Opens a chat that can make changes, prefilled with a setup request. */
  setupWithChat?: ((prompt: string, engine: Engine) => void) | undefined;
  /** Set when a workflow asked to set up a missing capability. */
  focus?: { id: number; kind?: CapabilityKind; engine?: Engine } | null | undefined;
}) {
  const [engine, setEngine] = useState<Engine>(() => {
    try {
      const saved = localStorage.getItem("agentos:inventory-engine");
      return saved === "claude" ? saved : "codex";
    } catch {
      return "codex";
    }
  });
  const [workspace, setWorkspace] = useState(() => {
    try {
      return localStorage.getItem("agentos:inventory-workspace") || "";
    } catch {
      return "";
    }
  });
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [kind, setKind] = useState<CapabilityKind | "all">("all"),
    [scope, setScope] = useState("all");
  const [selected, setSelected] = useState<Capability | null>(null);
  const [limit, setLimit] = useState(30);
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
    if (focus?.engine && focus.engine !== engine) setEngine(focus.engine);
  }, [focus?.id]);
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
  return (
    <section className="co-engines">
      <div className="co-engine-bar">
        <label className="co-engine-source">
          Source
          <select
            aria-label="Capability source"
            value={engine}
            disabled={busy}
            onChange={(event) => {
              setEngine(event.target.value as Engine);
              setScope("all");
              setKind("all");
            }}
          >
            <option value="codex">{engineNames.codex}</option>
            <option value="claude">{engineNames.claude}</option>
            <option value="gemini" disabled>
              {engineNames.gemini} · Soon
            </option>
          </select>
        </label>
        <label className="co-engine-source co-engine-folder">
          Project folder
          <input
            aria-label="Project folder to include"
            placeholder="Optional absolute path"
            value={workspace}
            onChange={(event) => setWorkspace(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              try {
                localStorage.setItem("agentos:inventory-workspace", workspace.trim());
              } catch {
                /* Session only. */
              }
              void refresh();
            }}
          />
        </label>
        <div className="co-engine-actions">
          {setupWithChat &&
            (["mcp", "skill"] as const).map((target) => (
              <button
                key={target}
                className="co-button"
                disabled={engine === "gemini"}
                title="Describe what you need; the engine installs and configures it, asking first"
                onClick={() => setupWithChat(setupPrompt(target, engine), engine)}
              >
                <MessageSquarePlus size={14} />
                New {target === "mcp" ? "MCP server" : "skill"}
              </button>
            ))}
          <button className="co-button" disabled={busy} onClick={() => void refresh()}>
            <RefreshCw size={14} />
            {busy ? "Scanning…" : "Refresh"}
          </button>
        </div>
      </div>
      {focus?.kind && setupWithChat && (
        <div className="co-engine-setup-note">
          <strong>Add {capabilityNames[focus.kind].toLowerCase()}</strong>
          <p>Pick an installed one below, or let {engineNames[engine]} set up a new one for you.</p>
          <button
            className="co-button co-button-primary"
            onClick={() => setupWithChat(setupPrompt(focus.kind!, engine), engine)}
          >
            <MessageSquarePlus size={14} />
            Set it up with chat
          </button>
        </div>
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
