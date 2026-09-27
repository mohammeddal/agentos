# Roadmap

> Reference scope: earlier StaffForge core/prototype design. For the current AgentOS company UI and implemented boundaries, start with the [development guide](DEVELOPMENT.md) and [usage guide](USAGE.md).

## Phase 0 — architecture and contracts

- Product, architecture, event, plugin, and security contracts.
- Versioned schemas and package boundaries.
- Design tokens and Quiet Operational Forge direction.

## Phase 1 — working vertical slice

- Mock runtime and Codex diagnostics.
- Shared core used by desktop UI and CLI.
- Incident-investigation workflow with parallel Detective/Historian steps.
- Deterministic local-write approval and resume.
- Control Room, timeline, work board, agent inspection, approval center.
- Unit and smoke tests.

## Phase 2 — durable local desktop

- Tauri host commands and SQLite repositories with migrations.
- Codex app-server thread/turn execution and full event normalization.
- Restart recovery, cancellation, interruption, and approval forwarding.
- Onboarding, settings, diagnostics, and local plugin management.

## Phase 3 — ecosystem quality

- Plugin developer kit, generators, fixtures, compatibility checks, and examples.
- Capability mapping editor and additional tool providers.
- Memory quality evaluation, expiration policies, and bulk review tools.
- Workflow visualizer and evaluation suite.

## Phase 4 — optional team mode

- Remote persistence and policy providers behind existing ports.
- Organization configuration and private registries.
- Signed plugin distribution and sandboxed executable contributions.

## Vertical-slice acceptance criteria

1. Desktop starts without an API key and reports local Codex status.
2. User submits “Investigate why revenue dropped.”
3. Commander creates traceable work; Detective and Historian run concurrently.
4. Mock tools produce evidence events and Builder proposes a local change.
5. Policy blocks execution and emits an approval request.
6. User can inspect and approve; workflow resumes through Reviewer and Reporter.
7. Timeline, agent states, board, and final artifact are event-derived.
8. CLI can run the same scenario and print the same event protocol.
