# Contributing to AgentOS

Thanks for helping make AgentOS useful. Bug fixes, documentation, accessibility improvements, and focused workflow improvements are welcome.

## Set up your fork

1. Fork [mohammeddal/agentos](https://github.com/mohammeddal/agentos).
2. Clone your fork and enter its directory.
3. Use Node.js 22.13+ and pnpm 9.15.2, then run `pnpm install --frozen-lockfile`.
4. Run `pnpm dev` for browser development or `pnpm dev:desktop` for native execution. Native development also needs Rust and Xcode Command Line Tools.
5. Create a focused branch: `git switch -c fix/your-change`.

See [Development](docs/DEVELOPMENT.md) for the feature layout and [Usage](docs/USAGE.md) for the current product.

## Before opening a pull request

```sh
pnpm check:repo
pnpm audit:source
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
pnpm audit --audit-level=moderate
```

Install [Gitleaks](https://github.com/gitleaks/gitleaks) 8.30.1 and run `pnpm check:secrets` to scan history and publishable files. For native changes, also run `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`. Account-backed native tests are ignored by default; do not enable them in CI.

Explain the problem, the resulting behavior, and how you verified it. Add tests for changed behavior where useful. Include screenshots for visible changes using an isolated demo workspace with no private paths, conversations, or credentials. Document any checks you could not run.

Keep related components, styles, models, and tests together in `apps/desktop/src/features`. Shared shell code lives in `src/app`; truly shared contracts live in `src/shared`. Preserve internal `@staffforge/*` package names, storage keys, and native app identifiers unless a change includes an explicit migration plan.

## Keep private data private

Never commit provider authentication, `.env` files, local runtime stores, run histories, personal screenshots, signing keys, or copied CLI configuration. Do not paste these into issues, logs, or pull requests. Use clearly synthetic fixtures. Do not weaken approvals, provider sandboxes, or capability validation to make tests pass.

Report vulnerabilities through [Security](SECURITY.md), not a public issue. Keep discussions respectful and specific. Contributions are licensed under the repository's [MIT license](LICENSE); only contribute work you have permission to share.
