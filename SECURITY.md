# Security policy

AgentOS is an early-stage local desktop application. The current `main` branch receives security fixes; older snapshots have no separate maintenance guarantee.

## Report a vulnerability

Use GitHub's [private vulnerability reporting](https://github.com/mohammeddal/agentos/security/advisories/new). Include the affected commit, reproduction steps, impact, and a minimal synthetic example. Never include a live credential or private user data. If private reporting is unavailable, open an issue asking for a private contact without disclosing vulnerability details.

## Credentials and user data

- Codex and Claude Code own their sign-ins. AgentOS invokes the installed CLIs; contributors do not need to add an API key or `.env` file to this repository.
- Local capability discovery reads provider configuration to extract metadata; it must not return credential values, command arguments, headers, or environment maps. Metadata redaction is defense in depth, not a guarantee that arbitrary user text contains no secrets.
- Prompts, memory, attachments, and run output are stored locally and are **not encrypted**. Sending work shares relevant context with the chosen remote provider. Local-first does not mean offline inference.
- Provider permissions and workflow approvals are separate. Settings can change provider approval behavior; read-only chat defaults must not be confused with an opted-in action-enabled chat or workflow. The manual Terminal executes commands explicitly submitted by the user.
- The development server exposes local filesystem helpers. Keep it bound to `127.0.0.1`; do not expose it as a public service.

## Checks and limits

CI scans Git history and publishable files with Gitleaks, rejects private/generated paths, audits npm dependencies, and runs source checks and tests. A passing scan means no matching secret was detected; it does not prove that a repository can never contain credentials. Binary screenshots require visual review.

If a real credential is found, revoke or rotate it first. Removing the current file does not remove the secret from Git history. Review and clean history before publishing or pushing again; coordinate any rewrite with contributors.

Public source availability is not a production security certification. Native builds are unsigned and unnotarized by default; the current Tauri configuration has no enforced CSP. Rust dependency advisories, platform hardening, signing, and notarization require additional release review. See [Releasing](docs/RELEASING.md) and the [publication audit](docs/PUBLICATION-AUDIT.md) for scope and evidence.
