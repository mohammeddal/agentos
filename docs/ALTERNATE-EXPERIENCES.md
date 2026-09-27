# Alternate experiences and CLI

These routes are retained compatibility experiences, not the default AgentOS company UI. Their state and execution boundaries are separate.

## Run the local studio

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173/?studio`. DataGuild is at `?data`; the workbench is at `?workbench`.

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

The architecture, event protocol, plugin contract, security model, and roadmap are documented in [documentation index](./README.md).
