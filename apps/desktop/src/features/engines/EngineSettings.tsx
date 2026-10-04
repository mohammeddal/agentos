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

export type EngineSettingsFocus = {
  id: number;
  kind?: CapabilityKind;
  engine?: Engine;
};

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

export function EngineSettings() {
  const live = useLiveRuntime();
  const [error, setError] = useState("");
  const [autonomy, setAutonomyState] = useState<Autonomy>(readAutonomy);
  const [alwaysAllow, setAlwaysAllow] = useState<string[]>(readAlwaysAllow);
  const [chatEngines, setChatEngines] = useState<ChatEnginePreferences>(readChatEngines);
  const [defaultModels, setDefaultModels] =
    useState<Record<string, ModelChoice>>(readDefaultModels);

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

  return (
    <section className="co-engine-settings co-engine-settings-page" aria-label="Engine settings">
      <div className="co-engine-settings-grid">
        <section>
          <div className="co-engine-setting-heading">
            <div>
              <h3>Engines</h3>
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
          <h3>Chat</h3>
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

        <section className="co-default-models">
          <h3>Models</h3>
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
          <h3>Permissions</h3>
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

        <section className="co-engine-notifications">
          <h3>Notifications</h3>
          <NotificationSettings />
        </section>
      </div>

      {live.error && <p className="co-form-error">{live.error}</p>}
      {error && <p className="co-form-error">{error}</p>}
    </section>
  );
}
