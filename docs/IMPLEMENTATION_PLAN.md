# Implementation Plan

> Reference scope: earlier StaffForge core/prototype design. For the current AgentOS company UI and implemented boundaries, start with the [development guide](DEVELOPMENT.md) and [usage guide](USAGE.md).

1. Establish workspace tooling, package graph, schemas, and test harness.
2. Implement normalized event bus and event-derived session projection.
3. Implement capability registry, policy engine, and approval service.
4. Implement declarative workflow engine and mock runtime.
5. Assemble the first incident-investigation workflow in `StaffForgeCore`.
6. Build CLI commands over core and diagnostic services.
7. Build the React/Tauri presentation with shared UI primitives.
8. Implement Codex app-server diagnostics and protocol client boundary.
9. Add persistence repositories and SQLite migration infrastructure.
10. Validate schemas, policy, workflow pause/resume, plugin isolation, CLI, UI build, and browser smoke flow.
