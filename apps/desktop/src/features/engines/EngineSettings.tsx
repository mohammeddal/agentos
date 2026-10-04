import { useEffect, useState } from "react";
import { CircleCheck, MessageSquarePlus, RefreshCw } from "lucide-react";
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
  autonomyOptions,
  readAlwaysAllow,
  readAutonomy,
  saveAlwaysAllow,
  saveAutonomy,
  scopeLabel,
  type Autonomy,
} from "./provider-permissions";
import {
  CHAT_ENGINES,
  readChatEngines,
  saveChatEngines,
  type ChatEngine,
  type ChatEnginePreferences,
} from "./chat-engines";
import { ModelPicker } from "./ModelPicker";
import { readDefaultModels, saveDefaultModels } from "./default-models";
import type { ModelChoice } from "./model-choice";
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

/** A ready-to-send chat prompt that asks the engine to set up the requested capability. */
export function setupPrompt(kind: CapabilityKind, engine: Engine): string {
  const name = engineNames[engine];
  const what = {
    mcp: "MCP server",
    skill: "skill",
    agent: "agent",
    connector: "connector",
    plugin: "plugin",
  }[kind];
  return `Help me set up a new ${what} for ${name}. Ask me what it should do, then propose the plan: which package or server to use, what to install, and the exact config change (for example \`${engine === "claude" ? "claude mcp add" : "codex mcp add"}\`). Wait for my go-ahead before installing anything or editing config, and never ask me to paste credentials in chat — use an interactive sign-in instead. After installing, verify it starts and tell me how to use it.`;
}

export function EngineSettings({
  focus,
  setupWithChat,
}: {
  focus?: EngineSettingsFocus | null;
  /** Opens a chat that can make changes, prefilled with a setup request. */
  setupWithChat?: (prompt: string, engine: Engine) => void;
}) {
  const live = useLiveRuntime();
  const [engine, setEngine] = useState<Engine>(savedEngine);
  const [workspace, setWorkspace] = useState(savedWorkspace);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [autonomy, setAutonomyState] = useState<Autonomy>(readAutonomy);
  const [alwaysAllow, setAlwaysAllow] = useState<string[]>(readAlwaysAllow);
  const [chatEngines, setChatEngines] = useState<ChatEnginePreferences>(readChatEngines);
  const [defaultModels, setDefaultModels] =
    useState<Record<string, ModelChoice>>(readDefaultModels);

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

  function setAutonomy(next: Autonomy) {
    setAutonomyState(next);
    try {
      saveAutonomy(next);
      setError("");
    } catch {
      setError("Permission preferences could not be saved. They remain active for this session.");
    }
  }

  function updateDefaultModel(engine: string, choice: ModelChoice) {
    const next = { ...defaultModels, [engine]: choice };
    setDefaultModels(next);
    try {
      saveDefaultModels(next);
      setError("");
    } catch {
      setError("Default models could not be saved. They remain active for this session.");
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
          {setupWithChat && (
            <button
              className="co-button co-button-primary"
              onClick={() => setupWithChat(setupPrompt(focus.kind!, engine), engine)}
            >
              <MessageSquarePlus size={14} />
              Set it up with chat
            </button>
          )}
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
            Existing chats can switch engines from Chat settings.
          </small>
        </section>

        {setupWithChat && (
          <section className="co-setup-chat">
            <h3>Add capabilities</h3>
            <p>
              Describe what you need and {engineNames[engine]} will plan it, install packages, and
              update its config — asking before each change.
            </p>
            <div>
              {(["mcp", "skill"] as const).map((kind) => (
                <button
                  key={kind}
                  className="co-button"
                  disabled={engine === "gemini"}
                  onClick={() => setupWithChat(setupPrompt(kind, engine), engine)}
                >
                  <MessageSquarePlus size={14} />
                  New {kind === "mcp" ? "MCP server" : "skill"}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="co-default-models">
          <h3>Default models</h3>
          <p>
            Used when a chat, agent, or workflow doesn&apos;t pick its own model. Step overrides
            win, then workflow defaults, then the agent&apos;s model, then these.
          </p>
          {(["codex", "claude"] as const).map((id) => (
            <div key={id}>
              <strong>{id === "codex" ? "Codex" : "Claude Code"}</strong>
              <ModelPicker
                engine={id}
                value={defaultModels[id]}
                label={`${id} app default`}
                onChange={(choice) => updateDefaultModel(id, choice)}
              />
            </div>
          ))}
        </section>

        <section className="co-provider-permissions">
          <h3>How much should engines do on their own?</h3>
          <p>Applies to workflows and chats that can make changes. Read-only chats never act.</p>
          <div className="co-autonomy" role="radiogroup" aria-label="Autonomy">
            {(Object.keys(autonomyOptions) as Autonomy[]).map((value) => (
              <label key={value} data-selected={autonomy === value || undefined}>
                <input
                  type="radio"
                  name="autonomy"
                  checked={autonomy === value}
                  onChange={() => setAutonomy(value)}
                />
                <span>
                  <strong>{autonomyOptions[value].label}</strong>
                  <small>{autonomyOptions[value].detail}</small>
                </span>
              </label>
            ))}
          </div>
          {alwaysAllow.length > 0 && (
            <div className="co-always-allow">
              <strong>Always allowed</strong>
              {alwaysAllow.map((scope) => (
                <span key={scope}>
                  {scopeLabel(scope)}
                  <button
                    type="button"
                    className="co-button"
                    onClick={() => {
                      const next = alwaysAllow.filter((item) => item !== scope);
                      setAlwaysAllow(next);
                      try {
                        saveAlwaysAllow(next);
                      } catch {
                        setError("Could not save. The change applies to this session only.");
                      }
                    }}
                  >
                    Remove
                  </button>
                </span>
              ))}
            </div>
          )}
          <small className="co-setting-footnote">
            Copied into each new run. Approval blocks on a workflow are never skipped.
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
