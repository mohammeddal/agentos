# Releasing AgentOS

## Publish source

1. Work from a clean branch and use the pinned pnpm version with `pnpm install --frozen-lockfile`.
2. Run the checks in [Contributing](../CONTRIBUTING.md), including `pnpm check:secrets`. Review **all history being pushed**, not only the current tree. Never push ignored runtime stores, private provider settings, or local screenshots.
3. Review README screenshots visually and confirm their provenance. Keep demo data separate from personal work.
4. Inspect `git diff --check`, the staged diff, and GitHub CI. Do not use a passing scanner as a guarantee that no secret can exist.
5. Publish only the intended branch. Do not use `git push --mirror` to publish unrelated local refs or recovery history.

The initial public source release retains the existing project history. Internal package names and storage identifiers are unchanged to preserve compatibility. The root package is private to prevent accidental npm publication.

## Build macOS binaries

Use a Mac with Xcode Command Line Tools, Rust, Node.js 22.13+, and pnpm 9.15.2:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
CI=true pnpm build:mac
```

The app and DMG are written beneath `apps/desktop/src-tauri/target/release/bundle/`. Builds use the host architecture unless explicitly configured otherwise. CI compiles an unsigned app; it does not publish installers.

Before distributing signed installers, configure Apple signing and notarization in a dedicated release environment, using CI secrets or the system keychain. Never store certificates, private keys, provisioning credentials, or app-specific passwords in this repository. Smoke-test the installed app on supported macOS versions with both provider adapters, verify upgrade/data preservation, review Rust advisories and native security configuration, and record limitations in release notes. Native CSP hardening remains outstanding.

## Fork identity

A source fork runs without renaming packages. If distributing it as a separate app, choose your own product name and Tauri bundle identifier, review data-directory migrations, and update repository links and artwork. The current `com.agentos.desktop` identifier shares the upstream app's storage location; changing it without a migration creates a separate store. Do not rename it as a cosmetic cleanup.

No signing credentials, auto-publishing workflow, or fabricated release downloads are included.
