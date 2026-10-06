# Development guide

## Product and integration boundaries

AgentOS is the default desktop UI. `@staffforge/*` names identify the earlier internal packages; they are not a second copy of the company app. The installed company UI is a local runtime client; browser preview is planning-only. Never turn stored plans, UI status, discovered capability metadata, or simulated approvals into permission to execute an action. Native runs must keep provider sandboxes, action-scoped approvals, immutable request snapshots, and fail-closed compilation boundaries intact.

The browser entry point is `apps/desktop/src/main.tsx`. It lazily loads exactly one experience:

| URL           | Source                                    | Status                         |
| ------------- | ----------------------------------------- | ------------------------------ |
| `/`           | `src/app/CompanyWorkspace.tsx`            | Default AgentOS company UI     |
| `/?studio`    | `src/legacy/studio/Studio.tsx`            | Retained Studio runtime client |
| `/?data`      | `src/legacy/data/DataWorkspace.tsx`       | Retained DataGuild workspace   |
| `/?workbench` | `src/legacy/workbench/AgentWorkbench.tsx` | Retained earlier workbench     |

`legacy` means separately retained and non-default, not dead or safe to delete. These routes still ship. Browser service plugins live in `apps/desktop/server`; native equivalents live in `src-tauri/src`. Do not assume a Vite-only endpoint exists in the installed app.

## Source map

```text
apps/
  desktop/
    src/
      main.tsx                 # Experience entry point
      app/                     # Company shell, routes, global search, shared styling
      features/terminal/       # Global terminal dock, session UI, command presentation
      features/
        company/               # Offices, domains, agents, forms, floor plan, model
        start/                 # Prompt composer and saved chats
        tasks/                 # Task models, schedules, handoffs, and runtime views
        studio/                # Current workflow editor, inspectors, and Copilot
        projects/              # Company project explorer and folder requests
        activity/              # Rehearsals, approvals, agent/run inspection
        memory/                # Local Markdown workspace, editor, scoped files, and validation
        engines/               # Read-only capability inventory UI/contracts
      shared/                  # Shared dialog and Studio transport types
      legacy/                  # Explicitly retained alternate experiences
    server/                    # Loopback development endpoints and their tests
    src-tauri/                 # Native shell, local file operations, macOS bundle
  cli/                         # Earlier core/runtime CLI
packages/                      # Runtime ports, core, event store, policies, plugins
plugins/core-pack/             # Built-in capability manifest
scripts/                      # Source, publication-path, and secret checks
docs/                          # Current guides plus labeled historical references
```

Keep components, CSS, model functions, and unit tests with their feature. Put only cross-feature shell behavior in `app`, and genuinely shared contracts in `shared`. Avoid creating a global miscellaneous components folder. A feature may import another feature's model explicitly; do not introduce barrel exports just to hide dependency direction.

## Commands and checks

Use Node.js 22.13+ and the pinned pnpm version in `package.json`. Install with `pnpm install --frozen-lockfile`. Native development also needs Rust and Xcode Command Line Tools.

| Command                                                        | Purpose                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                                                     | Vite preview on `127.0.0.1:4173`                             |
| `pnpm dev:desktop`                                             | Tauri development window                                     |
| `pnpm typecheck`                                               | Frontend/packages and server TypeScript                      |
| `pnpm test`                                                    | All source Vitest suites                                     |
| `pnpm audit:source`                                            | Reachability/broken local import check                       |
| `pnpm format`                                                  | Format maintained company UI, shared files, scripts and docs |
| `pnpm format:check`                                            | Check the same formatting scope                              |
| `pnpm build`                                                   | Production web/package builds                                |
| `pnpm build:mac`                                               | Native `.app` and `.dmg`                                     |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | Native file-operation tests                                  |

The source audit follows static/dynamic TypeScript imports and CSS imports from browser, Vite, CLI, public package exports, and test entry points. It is deliberately conservative: reachability is not proof that every export, selector, package dependency, or feature is used. Investigate candidates before deletion. It does not read local user data or delete files.

Before UI handoff: check Home, Chat, workflow editor, Activity, Library, global search, modal keyboard focus, direct hashes, reload, Back/Forward, light/dark themes, and a 390px viewport. For canvas changes test drag/drop, connection ports, selector alternatives, fit, undo/redo, saving, and reopening after task edits. Smoke-test all retained alternate routes after moves or dependency changes. Store screenshots in ignored `output/playwright/`.

## Navigation and state

`app/navigation.ts` owns destination labels, grouping, hash parsing, and pure search. `useWorkspaceRoute.ts` binds hashes to navigation. Primary navigation uses Home, Chat, Activity, and Library, with Settings and utility controls in the rail. Home owns the office map and workflow entry points. Routes contain IDs, never serialized workspace contents. An unknown or malformed hash falls back to Home. Invalid office IDs show an unavailable notice.

`CompanyWorkspace` owns company persistence and dialogs; feature modules receive explicit data and callbacks. Global Find searches saved company records without discovering engine capabilities or reading files. It does not replace an open editor. Dedicated feature searches cover chat contents, memory, and discovered capabilities.

Storage keys remain compatible with the initial commit. Do not rename them during visual work:

- `agentos:company:v1`: company, projects, tasks, chats, and optional task canvas.
- `agentos:theme`: appearance.
- Prompt drafts and rehearsal histories keep their own versioned keys defined in their feature models.
- Browser development memory/projects: repository `.agentos/`.
- Native memory/projects: `~/Library/Application Support/com.agentos.desktop/`.
- Earlier Studio memory/runtime files: repository `.staffforge/` (separate subsystem).

These are not encrypted secret stores. Keep credentials out. Preserve local data and existing drafts when cleaning or migrating. Browser and native app storage are independent. Source commits do not back up user storage.

## Safe maintenance

1. Start a branch and inspect working-tree changes.
2. Trace imports, routes, config, tests, and public exports before marking code unused.
3. Move related files together; update both browser and server imports.
4. Leave local data, dependency stores, installers, and generated native caches alone unless cleaning those exact artifacts is explicitly requested.
5. Run the checks above and record limitations, not just passing counts.

Generated `dist`, `dist-types`, `target`, `node_modules`, TypeScript caches, browser artifacts, and local stores are ignored. They are not source organization problems. If build caches need cleaning, stop relevant processes and remove only a validated generated directory, never a workspace root or user data directory.

Visual workflows compile into validated native plans. Per-step context notes and selected task files are scoped by attachment edges. Discovered MCP/skill/connector records become explicit required-capability instructions only when their provider matches; local discovery still does not prove authentication or live availability. Restriction blocks remain non-executable and must fail closed until the host can enforce them. Cosmetic work must not imply stronger guarantees.

## Public repository checks

Run `pnpm check:repo` for publication-path checks and `pnpm check:secrets` with Gitleaks 8.30.1 installed for Git history and current publishable-file scans. GitHub CI runs these alongside types, source reachability, tests, formatting, web build, npm audit, and a macOS native build. See [Contributing](../CONTRIBUTING.md), [Security](../SECURITY.md), and [Releasing](RELEASING.md).
