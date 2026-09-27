# Security Model

> Reference scope: earlier StaffForge core/prototype design. For the current AgentOS company UI and implemented boundaries, start with the [development guide](DEVELOPMENT.md) and [usage guide](USAGE.md).

## Trust boundaries

- Codex owns its authentication and configured MCP credentials.
- StaffForge receives capability metadata and runtime events, never copied secrets.
- Plugins are untrusted until validated, permission-reviewed, and enabled.
- The user is the authority for local, external, production, and destructive writes.

## Deterministic action gate

Every tool request is evaluated before provider resolution:

| Risk               | Default                                |
| ------------------ | -------------------------------------- |
| `SAFE_READ`        | execute                                |
| `DRAFT`            | execute                                |
| `LOCAL_WRITE`      | request approval                       |
| `EXTERNAL_WRITE`   | request approval                       |
| `PRODUCTION_WRITE` | strong approval                        |
| `DESTRUCTIVE`      | strong approval, exact target required |

Policy considers action risk, requested capability, agent allow-list, plugin grants, workspace policy, environment, and target specificity. Provider execution requires a signed short-lived decision token so callers cannot skip evaluation.

## Data handling

- Structured logs redact common credential fields and environment values.
- Shell parameters are structured arrays, not interpolated command strings.
- The visible Terminal is a separate, direct-user authority boundary: it passes exactly the command the user submits to their local login shell. It never executes model output automatically, keeps its transcript in memory only, closes stdin, exposes the working directory, limits captured output, and stops the process group on request or app exit. Agent approval gates do not apply to this manual terminal.
- Paths are canonicalized and checked against the selected workspace.
- Rendered tool output is escaped and size-limited.
- Memory has scope, provenance, timestamp, confidence, source, and deletion support.
- No hidden API fallback is permitted.

## Approval requirements

An approval displays the action, reason, capability, risk, provider, exact parameters after redaction, proposed diff or effect, and expiration. Rejections are terminal for that attempt and are recorded in the audit event stream.
