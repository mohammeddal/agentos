# AgentOS usage guide

**Native execution update:** the installed Mac app now connects chats and supported task flows to Codex and Claude Code. See [Live execution](LIVE-EXECUTION.md) for current behavior, setup, safety, scheduling, and limits. Draft-only descriptions below document the earlier planning/browser surface and do not describe the new native runtime.

The default desktop surface is the AgentOS company workspace. A company contains offices (domains), and each office contains agents. Create and rename offices, choose a domain and color, add or edit agents, move them between offices, and switch between light and dark themes. The company structure and engine preferences persist on this device using versioned local storage. The initial offices are editable starter examples.

The five primary destinations are **Start**, **Tasks**, **Company**, **Activity**, and **Library**. The sidebar is always present on desktop and available in the mobile navigation drawer. It lists expandable project directories with their chats and tasks, followed by unassigned chats and tasks. Company contains Office map, Offices, Agents, and Domains. Library contains Memory and Capabilities. Page URLs use hashes so reload and browser Back/Forward retain your destination.

AgentOS uses a **Codex-inspired shell**: compact navigation, quiet graphite surfaces, restrained borders, and a focused composer in both light and dark appearances. Color is deliberately reserved for AgentOS meaning—office identity, agent status, approvals, warnings, and the interactive company map—so the product stays familiar without hiding its own operational model. The map, workflow canvas, and company structure remain AgentOS-specific surfaces rather than visual copies of another product.

## Local terminal

Select the terminal icon in the top-right toolbar, or press **Cmd/Ctrl+J**, to open the bottom terminal dock from any workspace view. The terminal is available only in the installed Mac app; browser preview shows the layout but cannot execute commands or read local folders.

- Each terminal has an explicit working-directory field. Enter an absolute path, `~`, a path beginning with `~/`, or use a standalone `cd` command. Paths are canonicalized and must point to an accessible folder.
- Enter runs the command; Shift+Enter adds another line. Up/Down recalls commands from the current UI session. **Stop** terminates the launched process group, **Clear** clears the visible transcript, and **+** opens another terminal.
- Commands run through the user's local shell one at a time with visible stdout, stderr, status, and exit code. Interactive prompts and full-screen terminal programs are not supported in this first version because command stdin is closed.
- Terminal commands are direct user actions, not model-generated tool calls. They do not pass through agent approval gates. Review a command before submitting it, especially commands copied from a chat.
- Terminal sessions and command history are memory-only and disappear when AgentOS closes. Output is escaped for display and limited to 1 MB per session; up to eight terminal sessions and four concurrently running commands are allowed.

The company opens in **Start**, a clean chat surface with the composer fixed at the bottom. The project/chat/task directory remains in the sidebar so you can move between work without leaving the composer. Use the paperclip to attach context, the settings control beside it to choose engine/model/effort or switch the prompt into a planned task, and the arrow to send. **Enter** sends and **Shift+Enter** adds a line. Sending a chat in the native app opens its own conversation. Browser preview does not execute providers. Conversation pages show prompts and assistant replies; **View activity & logs** opens their filtered execution history in Activity. Clicking Start returns to the new-work composer, not the last conversation. Composer drafts are preserved separately for each conversation and new-project context. Do not paste credentials into local unencrypted drafts/history.

## Attach images and files

Use **Attach files**, drop files onto the prompt area, or paste an image from the clipboard. Add a prompt describing what you want the engine to do. Click an attachment to preview it, or its × button to remove it before sending. The task editor has the same attachment controls.

- Supported: PNG, JPEG, WebP, GIF, PDFs with selectable text, and UTF-8 text/code (for example Markdown, CSV, JSON, or source files).
- Limits: 8 files, 5 MB per file, 20 MB combined. Documents support up to 100 KB of extracted text each and 200 KB combined. Unsupported Office, archive, audio, video, and HEIC files should first be exported to PDF, text, or a supported image format.
- PDFs are **text-only** inputs: layout, embedded figures, and scanned pages are not sent as images. For visual interpretation, attach page screenshots. Encrypted/damaged PDFs or PDFs without extractable text fail explicitly.
- Files are copied into AgentOS's local attachment store. Drafts, saved messages, and tasks keep references; editing/moving the original does not change the copy. Removing a chip detaches it from that draft, not from historical messages or your filesystem. Copies are retained; automatic cleanup is not implemented.
- Sending a chat shares its current attachments with the selected provider. A normal task shares task attachments with its executing agents and reviewers, including linked workflow steps. In a visual workflow, adding files to Context blocks scopes them to the connected work step; a reviewer receives the same files as the step it reviews. Attachments remain attached when converting the latest chat prompt into a task. Normal approvals still apply.
- The browser preview uses separate IndexedDB storage for images/text and cannot execute native engines. PDF extraction and provider execution require the Mac app.

## Sidebar directory

- **Projects** expand to show their chats and tasks. Company-wide work appears under **Chats & tasks**. Use the directory search or Find anything to locate work.
- Select the **+** beside Projects to create a project without leaving the current page. The directory’s **three-dot menu** also creates a project, chat, or task and opens **Archived items** and **Removed items**. A project’s menu creates work already scoped to that project. Empty projects show **+ Chat** and **+ Task** shortcuts; chat/task menus offer new work of the same type, archive, and removal.
- **Archive** hides a record from active lists. Archiving a project hides its children without changing their individual state. Restore from Archived items; independently archived children remain archived.
- **Remove** is recoverable, not permanent deletion. Confirm inside the app, then restore from Removed items if needed. Project files, conversation content, task definitions, and Activity run history are retained.
- Active runs must be stopped or completed before archive/removal. Affected schedules—including schedules with linked task dependencies—are paused. Restoring never automatically re-enables them.
- On compact windows, **Open navigation** opens the same directory in a keyboard-accessible drawer.

The remaining guide covers the shared browser/native interface. Consult [Live execution](LIVE-EXECUTION.md) for the exact runtime matrix and safety boundaries.

**Company → Office map** opens the floor plan: a top-down floor plan generated from the saved offices and agents. Select a desk or roster entry to inspect an agent, switch to **Offices**, or zoom the map. Rooms grow to accommodate their team. **Preview activity** shows sample working/idle states; turn it off to see the actual disconnected state. Preview changes stay separate from the saved company and do not execute tasks.

Creation stays in predictable context. The persistent sidebar owns projects, chats, and tasks; Tasks, Offices, Agents, and Domains expose their relevant page-level **New…** action. The Office map uses one **Create…** menu for an office, domain, or agent. Cards keep only contextual actions, such as adding an agent to a particular office or creating an office inside a particular domain. Custom domains appear in the Domains directory and office domain selectors. A domain can contain several offices; each agent belongs to an office. Custom domains are stored alongside the company, and existing saved workspaces remain compatible.

Small **?** controls reveal secondary guidance on hover, keyboard focus, or tap. Page purpose, local-storage/privacy notes, agent skill behavior, and project-folder rules live there instead of being repeated on every screen. Execution state, validation, approvals, destructive consequences, connection limits, and storage failures remain visible because they can change a decision.

When creating or configuring an agent, **Custom agent prompt** records that specialist's working method, standards, tone, and boundaries. **Existing skills** searches the read-only local inventory for the selected Codex or Claude Code engine. Select up to 24 discovered, currently available skills; cached or disabled records remain visible but cannot be selected. Changing the agent's engine clears provider-specific skill choices instead of silently carrying incompatible references forward. The prompt is limited to 6,000 characters.

The saved prompt and skill references appear in the agent's Activity inspector. During a native task or reviewer step, AgentOS includes the prompt and requests each selected skill by its exact discovered name. This follows the provider's normal skill activation behavior; AgentOS does not copy, install, enable, or promise that a skill will load. The engine verifies availability at runtime and is instructed to disclose a missing skill rather than pretend it was used. Prompts and skill references are local configuration, not a security boundary; task approvals and restrictions remain separate.

In the browser preview, discovery includes this repository and personal sources. The installed Mac app starts with personal sources; use **Library → Capabilities → Settings** with a workspace path to inspect project-scoped records. Skill metadata is saved with the agent, while instruction bodies and credentials are not copied into company storage.

To permanently delete company structure:

- **Agent:** open the agent, then choose **Delete agent**; the same action is available while configuring it.
- **Office:** open the office's edit action, then choose **Delete office**. Its agents are included in the confirmation.
- **Domain:** open **Company → Domains** and use the domain's action button. Deleting a domain also deletes its offices and agents. A deleted starter domain can be added again with **New domain**.

The confirmation shows the number of affected offices, agents, and project memberships. Deletion is blocked while affected agents have live work, or while any saved task uses the domain/agents as an owner, reviewer, handoff, or canvas block. Reassign those tasks first; archived or removed tasks must be restored before editing. Project memberships are cleaned automatically. Company structure deletion is permanent, but historical Activity, memory records, attachment copies, and project files remain on disk.

Use **New task** to assign a plan to one or more domains, or hand-pick agents across offices. Reopen saved plans from **Tasks**. The editor has three sections:

- **Task & team:** the outcome, brief, and starting team. Domain assignments follow current membership; direct assignments follow agent IDs.
- **Schedule:** manual or a five-field numeric cron expression, an IANA time zone, presets, validation, and the next three planned occurrences. Preview calculation uses [cron-parser](https://github.com/harrisiirak/cron-parser), including time-zone/DST handling. Restricted day-of-month and weekday fields use OR semantics. Mac sleep, missed runs, and overlap policies are not implemented.
- **Workflow map:** build the chain visually before or after saving the task. Select a work step to attach the context, files, MCPs, skills, connectors, model/effort, and approval path needed by that step. The task-level assignment remains the fallback team.

Older saved tasks that use the compact handoff editor remain editable. The editor offers an explicit **Use visual canvas** migration action; it changes only the unsaved edit draft until **Save task** is selected. A task never executes both a visual map and legacy handoffs.

### Visual task workflows

Select **Workflow map** directly in **New task** or **Edit task**; saving an overview first is not required. A saved task also switches between **Overview** and **Workflow map** at the top of its task workspace. Overview keeps execution, models, compiled steps, progress, output, and rehearsals together. The map's block count stays visible on both switches.

Drag or click blocks for offices, domains, agents, MCPs, context, skills, connectors, approval checkpoints, restrictions, and custom prompts. An Office block selects one real office, shows its domain and current agent count, and expands to that office's agents during execution. Empty or deleted offices remain visibly invalid instead of silently running another team. Drag a block header to reposition it; drag an output dot to an input dot (or click each port) to connect. Expand **Connect using selectors** for From/To controls. The selectors and Connections list provide keyboard alternatives; focused blocks also move with arrow keys. Flow edges support success, failure, always, and approved conditions. Resources and restrictions attach outward to the work they apply to.

The palette groups blocks into Work, Resources, and Control; expand Resources for context, MCPs, skills, and connectors. **Fit view** brings the whole plan into view. Selecting a task, office, domain, agent, or prompt block reveals **Inputs & capabilities**: one-click additions create and connect the chosen resource to that exact step. **Approval next** creates the following review checkpoint. The normal canvas ports remain available for branches and less common layouts.

A Context block accepts source notes, a source label/path, and any subset of the files already attached under **Task & team**. If at least one canvas context block scopes files, only its selected files are sent to its target step; a context attached to the root applies to all resulting work. Context edges are reference data, not permission. Keep credentials out of these unencrypted drafts.

MCP/skill/connector discovery reads the existing local inventory on request and never installs, enables, authenticates, or starts a capability. A discovered non-disabled capability can be attached only to a step using the same provider. The compiler adds an explicit required-capability instruction and tells the provider to stop with `capability_unavailable` instead of pretending if it is missing or unauthenticated. Manual references, disabled records, provider mismatches, and capabilities with no work step block live execution.

Canvas edits remain in the task editor until **Create task** or **Save task**. Saved maps survive reloads and support 50-step undo/redo during the current editor session. The builder rejects loops, duplicate edges, missing endpoints, attachments to approval blocks, and invalid resource directions. Incomplete references remain editable with configuration warnings. Limits: 80 blocks, 160 connections, 6,000 characters per prompt, and 40 compiled execution steps.

Visual agent, office, domain, prompt, context, file, condition, and approval blocks compile into the native execution plan. Task assignment supplies the fallback team, the saved schedule still controls when the plan starts, and provider tool calls still use the native approval boundary. Restriction blocks remain design-only because AgentOS cannot yet enforce their requested policy; including one blocks the run rather than silently weakening it.

### Company projects and directories

Use the sidebar’s Projects **+** or three-dot menu to create a company-level project. Expand a project in place to find its chats and tasks, or use that project’s menu to add already-scoped work. Select the project name to open its detail workspace. That workspace stays focused on the selected project’s **shared → domain → agent** structure instead of repeating the full project list. A project can include whole domains and hand-picked agents together; teams can participate in several projects. Agent inspectors and domain cards link back to their projects.

Tasks have an optional **Company project** association; existing company-wide tasks remain unchanged. Task assignees also appear in the associated project's tree, even if they were not selected in the project's base team. Creating a task from an agent or domain workspace preselects that assignee and project. Domain membership follows current offices; direct agent membership follows stable IDs. These are planned assignments, not proof of live work.

**Create project folders** explicitly creates real empty directories. **Open in Finder**, **Copy path**, and **Refresh project folders** use the selected project, shared, domain, or agent directory. Status is verified on disk; saving a project alone does not create folders. Directory operations only add missing directories and never overwrite, move, or delete files. Paths are limited to the app-managed project root and symlinked children are rejected.

- Browser development preview: `.agentos/projects/project-<id>/` in this repository.
- Native macOS app: `~/Library/Application Support/com.agentos.desktop/projects/project-<id>/`.
- Within each project: `shared/` and `domains/<domain-key>/agents/<agent-key>/`.

Stable project IDs and hashed domain/agent keys avoid name collisions and unsafe paths. Project and agent renames retain paths. Moving an agent to a different domain creates a new branch only on request; the old branch and its files remain untouched. Project metadata and task associations use the existing device-local company store, separately in browser and native app. Folders are not yet bound to live engine working directories, and the explorer organizes assignments rather than listing arbitrary files; use Finder for file browsing. These project workspaces do not replace the older Studio's project memory or runtime.

### Action approvals and activity

Tasks and individual handoffs can require **My approval** or **Reviewer agent approval** before starting. New tasks default to human approval; existing task plans keep their previous behavior. A reviewer cannot be one of the agents performing the action. Additional gates never override a linked task's own gate or the legacy **After approval** condition. These are task/step gates, not yet a tool-call security boundary.

**Activity** separates two surfaces:

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

Open **Library → Capabilities** to inspect existing local **Codex** and **Claude Code** capabilities. Filter by MCP servers, skills, agents, connectors, or plugins; search by name/description/source; filter by scope; and open a record to inspect its source path. Open **Settings** for engine connection checks, an optional workspace folder, notifications, discovery limits, and raw source paths. Refresh after editing configuration in the engine. The browser defaults to this repository; the native app starts with personal sources. Gemini is visibly unavailable until its adapter is implemented.

Discovery is read-only and does not start engine processes, MCP servers, or hooks. It reads bounded metadata files, not credential stores, and does not return commands, arguments, environment variables, server URLs, headers, or instruction bodies. There is no installation, enablement, permission change, or automatic assignment to company agents. Source records are deliberately not merged into a claimed effective runtime configuration.

- **Codex:** personal/project `config.toml` (MCP, app, agent, and plugin declarations), `.codex/agents/*.toml`, `.codex/skills`, `.agents/skills`, and conventional metadata in versioned plugin-cache directories. Plugin `.app.json` declarations appear as connectors. `CODEX_HOME` is respected.
- **Claude Code:** personal/project `.claude/skills`, `.claude/agents/*.md`, user and current-project MCP records in `~/.claude.json`, project `.mcp.json`, plugin settings, and installed-plugin registry records. Plugin paths outside the local plugin directory are not followed. `CLAUDE_CONFIG_DIR` is respected for the configuration directory.
- **Coverage:** source checks distinguish missing, read, and unreadable/invalid/limited records. Cache presence does not establish installation; configured/enabled source values do not establish authentication, effective permission, or health. Cloud account connectors, built-in/session agents, remote hosts, managed policies, inherited parent configuration, custom manifest paths, and command-line overrides are not resolved. Explicitly linked skill folders are resolved and their metadata source is shown; symlinked metadata files and other directory symlinks are not followed. Scan limits are 1 MB per metadata file, 500 entries per directory, 700 directories, and 1,500 file reads.

Discovery follows the documented formats for [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference), [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Claude Code MCP](https://code.claude.com/docs/en/mcp), and [Claude Code subagents](https://code.claude.com/docs/en/sub-agents). Full connected-account discovery requires a separate engine-session adapter; this inventory does not claim to provide it.

### Company memory

Open **Library → Memory** to save facts, lessons, known issues, and decisions with a source and company, domain, or agent scope. Entries start as drafts. **Reviewed by me** requires evidence; reviewed lessons also require a prevention step. Review records a human judgment, not an automated truth guarantee. Archive outdated entries instead of deleting their history.

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

## Find anything

Press **Cmd/Ctrl+K**, click Find anything in the sidebar, or use the search icon in the top bar. Search saved task titles/briefs, project names/briefs, agent names/roles/engines, offices, domains, and pages. Use Up/Down and Enter to open a result; Escape closes the dialog. Results are capped at 40; refine the query for larger companies. This does not index file contents, secrets, chat messages, memory Markdown, or external capability inventories. Use the dedicated search inside Chats, Memory, or Capabilities for those records.

Open forms and task details retain their modal focus; Cmd/Ctrl+K does not replace an open editor. Close it first. Mouse, keyboard and narrow-screen navigation all expose the same destinations.
