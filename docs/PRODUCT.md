# StaffForge Product Definition

> Reference scope: earlier StaffForge core/prototype design. For the current AgentOS company UI and implemented boundaries, start with the [development guide](DEVELOPMENT.md) and [usage guide](USAGE.md).

StaffForge is a local-first AI engineering operating system that turns a user's existing Codex installation into a visible, governed engineering team. Codex remains the execution runtime; StaffForge owns orchestration, specialization, policy, approvals, memory, observability, and presentation.

## Product promise

An engineer can choose a local repository, submit an objective, watch real work move between specialist agents, inspect the evidence behind decisions, and approve meaningful writes without giving StaffForge a second OpenAI credential or duplicating MCP secrets.

## Product principles

1. **Execution is real.** Every visible state is projected from an execution event.
2. **Capabilities over vendors.** Core asks for `warehouse.query`, not Snowflake.
3. **Deterministic safety.** Model intent never bypasses policy or approval.
4. **Local by default.** Repository context, event history, and non-secret configuration stay on the machine.
5. **Extensibility is a product feature.** Agents, skills, tools, workflows, providers, policies, commands, and UI contributions are registrable artifacts.
6. **Evidence over theater.** The interface shows tasks, files, tools, hypotheses, approvals, and results—not fictional personalities.

## V1 jobs

- Diagnose local Codex installation and authentication.
- Select a workspace and discover available capabilities without exposing credentials.
- Submit an engineering objective.
- Execute the incident-investigation vertical slice with Commander, Detective, Historian, Builder, Reviewer, and Reporter.
- Stream normalized events into a Control Room, work board, agent detail, and approval center.
- Run the same core from the desktop application and `staffforge` CLI.
- Load and validate local plugins with explicit permissions.
- Persist sessions, tasks, events, approvals, configuration metadata, and inspectable memory locally.

## Non-goals for the first slice

- A cloud marketplace or remote team service.
- Automatic production writes.
- Copying Codex credentials or MCP configuration into StaffForge.
- Presenting hidden chain-of-thought. StaffForge stores concise decision summaries and observable artifacts only.

## Success signal

The mock runtime smoke path and the Codex diagnostic path both work locally. An objective produces traceable execution, pauses at a deterministic approval gate, resumes after approval, and ends with a reporter artifact. The UI can reconstruct its state from the event log.
