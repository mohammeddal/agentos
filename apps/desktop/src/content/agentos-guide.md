# AgentOS product guide

AgentOS is a local-first Mac control plane for running work through the Codex and Claude Code command-line tools already installed and signed in on this Mac. It does not copy provider credentials or replace those tools.

## Main areas

- **Chat** is a focused conversation. Choose Codex or Claude Code, a model, reasoning effort, a project, and attachments in the composer.
- **Workflows**, opened from Home or an office, are saved, repeatable work. A task can run one agent or a visual multi-step workflow.
- **Workflow map** connects offices, agents, prompts, context, MCPs, skills, connectors, approvals, and restrictions. Each execution step can choose its own model and effort.
- **Home** opens the company map, which shows offices and agents with live states: working, idle, not connected, or needs approval. Select a waiting agent to inspect and approve or reject the request without leaving the map.
- **Activity** summarizes runs. Open a run only when detailed steps, output, logs, or errors are needed.
- **Memory** is reviewed Markdown-backed knowledge at company, office, and agent scope. Memory is reference context and never permission to bypass safeguards.
- **Library** discovers skills, MCP servers, agents, and connectors available from local provider configuration.
- **Terminal** runs local commands in the chosen working directory.
- **Settings** contains engine connection checks, provider permission levels, inventory scanning, appearance, and Mac notifications.

## Projects, offices, and agents

Projects organize related chats and tasks and provide a project workspace and brief. An office is the same organizational level as a domain: a team area containing agents. Agents are specialists with an engine, role, custom prompt, selected skills, and optional model defaults.

## Execution and approvals

AgentOS has two independent approval layers:

1. **Workflow approvals** are explicit human or reviewer-agent checkpoints added to a task. They always remain in force.
2. **Provider permissions** control how often Codex or Claude Code asks before using tools. They are configured in Settings and copied into each new run.

Chat is read-only unless the user explicitly enables actions. Action-enabled chats and workflows use the provider permissions selected in Settings. The autonomy choices are Ask me, Ask for risky actions (the default), and Run on its own. Explicit workflow approval blocks remain independent. Codex tasks remain restricted to the selected workspace. Claude Code can either ask for tool permissions or automatically accept workspace file edits; commands that are not covered by that mode can still ask.

## Local and honest behavior

Company data, task definitions, memory, and run records are stored locally. Live execution works in the installed Mac app, not the browser design preview. A capability shown as discovered is not necessarily authenticated or reachable until its provider confirms it during a run. Gemini support is not yet available.
