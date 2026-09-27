# StaffForge

StaffForge is a local-first AI Engineering Operating System. It orchestrates an existing local Codex installation into a visible, policy-governed team without requiring a separate OpenAI API key for normal local use.

## AgentOS desktop base

The default desktop surface is now the AgentOS company workspace. A company contains offices (domains), and each office contains agents. Create and rename offices, choose a domain and color, add or edit agents, move them between offices, and switch between light and dark themes. The company structure and engine preferences persist on this device using versioned local storage. The initial offices are editable starter examples; no engine or external service is connected by this foundation.

The earlier workbench is available with `?workbench`. Existing DataGuild and Studio surfaces remain available with `?data` and `?studio` while runtime wiring is added incrementally.

The company opens in **Start**, a prompt-first composer. Save a local chat draft, or tick **Make this a task**, choose a domain or agent, and create a planned task with human approval and a manual schedule. Optionally choose a project. Cmd/Ctrl+Enter submits; Enter adds a newline. More assignees, schedules, and handoffs remain available in the full task editor. Reopen and continue recent drafts, or convert their latest prompt into a task. No AI responses are fabricated: chats are **Not sent**, and no prompts are dispatched automatically. Composer drafts and chats use device-local browser/app storage, not encrypted secret storage; do not paste credentials.

**Company overview** opens **Office map**: a top-down floor plan generated from the saved offices and agents. Select a desk or roster entry to inspect an agent, switch to **Office cards**, zoom the map, or create an office from the expansion area. Rooms grow to accommodate their team. **Preview activity** shows sample working/idle states; turn it off to see the actual disconnected state. Preview changes stay separate from the saved company and do not execute tasks.

Use **New domain**, **New office**, and **New agent** at the top of the workspace to expand the company. Custom domains appear in the Domains directory and office domain selectors. A domain can contain several offices; each agent belongs to an office. Custom domains are stored alongside the company, and existing saved workspaces remain compatible.

Use **New task** to assign a plan to one or more domains, or hand-pick agents across offices. Reopen saved plans from **Tasks**. The editor has three sections:

- **Task & team:** the outcome, brief, and starting team. Domain assignments follow current membership; direct assignments follow agent IDs.
- **Schedule:** manual or a five-field numeric cron expression, an IANA time zone, presets, validation, and the next three planned occurrences. Preview calculation uses [cron-parser](https://github.com/harrisiirak/cron-parser), including time-zone/DST handling. Restricted day-of-month and weekday fields use OR semantics. Mac sleep, missed runs, and overlap policies are not implemented.
- **Workflow:** select a source node, then add an agent or saved-task handoff. Select an earlier source in **After** to branch. Conditions include success, failure, completion, explicit approval after success, and a successful output field comparison. Each step receives its source's output. Agent steps require an instruction. Linked tasks use their own assignment and workflow; their separate cron schedule is not triggered by the handoff. Cycles are rejected, and dependent steps must be removed before their parent.

**Test flow** evaluates editable sample outcomes and JSON output, never live agents. Numeric comparisons require numeric JSON values; missing fields skip the branch. Approval waits propagate to downstream steps. Linked tasks are simulated as one node, not expanded recursively. All schedules and handoffs persist locally as **draft plans**: there is no active scheduler, execution dispatcher, or real approval delivery connected to this company surface yet.

### Visual task blueprints

Open a saved task and choose **Visual builder**. Drag or click blocks for agents, domains, MCPs, context, skills, connectors, approval checkpoints, restrictions, and custom prompts. Drag a block header to reposition it; drag an output dot to an input dot (or click each port) to connect. The From/To selectors and Connections list provide keyboard alternatives; focused blocks also move with arrow keys. Flow edges support success, failure, always, and approved conditions. Resources and restrictions attach outward to the work they apply to.

Select a block to edit its prompt, agent/domain reference, reviewer, or requested policy. MCP/skill/connector discovery reads the existing local inventory on request; selecting an entry records a reference only, including disabled or cached entries, and never installs or enables it. Context is manually supplied text or source notes, not automatic file loading. Keep secrets out of these unencrypted local drafts.

Canvas changes auto-save with the task, survive edits and reloads, and support 50-step undo/redo during the editor session. The builder rejects loops, duplicate edges, missing endpoints and invalid resource directions. Incomplete references remain editable with configuration warnings. Limits: 80 blocks, 160 connections, 6,000 characters per prompt.

**Blueprints are independent design drafts.** They do not replace existing task assignments, handoffs, schedules, or approvals, and are not consumed by the rehearsal engine or live runtime. Approval and restriction blocks express intent; they do not enforce permissions. Runtime compilation, conditional output expressions, file-context resolution, and policy enforcement remain future work.

### Company projects and directories

Use **New project** or **Projects** to organize multiple projects at company level. A project can include whole domains and hand-picked agents together; teams can participate in several projects. The explorer groups work as **company → project → domain → agent**, plus a shared folder per project. Search projects by name, brief, domain, office, agent, or linked task. Agent inspectors and domain cards link back to their projects.

Tasks have an optional **Company project** association; existing company-wide tasks remain unchanged. Task assignees also appear in the associated project's tree, even if they were not selected in the project's base team. Creating a task from an agent or domain workspace preselects that assignee and project. Domain membership follows current offices; direct agent membership follows stable IDs. These are planned assignments, not proof of live work.

**Create project folders** explicitly creates real empty directories. **Open in Finder**, **Copy path**, and **Refresh project folders** use the selected project, shared, domain, or agent directory. Status is verified on disk; saving a project alone does not create folders. Directory operations only add missing directories and never overwrite, move, or delete files. Paths are limited to the app-managed project root and symlinked children are rejected.

- Browser development preview: `.agentos/projects/project-<id>/` in this repository.
- Native macOS app: `~/Library/Application Support/com.agentos.desktop/projects/project-<id>/`.
- Within each project: `shared/` and `domains/<domain-key>/agents/<agent-key>/`.

Stable project IDs and hashed domain/agent keys avoid name collisions and unsafe paths. Project and agent renames retain paths. Moving an agent to a different domain creates a new branch only on request; the old branch and its files remain untouched. Project metadata and task associations use the existing device-local company store, separately in browser and native app. Folders are not yet bound to live engine working directories, and the explorer organizes assignments rather than listing arbitrary files; use Finder for file browsing. These project workspaces do not replace the older Studio's project memory or runtime.

### Action approvals and activity

Tasks and individual handoffs can require **My approval** or **Reviewer agent approval** before starting. New tasks default to human approval; existing task plans keep their previous behavior. A reviewer cannot be one of the agents performing the action. Additional gates never override a linked task's own gate or the legacy **After approval** condition. These are task/step gates, not yet a tool-call security boundary.

**Activity & approvals** separates two surfaces:

- **Live status** reports the current disconnected integration state, planned tasks, and configured restrictions. It does not claim that disconnected agents are idle or running. The office map now defaults to disconnected status too; sample activity remains opt-in.
- **Approval rehearsal** runs a deterministic, local-only simulation from a frozen plan snapshot. Review queues separate human and designated-agent gates. Decisions apply to one action in one rehearsal; all applicable gates must pass. Rejection requires a reason and skips dependent steps. Canceling closes pending requests. Manual sample outcomes advance branches; a decision history and run state persist under `agentos:rehearsals:v1`. Agent decisions are explicitly simulated by the user, not produced by a real reviewer engine. Linked tasks are opaque simulated actions and retain their own start gate; their internal workflows are not expanded.

Live enforcement must be connected to a trusted execution dispatcher, verified reviewer identities, and action-scoped approval records before any engine or external tool is allowed to run. Local browser state and rehearsal decisions are not authorization for real execution.

### Agent logs and run output

Opening a task from Tasks, Projects, or Start now opens its detail workspace rather than the editor. **Steps** shows the saved plan, actual handoff prerequisites, conditions, and configured approvals; all remain labeled Planned. **Edit task** opens the full editor. Opening a chat in Start shows its timestamped local-prompt **Timeline** and links to its associated task.

Both detail views include **Progress updates**, **Output**, and **Rehearsals**. Progress explanations are reserved for engine-published status messages; private internal reasoning is not displayed. Until an engine is connected, progress and live output show explicit empty states, never fabricated thinking or tool calls. Rehearsals are matched by exact task ID (or a chat's explicitly linked task), keep their frozen plan snapshots, and expose the existing logs, sample outputs, per-action status, and approval history. Refresh history or refocus the window to read new saved records. Editing a plan does not rewrite earlier runs.

Select an agent card to open its activity inspector, or select a desk on the office map and choose **Logs & output**. **Activity & approvals** also opens agent inspectors from Team status, and every rehearsal has **Logs & output** and per-action **Inspect action** controls.

The shared run inspector provides **Overview**, timestamped/searchable **Logs** with event-level filters, **Output** (including failed sample results), and **Approvals** with reviewer identities, decisions, and notes. Select one action or the entire available scope. Copy or download that inspection scope as JSON; exports are explicitly labeled as rehearsals. Outputs render as plain text, never executable HTML, and no-output states remain distinct from successful completion. Review exports for sensitive data before sharing.

New rehearsals freeze performer IDs as well as names, and events carry action IDs and levels. Agent history matches stable performer/reviewer IDs, not names; renames, office moves, and duplicate names do not reassign old work. Older records remain readable in Activity, but missing performer IDs are not guessed. Legacy events without action IDs remain visible in the full run view rather than being attributed to an action. Agent history is read-only and can be refreshed from local storage; an open Activity inspector follows updates to its rehearsal.

This company surface still has no live engine session attached. Rehearsal logs are recorded state changes, not terminal stdout/stderr, model reasoning, or live tool logs; outputs are user-supplied samples. The earlier Studio execution ledger is separate and is not automatically associated with company agents.

### Engine library

Open **Engine library** to inspect existing local **Codex** and **Claude Code** capabilities. Filter by MCP servers, skills, agents, connectors, or plugins; search by name/description/source; filter by scope; and open a record to inspect its source path. Refresh after editing configuration in the engine. The browser defaults to this repository; the native app starts with personal sources. Enter an absolute workspace folder to include project records. Gemini explicitly reports that discovery is not implemented.

Discovery is read-only and does not start engine processes, MCP servers, or hooks. It reads bounded metadata files, not credential stores, and does not return commands, arguments, environment variables, server URLs, headers, or instruction bodies. There is no installation, enablement, permission change, or automatic assignment to company agents. Source records are deliberately not merged into a claimed effective runtime configuration.

- **Codex:** personal/project `config.toml` (MCP, app, agent, and plugin declarations), `.codex/agents/*.toml`, `.codex/skills`, `.agents/skills`, and conventional metadata in versioned plugin-cache directories. Plugin `.app.json` declarations appear as connectors. `CODEX_HOME` is respected.
- **Claude Code:** personal/project `.claude/skills`, `.claude/agents/*.md`, user and current-project MCP records in `~/.claude.json`, project `.mcp.json`, plugin settings, and installed-plugin registry records. Plugin paths outside the local plugin directory are not followed. `CLAUDE_CONFIG_DIR` is respected for the configuration directory.
- **Coverage:** source checks distinguish missing, read, and unreadable/invalid/limited records. Cache presence does not establish installation; configured/enabled source values do not establish authentication, effective permission, or health. Cloud account connectors, built-in/session agents, remote hosts, managed policies, inherited parent configuration, custom manifest paths, and command-line overrides are not resolved. Explicitly linked skill folders are resolved and their metadata source is shown; symlinked metadata files and other directory symlinks are not followed. Scan limits are 1 MB per metadata file, 500 entries per directory, 700 directories, and 1,500 file reads.

Discovery follows the documented formats for [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference), [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Claude Code MCP](https://code.claude.com/docs/en/mcp), and [Claude Code subagents](https://code.claude.com/docs/en/sub-agents). Full connected-account discovery requires a separate engine-session adapter; this inventory does not claim to provide it.

### Company memory

Open **Memory** to save facts, lessons, known issues, and decisions with a source and company, domain, or agent scope. Entries start as drafts. **Reviewed by me** requires evidence; reviewed lessons also require a prevention step. Review records a human judgment, not an automated truth guarantee. Archive outdated entries instead of deleting their history.

**Context preview** includes only reviewed records in the selected scope (plus company-wide memory, and an agent's current domain). Conflicting statements with the same title, kind, and scope are excluded until resolved; this is not comprehensive semantic conflict detection. **Memory off** preserves the files and permits manual editing, but disables context preview and issue capture. **Learn from issues** lets you explicitly capture failed or rejected rehearsal actions as unverified drafts; rehearsal observations cannot be promoted to reviewed memory. Live failure extraction and agent context injection are not connected to this company surface yet.

The library, sources, prevention steps, and on/off setting persist in an actual Markdown file:

- Browser development preview: `.agentos/memory/company-memory.md` in this repository (ignored by Git).
- Native macOS app: `~/Library/Application Support/com.agentos.desktop/memory/company-memory.md`.

Browser and native app stores are separate. The app displays its exact active path and offers **Download .md** and **View saved Markdown**. Each save keeps the previous revision as `company-memory.previous.md`, uses atomic replacement, and rejects stale writes. Edit through the app: the Markdown contains structured metadata, and external edits are detected and left untouched rather than overwritten. This local store is not encrypted; do not save credentials. It is independent of the earlier Studio project-memory system described below.

Run the browser preview:

```bash
pnpm dev
```

Run the native macOS window:

```bash
pnpm dev:desktop
```

Build installable macOS `.app` and `.dmg` bundles:

```bash
pnpm build:mac
```

Unsigned local builds can be opened on the same Mac. Public distribution requires Apple code signing and notarization.

## Run the local studio

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173`.

The web studio connects to the signed-in local `codex app-server`; it does not use mock answers. Choose a workspace, leave **Run with** on Auto or select a named agent, optionally attach skills, and send the request. The assigned agent, routing reason, live activity, answer, and any approval request stay on the same screen.

Click any studio character or roster entry to inspect that agent. Its panel shows the task it is working on now, its current action, and its completed or stopped requests from the current local-server session. Click a work item to open the full answer and activity log.

The exact question “What files do I have on my Desktop?” is handled directly by the local filesystem so it returns immediately without an approval. Other requests use Codex in read-only mode by default and surface any requested write or elevated permission inline.

## Add agents and skills

Use **Manage** in the request composer to create a project agent or skill. StaffForge writes the standard Codex formats:

- Project agents: `.codex/agents/<name>.toml`
- Project skills: `.codex/skills/<name>/SKILL.md`

It also discovers personal agents in `~/.codex/agents/*.toml` and personal skills in `~/.codex/skills/*/SKILL.md`. Press **Refresh** in the skill picker after changing a file outside the app.

A custom agent requires `name`, `description`, and `developer_instructions`:

```toml
name = "design_reviewer"
description = "Reviews product UI for hierarchy, accessibility, and polish."
developer_instructions = "Inspect the implementation and lead with concrete findings."
```

A skill requires YAML front matter followed by its workflow instructions:

```md
---
name: release-notes
description: Create concise release notes from verified project changes.
---

Read the change history, group changes by user impact, and do not invent changes.
```

When Auto is selected, StaffForge compares the request with custom-agent names and descriptions first, then falls back to one of its visible specialist roles. It records the routing reason on the request. Selecting an agent bypasses Auto. Selected skills are passed explicitly to Codex, which reads each `SKILL.md` before acting.

## Project memory

Completed requests propose only durable facts, decisions, preferences, lessons, and artifacts for local project memory. High-confidence structured entries can become trusted immediately; lower-confidence and historical entries enter **Needs review**. The full command and message history remains in the request activity ledger and is not copied into memory.

Open **Project memory** in the sidebar to review proposed entries, search, edit, pin, resolve conflicts, inspect provenance, or delete an entry. Only trusted or explicitly pinned entries are supplied to later agents. They remain untrusted reference data and should be reverified when the workspace may have changed.

The structured source and human-readable views are stored locally:

```text
.staffforge/memory/
├── index.json
├── workspace-facts.md
├── decisions.md
├── preferences.md
├── lessons.md
└── artifacts.md
```

Markdown files are generated views of `index.json`; edit memories through the app so changes are preserved.

## CLI prototype

```bash
pnpm staffforge doctor
pnpm staffforge investigate "Investigate why revenue dropped" --approve
```

The CLI remains the earlier workflow-engine prototype; use the web studio for the live Codex agent-and-skill experience.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
```

The architecture, event protocol, plugin contract, security model, and roadmap are documented in [`docs/`](./docs/).
