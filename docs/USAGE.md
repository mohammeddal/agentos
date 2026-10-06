# AgentOS user guide

AgentOS is a local-first Mac workspace for Codex and Claude Code. Start with the [README](../README.md) to install dependencies and launch it. Browser preview lets you plan; provider execution requires the native app.

## Find your way around

- **Home** opens the company map. Offices contain agents and workflows. Use the scope selector to focus on a project, and the sidebar plus button to create a workflow.
- **Chat** opens a conversation. Choose an engine, model, project, and attachments in the composer. Chat can be read-only or explicitly enabled to make changes; review the composer options and provider permissions.
- **Activity** shows runs and work that needs attention. Open a run for steps, results, logs, cancellation, and pending approvals.
- **Library** holds reviewed memory and discovered capabilities. Discovery alone does not prove authentication, availability, or successful use.
- **Settings** contains engine checks, autonomy, appearance, and notifications. The left rail also provides search, help, and theme switching.

Use **Cmd/Ctrl+K** to search or run a command and **Cmd/Ctrl+J** to open the local Terminal. Open workflows and chats appear in the top tab bar. Hash URLs preserve navigation across reloads.

## Set up your team

The starter company includes editable example offices and agents. Use **Add an office** or the plus inside an office to extend it. Give each agent a role, engine, instructions, and optional model or discovered skills. Skills remain references to the provider's configuration; AgentOS does not install or authenticate them.

Projects organize related work and can use a selected local repository and branch. A project scope is organizational context, not permission to read every file or bypass provider safeguards. Review the working directory before execution.

## Build a workflow

1. Choose **New workflow** from Home or an office. Give it a name.
2. Open **Blocks** to add custom steps, agents, offices, context, and approvals. Selecting a step first makes new work connect after it and resources attach to it.
3. Select a block and use the right-side **Workflow** inspector to configure its instructions and execution details. **Design** controls its visual presentation; **Copilot** helps edit the plan in the native app; **Run** shows execution details.
4. Connect output ports to inputs to set the flow. Use the toolbar to arrange, zoom, undo, or annotate the canvas. Annotations are visual aids, not executable instructions.
5. Add context only to the steps that need it. Confirm the chosen provider can access any required MCP, skill, or connector.
6. Add explicit approval checkpoints where human or reviewer sign-off is required. Save with **Create** or the editor's save control, review the plan, then **Run** in the native app.

A browser draft and a Copilot proposal are not proof of execution. Invalid graphs, missing assignments, incompatible capabilities, and unsupported policy restrictions can block a run. Check validation rather than assuming every visible block can execute. Earlier saved plans and alternate UI experiences remain supported where documented in [Live execution](LIVE-EXECUTION.md) and [Alternate experiences](ALTERNATE-EXPERIENCES.md).

### Build by chatting with Copilot

In the native workflow editor, select the **Copilot** tab, choose an installed and signed-in engine, and describe the desired workflow. For example: “Research a topic, draft a source-linked brief, then pause for my approval.” Follow up with changes such as “add a reviewer” or “attach these notes to the drafting step.” Supported changes update the canvas as one undoable edit; inspect the result before saving and running it. A generated plan is not a completed workflow run. Browser preview cannot generate Copilot responses.

See [Provider setup](PROVIDER-SETUP.md) for Terminal sign-in commands and the actual provider test status.

## Permissions and execution

Provider autonomy and workflow approvals are independent. **Ask me**, **Ask for risky actions**, and **Run on its own** change provider behavior; explicit approval blocks still stop the workflow. The default autonomy is **Ask for risky actions**. Review it before using an unfamiliar repository or provider configuration. Stored always-allow scopes can authorize subsequent matching requests.

Read-only chats and reviewer work use restricted provider sessions. Opting into chat actions or running workflows allows the configured provider tools and workspace writes. Codex and Claude have different permission mechanisms; see the [execution guide](LIVE-EXECUTION.md) and [security policy](../SECURITY.md).

Schedules require the app to remain open. Do not assume missed runs, Mac sleep, or closed-app execution are handled. Provider accounts, installed CLIs, network access, and quota are required. No live generation is available in the browser preview.

## Files, memory, and privacy

Use the paperclip, drag/drop, or image paste to attach files. Supported inputs include common images, UTF-8 text/code, and PDFs with extractable text. Limits are eight files, 5 MB per file, and 20 MB total. PDFs are text-only inputs; attach page images when visual layout matters.

The native app keeps local attachment copies. Removing a chip does not erase historical copies. Relevant context is sent to the selected provider when work runs. Memory should contain reviewed facts and provenance, not credentials or instructions that override approvals.

Browser development stores and the native app's stores are separate. Native data lives under `~/Library/Application Support/com.agentos.desktop/`; development services use ignored `.agentos/` and `.staffforge/` directories. Local records are not encrypted. Do not commit, publish, or delete these directories as source cleanup.

## Terminal

The native Terminal executes the command you explicitly submit in its visible working directory. It is separate from model tool approvals. Review commands before running them. Stop terminates the command; Clear clears the view. Sessions are memory-only, and interactive full-screen programs are not supported. The browser cannot execute native Terminal commands.

## Troubleshooting

- **Port 4173 is occupied:** stop the conflicting process you own, or choose another port for layout-only preview. Local development service origin checks expect the configured loopback origin; another port may return 403 for those services.
- **Engine unavailable:** confirm the CLI works and is signed in outside AgentOS, then check Settings. Never paste login tokens into the app or a GitHub issue.
- **Capability unavailable:** verify the provider's own installation and configuration. A discovered name is metadata, not an access guarantee.
- **Build prerequisites missing:** install Rust and Xcode Command Line Tools for native builds; use browser preview for frontend work.
- **Unexpected state after an upgrade:** preserve local data and report the affected commit with a sanitized reproduction. Do not delete stores to hide a migration bug.
