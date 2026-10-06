# Provider setup and test status

AgentOS runs the Codex and Claude Code CLIs installed on your Mac. Sign in through those tools in **macOS Terminal**, then use the native AgentOS app. Browser preview cannot run providers or Copilot. AgentOS does not have a separate provider login form.

## Codex

1. Install the CLI using the [official Codex CLI guide](https://developers.openai.com/codex/cli/), if it is not already available.
2. Check the installation with `codex --version`.
3. Run `codex login` and complete the ChatGPT sign-in in your browser.
4. Run `codex login status` to check the active authentication method.
5. Open or reopen AgentOS, check **Settings**, choose **Codex** in Chat or Copilot, and send a short test prompt.

No separate API key is needed for ChatGPT sign-in, but your account must have access and available usage. The provider owns the credentials. See [official Codex authentication](https://learn.chatgpt.com/docs/auth).

## Claude Code

1. Install the CLI using [Anthropic's setup guide](https://code.claude.com/docs/en/setup), if needed. On a Mac with Homebrew, one documented option is `brew install --cask claude-code`.
2. Check the installation with `claude --version`.
3. Run `claude auth login` and complete the browser sign-in using an account with Claude Code access.
4. Run `claude auth status` to inspect local authentication status.
5. Open or reopen AgentOS, check **Settings**, choose **Claude Code** in Chat or Copilot, and send a short test prompt.

The normal login flow uses your Claude account; `claude auth login --console` is a separate option for Anthropic Console/API billing. Choose the account type you intend to use. See the [official authentication commands](https://code.claude.com/docs/en/cli-reference).

## What “Ready” means

The current AgentOS Settings label **Ready** means the CLI executable was found. It does **not** mean that authentication, model access, quota, or a real request has been validated. A model catalog can also load before a generation request fails.

Likewise, a CLI can report a stored sign-in while the remote service rejects an expired or revoked token. A real reply is the useful connection check.

For Claude HTTP 401 errors, run `claude auth login` again in Terminal, complete the browser flow, and retry a short message. If it still fails, follow the provider's authentication troubleshooting; do not assume another login has fixed it until a request succeeds. AgentOS cannot renew a revoked credential on your behalf. Never paste credentials into AgentOS, a GitHub issue, or the repository.

## Verified status — 2026-10-05

These are results from the actual AgentOS Rust runtime integration test, not a mocked frontend or a direct CLI response alone. Each provider was tested separately in a temporary workspace using short read-only prompts with tools disabled. No personal project data was sent.

| Provider    | Installed CLI tested | Login-status check             | AgentOS live integration result                                                                                       |
| ----------- | -------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Codex       | `0.158.0-alpha.2.1`  | ChatGPT sign-in reported       | **Passed:** selected model/effort, actual reply, continued conversation, and persisted history                        |
| Claude Code | `2.1.161`            | Renewed Claude account sign-in | **Passed after reauthentication:** selected model/effort, actual reply, continued conversation, and persisted history |

Claude initially reported signed in but failed with HTTP 401 in both a direct CLI request and the AgentOS integration test. No credential or endpoint environment overrides were set in the tested process. Renewing the sign-in with the official `claude auth login --claudeai` flow resolved the failure. The same AgentOS integration test then passed real replies, model/effort selection, continuation, and persisted history without an adapter code change. Credentials stayed in the provider-managed store; none were copied into this repository.

The 19 Copilot/editor unit tests also passed in this follow-up. Those tests cover plan/model behavior; they are not evidence of a successful live Copilot generation.

Both provider results cover the read-only chat transport, model selection, continuation, and persistence. This pass does not certify every workflow, Copilot-generated graph, attachment type, external tool, or approval path for either provider. CI's offline tests and builds do not authenticate to user accounts.

### Reproduce the live checks

After signing in, run these separately from the repository root. They consume a small amount of provider usage and use temporary runtime stores:

```sh
AGENTOS_TEST_ENGINES=codex cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml live_provider_smoke -- --ignored --nocapture
AGENTOS_TEST_ENGINES=claude cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml live_provider_smoke -- --ignored --nocapture
```

Only a successful test verifies that provider's response and continuation. Do not replace a failed Claude test with Codex and report both as passing. A newer CLI version requires revalidation.
