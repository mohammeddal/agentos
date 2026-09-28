import { useEffect, useState } from "react";
import { CircleCheck, RefreshCw } from "lucide-react";
import {
  capabilityNames,
  discoverEngine,
  engineNames,
  type CapabilityKind,
  type Engine,
  type Inventory,
} from "./engine-inventory";
import { NotificationSettings } from "./live-notifications";
import { refreshEngines, useLiveRuntime } from "./live-runtime";
import {
  readProviderPermissions,
  saveProviderPermissions,
  type ProviderPermissions,
} from "./provider-permissions";
import {
  CHAT_ENGINES,
  readChatEngines,
  saveChatEngines,
  type ChatEngine,
  type ChatEnginePreferences,
} from "./chat-engines";
import "./engine-library.css";

const WORKSPACE_STORAGE = "agentos:inventory-workspace";

export type EngineSettingsFocus = {
  id: number;
  kind?: CapabilityKind;
  engine?: Engine;
};

function savedEngine(): Engine {
  try {
    return localStorage.getItem("agentos:inventory-engine") === "claude" ? "claude" : "codex";
  } catch {
    return "codex";
  }
}

function savedWorkspace(): string {
  try {
    return localStorage.getItem(WORKSPACE_STORAGE) || "";
  } catch {
    return "";
  }
}

export function EngineSettings({ focus }: { focus?: EngineSettingsFocus | null }) {
  const live = useLiveRuntime();
  const [engine, setEngine] = useState<Engine>(savedEngine);
  const [workspace, setWorkspace] = useState(savedWorkspace);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState<ProviderPermissions>(readProviderPermissions);
  const [chatEngines, setChatEngines] = useState<ChatEnginePreferences>(readChatEngines);

  useEffect(() => {
    if (focus?.engine) setEngine(focus.engine);
  }, [focus?.id]);

  useEffect(() => {
    try {
      localStorage.setItem("agentos:inventory-engine", engine);
    } catch {
      /* Selection remains available for this session. */
    }
  }, [engine]);

  function setPermission<K extends keyof ProviderPermissions>(
    provider: K,
    value: ProviderPermissions[K],
  ) {
    const next = { ...permissions, [provider]: value };
    setPermissions(next);
    try {
      saveProviderPermissions(next);
      setError("");
    } catch {
      setError("Permission preferences could not be saved. They remain active for this session.");
    }
  }

  function updateChatEngines(next: ChatEnginePreferences) {
    setChatEngines(next);
    try {
      saveChatEngines(next);
      setError("");
    } catch {
      setError("Chat engine preferences could not be saved. They remain active for this session.");
    }
  }

  function toggleChatEngine(engine: ChatEngine, on: boolean) {
    const enabled = CHAT_ENGINES.filter((e) =>
      e === engine ? on : chatEngines.enabled.includes(e),
    );
    if (!enabled.length) return;
    updateChatEngines({
      enabled,
      default: enabled.includes(chatEngines.default) ? chatEngines.default : enabled[0]!,
    });
  }

  async function scan() {
    setBusy(true);
    setError("");
    try {
      const path = workspace.trim();
      const next = await discoverEngine(engine, path || undefined);
      setInventory(next);
      try {
        localStorage.setItem(WORKSPACE_STORAGE, path);
      } catch {
        /* The scan still works for this session. */
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discovery failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="co-engine-settings co-engine-settings-page" aria-label="Engine settings">
      <header>
        <div>
          <strong>Engines & notifications</strong>
          <p>Local provider connections, project inventory, and Mac notifications.</p>
        </div>
        <button className="co-button" disabled={busy} onClick={() => void scan()}>
          <RefreshCw size={14} />
          {busy ? "Scanning…" : "Scan inventory"}
        </button>
      </header>

      {focus?.kind && (
        <div className="co-engine-setup-note">
          <strong>Set up {capabilityNames[focus.kind]}</strong>
          <p>
            Configure it in {engineNames[engine]}, then scan here. AgentOS reads existing local
            configuration without copying credentials or enabling permissions.
          </p>
        </div>
      )}

      <div className="co-settings-provider" role="group" aria-label="Provider to configure">
        {Object.entries(engineNames).map(([id, name]) => (
          <button
            key={id}
            disabled={id === "gemini"}
            aria-pressed={engine === id}
            title={id === "gemini" ? "Gemini support is coming later" : undefined}
            onClick={() => setEngine(id as Engine)}
          >
            {name}
            {id === "gemini" && <span>Soon</span>}
          </button>
        ))}
      </div>

      <div className="co-engine-settings-grid">
        <section>
          <div className="co-engine-setting-heading">
            <div>
              <h3>Execution engines</h3>
              <p>
                {live.native
                  ? "Uses your existing CLI sign-ins."
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
                  <small>{item.installed ? "Ready" : "Not found"}</small>
                </summary>
                <p>{item.installed ? item.path : item.detail}</p>
                <p>
                  Sign in from Terminal with{" "}
                  <code>{item.engine === "codex" ? "codex login" : "claude auth login"}</code>.
                </p>
              </details>
            ))}
            {!live.native && <small>Open the installed app to check local engines.</small>}
          </div>
        </section>

        <section className="co-chat-engines">
          <h3>Chat engines</h3>
          <p>Choose which engines new chats can use and which one they start with.</p>
          {CHAT_ENGINES.map((engine) => {
            const on = chatEngines.enabled.includes(engine);
            const only = on && chatEngines.enabled.length === 1;
            return (
              <div key={engine} className="co-chat-engine-row">
                <label>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={only}
                    title={only ? "Keep at least one engine on" : undefined}
                    onChange={(event) => toggleChatEngine(engine, event.target.checked)}
                  />
                  <strong>{engine}</strong>
                </label>
                <label className="co-chat-engine-default">
                  <input
                    type="radio"
                    name="chat-engine-default"
                    checked={chatEngines.default === engine}
                    disabled={!on}
                    onChange={() => updateChatEngines({ ...chatEngines, default: engine })}
                  />
                  Default
                </label>
              </div>
            );
          })}
          <small className="co-setting-footnote">
            Existing chats keep the engine they were started with.
          </small>
        </section>

        <section className="co-provider-permissions">
          <h3>Provider permissions</h3>
          <p>Choose how often each engine pauses during tasks. Chat stays read-only.</p>
          <label>
            <span>
              <strong>Codex</strong>
              <small>Always restricted to the task workspace.</small>
            </span>
            <select
              value={permissions.codex}
              onChange={(event) =>
                setPermission("codex", event.target.value as ProviderPermissions["codex"])
              }
            >
              <option value="on-request">Ask when needed</option>
              <option value="never">No provider prompts</option>
            </select>
          </label>
          <label>
            <span>
              <strong>Claude Code</strong>
              <small>Workflow approval blocks still apply.</small>
            </span>
            <select
              value={permissions.claude}
              onChange={(event) =>
                setPermission("claude", event.target.value as ProviderPermissions["claude"])
              }
            >
              <option value="default">Ask permissions</option>
              <option value="acceptEdits">Auto-accept workspace edits</option>
            </select>
          </label>
          <small className="co-setting-footnote">
            These defaults are copied into each new run. Explicit approval blocks on a workflow are
            never skipped.
          </small>
        </section>

        <section>
          <h3>Project inventory</h3>
          <p>Optional. Add a folder to include its project-level capabilities.</p>
          <form
            className="co-engine-workspace"
            onSubmit={(event) => {
              event.preventDefault();
              void scan();
            }}
          >
            <label htmlFor="inventory-workspace">Workspace folder</label>
            <div>
              <input
                id="inventory-workspace"
                value={workspace}
                onChange={(event) => setWorkspace(event.target.value)}
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

      {live.error && <p className="co-form-error">{live.error}</p>}
      {error && <p className="co-form-error">{error}</p>}
      <details className="co-engine-diagnostics">
        <summary>Privacy and discovery details</summary>
        <p>
          Discovery is read-only. AgentOS does not start MCP servers, change permissions, copy
          credentials, or confirm live-session access.
        </p>
        {inventory && (
          <>
            <h4>
              <CircleCheck size={13} /> {inventory.entries.length} records found
            </h4>
            <ul>
              {inventory.limitations.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <details className="co-engine-sources-disclosure">
              <summary>Source paths · {inventory.sources.length}</summary>
              <div className="co-engine-sources">
                {inventory.sources.map((source, index) => (
                  <div key={`${source.path}:${index}`}>
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
  );
}
