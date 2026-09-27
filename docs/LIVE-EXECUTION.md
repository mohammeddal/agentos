# Native live execution

This guide supersedes draft-only statements in the earlier UX verification and usage notes. Live execution is implemented in the installed Tauri app, not in the browser preview or legacy Studio route.

## First run

1. Install the official Codex CLI or Claude Code. Sign in in Terminal with `codex login` or `claude auth login`.
2. Open AgentOS. Library → Engine capabilities shows executable discovery and notification preferences. “Installed” means a CLI was found, not that its token is valid.
3. In Start → Options choose Codex or Claude Code, a model, and its reasoning effort, then Send message. Chat history resumes the provider session on subsequent turns. You can change model/effort for the next message without losing the conversation. Old unsent drafts are preserved, not automatically transmitted.
4. Create a task, choose its agents/domains and project, then open its details and choose Run task. Review any pending approval in task details or Activity.

An expired/revoked login requires provider reauthentication; AgentOS cannot repair that token. Claude can report a locally stored sign-in while a real request returns HTTP 401. No successful Claude generation should be claimed until it passes a real request.

## Supported behavior

| Feature           | Native behavior                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat              | Codex app-server or Claude Code bidirectional streaming; persistent sessions, output, cancellation, errors                                                           |
| Tasks             | Assigned agents run in order, using each agent's selected engine and role; previous outputs become reference context                                                 |
| Workflow handoffs | Success, failure, completion, human approval, and structured JSON output comparisons                                                                                 |
| Linked tasks      | Expanded into the same run; require the same project; cycles/deep nesting and conflicting reviewer gates are rejected                                                |
| Approval          | Human start gates; actual reviewer-agent JSON decisions; provider command/file/tool approval requests supported by the adapter                                       |
| Canvas            | Agent/domain flows, custom prompts, inline context, human/reviewer checkpoints; joins require matching conditions                                                    |
| Cron              | Explicitly enable a frozen plan in task details; ticks every 15 seconds while app is open/awake; more than one minute overdue is skipped; no replay queue or overlap |
| Memory            | Reviewed, non-conflicting scope-matched Markdown records included as reference; off excludes memory; live failures can be captured as unreviewed issues              |
| Activity          | Real saved runs, status, step results, provider-published progress, tool output, pending approvals, and Stop                                                         |
| Office map        | Active performer status from runs; approval state; completed performers can be idle; no synthetic activity unless preview is explicitly enabled                      |
| Notifications     | User opt-in, macOS permission; completion/failure/approval messages omit prompts and output                                                                          |
| Projects          | Project tasks run in the app-owned project root; existing domain/agent directories remain organization folders, not separate execution sandboxes                     |

## Attachment transport

The native app stores immutable selected-file copies under its application-data `runtime/attachments` directory with private file permissions. Frontend company/draft metadata and run requests contain opaque IDs, never binary blobs or original absolute paths. Before starting any run, all step/reviewer references and aggregate limits are checked. Missing or unreadable files fail before provider execution.

Images use Codex App Server image inputs and Claude Code stream-JSON base64 image blocks. UTF-8 files and locally extracted PDF text are additional text blocks on both engines. The app does not execute attached files, auto-fetch URLs, or grant filesystem write permission by attaching them. Codex user-input event logs omit attachment contents. Provider-side conversation history is governed by that provider.

Codex transport follows the official [App Server input protocol](https://learn.chatgpt.com/docs/app-server). PDF text extraction uses the [pdf-extract API](https://docs.rs/pdf-extract/latest/pdf_extract/). A real Codex test with an image, text file, and generated text PDF passed. Claude payload-shape tests pass; successful Claude generation remains unverified until its CLI account is reauthenticated.

## Model and reasoning selection

- The native app discovers models from Codex `model/list` (including pagination) and Claude Code's initialize control response. No hard-coded model list or API key is required. Catalog visibility does not prove a working login or guarantee account access.
- The composer shows the current engine's models and only the effort levels reported for that model. Changing models clears the old effort. **Recommended default** means the catalog's recommended model, not a promise to mirror a custom CLI configuration. Default effort uses the catalog value where provided; otherwise the provider decides.
- Quick task creation and the full task form provide defaults per engine. Task details → **Models & reasoning → Per-step overrides** allows separate choices for every performer, reviewer, and repeated handoff. Linked tasks retain their own defaults unless explicitly overridden in the parent plan.
- In the visual builder, select a connected agent/domain/prompt block to customize the models for its execution steps. The same settings are visible in task details. Unexecutable blueprints still block execution.
- Choices persist in chat/task metadata and are copied into immutable run/schedule snapshots. Existing runs never change when preferences are edited. Pause and re-enable an existing schedule to apply new choices.
- Before executing a step, the backend refreshes the catalog and validates its choice. Removed models or unsupported efforts fail visibly rather than switching to another model. Run activity records the requested model/effort. Provider-side account or organization policies can still reject or limit a request.
- Codex receives `model` and `effort` in `turn/start`, including resumed chats. Claude receives explicit `--model`/`--effort` arguments; its effort environment override is aligned with an explicit selection.

## Explicitly unsupported

- Per-block MCP, skill, connector, and restriction overrides are still blueprint-only. Including one blocks the whole canvas run. Existing provider-configured capabilities are available to ordinary task sessions, subject to provider permissions; source inventory is not proof of runtime availability.
- Visual flows and Workflow handoffs cannot both drive the same task. Choose one plan. Multiple independent reviewer gates at one joined action are blocked rather than collapsed.
- No separate direct-provider API mode, unattended service, wake-from-sleep scheduler, cross-project linked execution, or bundled provider installation.
- Unsupported provider interactions are declined explicitly, not auto-approved. The current adapter does not implement every Codex experimental request, custom-tool UI, or interactive question type.
- Private model reasoning is not exposed. Progress is provider-published text and events.

## Security and persistence

The native backend spawns known executables directly, without a shell-interpolated prompt. Finder launches resolve common CLI locations and the Codex binary bundled with ChatGPT/Codex. Account credentials remain provider-owned; AgentOS does not copy tokens into its stores.

Chat/reviewer runs are restricted: Codex filesystem sandbox is read-only, action approvals are denied, configured MCP/app connections and web search are disabled for that session; Claude chat/reviewer sessions have tools and MCP disabled. Task runs use Codex's workspace-write sandbox and user approval reviewer, or Claude Code's default permission mode with bidirectional permission requests. These are provider boundaries, not a claim that every read or pre-authorized action requires fresh approval. Trusted CLI configuration matters. Claude hooks are disabled for AgentOS sessions. Network model requests still go to the provider.

Native run history is written under `~/Library/Application Support/com.agentos.desktop/runtime/runs.json` using atomic replacement and user-only permissions. It contains prompts, context, replies, and bounded event logs; it is not encrypted. Runs are limited to 40 plan steps, four concurrent requests, 30 minutes, 1 MB output, and 500 saved events per run. Completed run history is retained. Chat and task metadata remain in the native webview's versioned local storage; the browser's store is separate.

Approvals are keyed to the exact active run/request. A task snapshot is immutable once submitted. Stale decisions are rejected. Closing the app cancels owned worker processes; after an abnormal exit, prior active records become interrupted and are never silently restarted. Schedules must be re-enabled to apply edited plans. Before each scheduled run, reviewed memory and its on/off setting are refreshed; switching memory off excludes it from future dispatches.

## Development and verification

- Native transport/state: `apps/desktop/src-tauri/src/live_runtime.rs`.
- UI client and workflow compiler: `apps/desktop/src/features/engines/live-runtime.ts`.
- Execution views, schedules, notifications: adjacent `LiveExecution.tsx`, `live-schedules.ts`, `live-notifications.tsx`.
- Native commands: `live_engines`, `live_models`, `live_start`, `live_snapshot`, `live_control`, plus the separate manual-terminal lifecycle (`terminal_create`, `terminal_set_cwd`, `terminal_run`, `terminal_snapshot`, `terminal_control`, `terminal_clear`, `terminal_remove`).
- Catalog discovery/validation: `apps/desktop/src-tauri/src/provider_models.rs`. Selectors and task overrides: `ModelPicker.tsx`, `TaskModels.tsx`, and `model-choice.ts` in the engines feature.

Run `pnpm typecheck`, `pnpm test`, and `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib` for offline checks. The live provider test is intentionally ignored by default because it makes account-backed model requests:

```sh
AGENTOS_TEST_ENGINES=codex cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml live_provider_smoke -- --ignored --nocapture
```

Use `AGENTOS_TEST_ENGINES=claude` only after Claude sign-in works. The test verifies an explicitly selected model/effort, actual response, session continuation, and persisted history. No test should silently substitute one provider for another. `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml live_catalog_smoke -- --ignored --nocapture` verifies both installed model catalogs without generating a response.

References: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Claude Code programmatic usage](https://code.claude.com/docs/en/headless), [Anthropic's bidirectional transport](https://github.com/anthropics/claude-agent-sdk-python), [Tauri notifications](https://v2.tauri.app/plugin/notification/).
