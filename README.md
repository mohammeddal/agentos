# AgentOS

A local-first, installable macOS workspace for organizing projects, domains, offices, agents, and task plans.

**Current status:** the installed Mac app runs chats and tasks through local Codex and Claude Code CLIs, using their existing sign-ins. It records real replies, progress, approvals, failures, and cancellations. Opt-in schedules require the app to stay open. Some advanced canvas resource/policy blocks remain non-executable and block a run rather than being ignored. The browser remains a planning preview. See the [live execution guide](docs/LIVE-EXECUTION.md) for exact support and safety boundaries.

## Start here

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [the local app](http://127.0.0.1:4173). Requires Node.js 22+ and pnpm 9.15.2. The development server binds to loopback only.

- **Start** — write a prompt or continue a saved chat.
- **Tasks / Projects** — plan work and keep it organized.
- **Company** — offices, agents, domains, and the office map.
- **Activity** — live runs, approvals, output, and separately labeled rehearsals.
- **Library** — memory and engine capabilities.

Use **Find anything** (Cmd/Ctrl+K) to jump to a page, task, project, agent, office, or domain. Creation controls are contextual; **Create…** holds the other options.

## Native macOS app

```sh
pnpm dev:desktop
pnpm build:mac
```

Requires Rust/Cargo and Xcode Command Line Tools. Bundles are generated in `apps/desktop/src-tauri/target/release/bundle/`. Local builds are unsigned; public distribution needs Apple signing and notarization. Browser and native app data stores are separate.

Install/sign in to **Codex CLI** (`codex login`) or **Claude Code** (`claude auth login`). In AgentOS, Library → Engine capabilities shows setup and notification settings. Pick an engine under Start → Options and send a message. The app does not collect credentials or silently install providers.

## Documentation

- [Usage guide](docs/USAGE.md) — where features live, workflows, keyboard controls, and current limits.
- [Development guide](docs/DEVELOPMENT.md) — source layout, commands, storage, architecture boundaries, and maintenance.
- [Design rules](docs/DESIGN.md) — navigation, density, progressive disclosure, and accessibility contract.
- [Cleanup record](docs/CLEANUP.md) — what moved or was removed, with evidence and recovery instructions.
- [Documentation index](docs/README.md) — current guides and historical core design references.

## Verify changes

```sh
pnpm audit:source
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

The monorepo retains internal `@staffforge/*` package names to avoid an unrelated runtime rename. The default product is AgentOS; legacy Studio, DataGuild, and Workbench routes are documented [separately](docs/ALTERNATE-EXPERIENCES.md).

No separate API key is required when using CLI subscription sign-in. Provider account access, usage limits, network access, and a valid login are required for generation. Models are remote: local-first does not mean offline inference. Local storage is not encrypted; never paste credentials into prompts or memory. Do not delete `.agentos/`, `.staffforge/`, or native app data to clean the repository.
