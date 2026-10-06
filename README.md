<p align="center">
  <img src="apps/desktop/public/favicon.svg" width="64" height="64" alt="AgentOS" />
</p>

<h1 align="center">AgentOS</h1>

<p align="center"><strong>A local workspace for your AI team.</strong><br />Organize agents. Build workflows. Review the work.</p>

<p align="center">
  <a href="https://github.com/mohammeddal/agentos/actions/workflows/ci.yml"><img src="https://github.com/mohammeddal/agentos/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/platform-macOS-222222.svg" alt="Platform: macOS" />
  <img src="https://img.shields.io/badge/status-early%20access-d8a657.svg" alt="Early access" />
</p>

<p align="center"><a href="#quick-start">Quick start</a> · <a href="docs/USAGE.md">User guide</a> · <a href="docs/DEVELOPMENT.md">Development</a> · <a href="CONTRIBUTING.md">Contribute</a> · <a href="SECURITY.md">Security</a></p>

![AgentOS company map with editable offices and agents](docs/images/agentos-home.png)

AgentOS is an open-source macOS app that brings **Codex and Claude Code** into one workspace. Group specialists into offices, connect steps on a visual canvas, give each step its context, and follow runs and approvals in one place. It uses the provider CLIs installed and signed in on your machine.

> **Early access:** native execution requires the Mac app. The browser is a planning preview. Source builds are unsigned; this project is not a security-audited or notarized production distribution.

## What you can do

- **Organize your team.** Create offices and agents with roles, instructions, engine choices, and skill references.
- **Build visual workflows.** Connect work steps, context, conditions, and approval checkpoints. Use the native Copilot to help edit a workflow.
- **Work with context.** Scope notes, files, reviewed memory, and discovered provider capabilities to the steps that need them.
- **Follow execution.** Inspect provider progress, results, failures, cancellations, and pending approvals.
- **Keep a local workspace.** Save project structure, chats, workflows, memory, and run history on your machine.

![AgentOS visual workflow editor with a synthetic research draft](docs/images/agentos-workflow.png)

Screenshots show the actual browser preview with demo data, not completed provider runs. See [image provenance](docs/images/README.md).

## Quick start

Use **Node.js 22.13+** (Node 22 LTS is the CI baseline) and **pnpm 9.15.2**. No `.env` file or API key is required for the browser preview.

```sh
git clone https://github.com/mohammeddal/agentos.git
cd agentos
corepack enable
corepack prepare pnpm@9.15.2 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Open [127.0.0.1:4173](http://127.0.0.1:4173). Start at **Home**, explore the offices, and choose **New workflow**. Keep the development server on loopback; it includes local filesystem helpers.

### Run the native Mac app

Install Rust with Cargo and Xcode Command Line Tools, then:

```sh
pnpm dev:desktop
```

For live agent work, install and sign in to [Codex CLI](https://developers.openai.com/codex/cli/) or [Claude Code](https://code.claude.com/docs/en/overview). Use **Settings** to check the connection and review autonomy settings. AgentOS does not bundle either provider or silently install one. Provider access and usage limits still apply.

### Build from source

```sh
pnpm build       # Web assets and workspace packages
pnpm build:mac   # Local macOS .app and .dmg
```

Native bundles appear in `apps/desktop/src-tauri/target/release/bundle/`. Public binary distribution requires a separate signing and notarization process; see [Releasing](docs/RELEASING.md). Native Windows/Linux support is not verified.

## How it fits together

```mermaid
flowchart LR
  UI[AgentOS · React workspace] --> Native[Tauri · local runtime]
  Native --> Codex[Installed Codex CLI]
  Native --> Claude[Installed Claude Code]
  Codex --> Providers[Remote AI providers]
  Claude --> Providers
  Native --> Local[Local files · memory · run history]
```

Local-first describes storage and orchestration, not offline inference. Relevant prompts and attachments go to the selected provider. Local records are not encrypted. Provider permissions and workflow approval checkpoints are separate; review both before running work. Capability discovery does not prove live access. [Read the execution boundaries](docs/LIVE-EXECUTION.md).

## Repository map

| Path                         | Purpose                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| `apps/desktop/src/app`       | App shell, routing, and navigation                           |
| `apps/desktop/src/features`  | Company map, workflows, chat, memory, and execution UI       |
| `apps/desktop/src-tauri`     | Rust native runtime and macOS packaging                      |
| `apps/desktop/server`        | Local development services                                   |
| `packages`                   | Core runtime, schemas, policies, persistence, and plugin SDK |
| `apps/cli`, `plugins`        | Earlier core CLI and built-in capability manifest            |
| `docs`, `.github`, `scripts` | Guides, images, contribution templates, CI, and checks       |

Internal `@staffforge/*` names remain for compatibility. Earlier Studio, DataGuild, and Workbench experiences are retained under `src/legacy`; see [alternate experiences](docs/ALTERNATE-EXPERIENCES.md).

## Contribute and fork

Fork this repository, install dependencies with the frozen lockfile, and follow [CONTRIBUTING.md](CONTRIBUTING.md). CI checks source, types, tests, formatting, web/native builds, npm advisories, and secrets. Dependabot proposes dependency updates.

```sh
pnpm check:repo
pnpm check:secrets  # Requires Gitleaks 8.30.1
pnpm audit:source
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

See the [documentation index](docs/README.md) and [publication audit](docs/PUBLICATION-AUDIT.md) for details and verification limits. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). You can use, modify, and distribute AgentOS under the license terms. Provider services and third-party dependencies have their own terms and licenses.
