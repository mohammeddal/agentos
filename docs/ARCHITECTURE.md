# Architecture

## Recommendation

StaffForge uses a ports-and-adapters architecture with an event-sourced execution model.

```text
Desktop / CLI / future host
          |
    StaffForgeCore
          |
  +-------+--------+-----------+-------------+
  |                |           |             |
Workflow       Registries    Policy       Projections
Engine         + Plugins     + Approval    + Queries
  |                |           |             |
  +----------------+-----------+-------------+
                   |
             EventBus + Store
                   |
      RuntimeAdapter / ToolProvider / MemoryProvider
                   |
        Codex app-server | Mock | future runtime
```

React is a projection client. It does not orchestrate agents or interpret Codex messages. The CLI invokes the same core commands and subscribes to the same normalized events.

## Package boundaries

- `schemas`: versioned domain definitions and validators.
- `event-bus`: append/subscribe contract and in-process implementation.
- `runtime`: runtime port plus normalized runtime requests.
- `codex-adapter`: all Codex process, JSON-RPC, and event translation assumptions.
- `capability-registry`: maps abstract capabilities to providers.
- `policy-engine`: deterministic risk classification and approval decisions.
- `workflow-engine`: declarative graph execution, parallelism, conditions, retries, waits, and approval gates.
- `plugin-sdk`: manifests, contribution types, loader, and host contract.
- `persistence`: repository interfaces plus memory and SQLite implementations.
- `core`: command facade, built-in definitions, projections, and dependency assembly.
- `ui`: design tokens and reusable presentation components.

## Dependency rule

Packages depend inward on schemas and ports. Implementations depend on abstractions; core never imports Codex protocol types. UI depends on core query/command contracts and normalized schemas only.

## Codex integration decision

The primary rich-client boundary is `codex app-server` over local stdio JSONL/JSON-RPC. It is appropriate for authentication state, threads, turns, approvals, and streaming items. The adapter performs four jobs:

1. launch and health-check the locally installed executable;
2. initialize a versioned protocol session;
3. translate raw notifications into the StaffForge Event Protocol;
4. translate StaffForge approval decisions and interruptions back to Codex requests.

The CLI SDK remains an optional future adapter for batch automation. No API-key fallback exists. If the local executable or ChatGPT login is unavailable, diagnostics explain the problem and mock mode remains available for development.

### Risks and mitigations

- **Protocol drift:** generate bindings from the installed CLI during development, negotiate versions, validate incoming payloads, and contain translation inside `codex-adapter`.
- **MCP discovery variance:** treat tool names as hints; use configurable capability mappings and never parse or copy secret values.
- **Desktop/process boundary:** keep orchestration in a host service callable from Tauri commands; do not execute child processes in the browser context.
- **Plugin trust:** validate manifests, require declared permissions, isolate failures, and defer third-party code execution sandboxing until a defensible host boundary exists.
- **Concurrent writes:** serialize state-changing tools per workspace and require approval according to policy.

## Persistence

Repositories expose append-only events and versioned records. SQLite is the local durable implementation with WAL mode and migrations. UI state is rebuilt from events, allowing recovery after restart and a future remote event store.

The current live Studio also keeps restart-safe request history in `.staffforge/studio-state.json` and curated project memory in `.staffforge/memory/index.json`. Completed agents emit a bounded structured memory envelope that the server removes from the visible answer. The server validates and deduplicates those candidates, sends lower-confidence and historical entries to a review inbox, preserves competing claims as conflicts, and generates categorized Markdown views. Only trusted or explicitly pinned entries are eligible for retrieval by later runs. Retrieved memory is explicitly treated as user-editable, untrusted data rather than instructions.

## Design direction

The chosen visual system is **Quiet Operational Forge**: compact layouts, strong typographic hierarchy, restrained graphite/ivory surfaces, a warm ember accent for live work and approvals, minimal radii, and motion tied to state transitions. It scales from onboarding to dense operational screens without becoming a generic card dashboard.
