#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { StaffForgeCore } from "@staffforge/core";
import { MockRuntimeAdapter } from "@staffforge/runtime";
import { CodexRuntimeAdapter } from "@staffforge/codex-adapter";

const [, , command = "status", ...args] = process.argv;
const core = new StaffForgeCore(new MockRuntimeAdapter());
const definitions = core.definitions();

const table = (rows: string[][]) => {
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map((row) => row[i]?.length ?? 0))) ?? [];
  for (const row of rows) console.log(row.map((cell, i) => cell.padEnd(widths[i] ?? cell.length)).join("  "));
};

async function investigate(objective: string) {
  if (!objective) throw new Error("Provide an objective: staffforge investigate \"why did revenue drop?\"");
  const autoApprove = args.includes("--approve");
  const handledApprovals = new Set<string>();
  let finished: (() => void) | undefined;
  const done = new Promise<void>((resolve) => { finished = resolve; });
  const unsubscribe = core.subscribe((view, event) => {
    const payload = event.payload as Record<string, any>;
    if (["agent.started", "evidence.recorded", "tool.started", "tool.completed", "test.passed", "approval.requested", "session.completed", "session.failed"].includes(event.type)) {
      const actor = event.actor.id.padEnd(10);
      console.log(`${new Date(event.timestamp).toLocaleTimeString()}  ${actor}  ${String(payload.summary ?? payload.action ?? event.type)}`);
    }
    const pending = view.approvals.find((approval) => approval.status === "pending");
    if (pending && !handledApprovals.has(pending.id)) {
      handledApprovals.add(pending.id);
      if (autoApprove) void core.decideApproval(view.id, pending.id, true);
      else void promptApproval(view.id, pending.id, pending.action, pending.parameters);
    }
    if (view.status === "completed" || view.status === "failed") {
      if (view.finalSummary) console.log(`\nOutcome\n${view.finalSummary}`);
      finished?.();
    }
  });
  await core.startObjective({ objective, workspaceId: "cli-workspace", workspacePath: process.cwd() });
  await done; unsubscribe();
}

let approvalPromptOpen = false;
async function promptApproval(sessionId: string, approvalId: string, action: string, params: Record<string, unknown>) {
  if (approvalPromptOpen) return;
  approvalPromptOpen = true;
  const rl = createInterface({ input, output });
  const answer = await rl.question(`\nApproval required: ${action}\n${JSON.stringify(params, null, 2)}\nApprove? [y/N] `);
  rl.close();
  await core.decideApproval(sessionId, approvalId, /^y(es)?$/i.test(answer.trim()));
}

async function doctor() {
  const adapter = new CodexRuntimeAdapter();
  const health = await adapter.health();
  console.log("StaffForge doctor\n");
  table([
    ["CHECK", "STATUS", "DETAIL"],
    ["Codex CLI", health.installed ? "PASS" : "FAIL", health.version ?? health.details],
    ["Authentication", health.authenticated ? "PASS" : "FAIL", health.details],
    ["App-server", health.installed ? "READY" : "UNAVAILABLE", "Local JSONL/JSON-RPC adapter"],
    ["API key", "NOT REQUIRED", "Uses the existing local Codex session"]
  ]);
  if (health.capabilities.length) console.log(`\nCapabilities: ${health.capabilities.join(", ")}`);
  adapter.close();
}

async function main() {
  switch (command) {
    case "status": console.log("StaffForge is ready. Runtime: mock. Use `staffforge doctor` for Codex diagnostics."); break;
    case "doctor": await doctor(); break;
    case "agents": table([["AGENT", "ROLE", "CAPABILITIES"], ...definitions.agents.map((a) => [a.name, a.role, a.requiredCapabilities.join(", ") || "none"])]); break;
    case "skills": table([["SKILL", "VERSION"], ...definitions.skills.map((s) => [s.name, s.version])]); break;
    case "tools": table([["TOOL", "RISK", "CAPABILITY"], ...definitions.tools.map((t) => [t.name, t.risk, t.requiredCapability])]); break;
    case "capabilities": console.log((await core.runtimeHealth()).capabilities.join("\n")); break;
    case "plugins": console.log("StaffForge Core Pack  enabled  6 agents · 2 skills · 3 tools"); break;
    case "approvals": console.log("Approvals are scoped to active local sessions. Run an investigation to create one."); break;
    case "config": console.log("Policy: reads allowed; local/external writes ask; production/destructive writes require strong approval."); break;
    case "investigate": case "run": await investigate(args.filter((arg) => !arg.startsWith("--" )).join(" ")); break;
    default:
      console.log(`Unknown command: ${command}\n\nCommands: status, doctor, agents, skills, tools, capabilities, investigate, plugins, approvals, config`);
      process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
