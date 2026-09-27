import type { AgentDefinition, SkillDefinition, ToolDefinition } from "@staffforge/schemas";
import type { WorkflowDefinition } from "@staffforge/workflow-engine";

const agent = (input: Omit<AgentDefinition, "schemaVersion" | "version" | "maxConcurrency" | "timeoutMs" | "approvalPolicy" | "optionalCapabilities">): AgentDefinition => ({
  schemaVersion: "1", version: "1.0.0", maxConcurrency: 1, timeoutMs: 120_000,
  approvalPolicy: "workspace-default", optionalCapabilities: [], ...input
});

export const builtInAgents: AgentDefinition[] = [
  agent({ id: "commander", name: "Commander", icon: "command", description: "Plans and coordinates the objective.", role: "Orchestrator", systemInstructions: "Decompose the goal, delegate work, resolve blockers, and maintain an evidence-based plan.", skills: ["incident-investigation"], requiredCapabilities: [], allowedActions: ["*"] }),
  agent({ id: "detective", name: "Detective", icon: "scan-search", description: "Investigates systems and falsifies hypotheses.", role: "Investigator", systemInstructions: "Investigate with explicit hypotheses and observable evidence. Distinguish facts from inference.", skills: ["metric-change-analysis", "trace-lineage"], requiredCapabilities: ["warehouse.query"], allowedActions: ["warehouse.query", "filesystem.read"] }),
  agent({ id: "builder", name: "Builder", icon: "hammer", description: "Creates reviewed implementation changes.", role: "Implementer", systemInstructions: "Make minimal, tested changes grounded in evidence.", skills: ["build-dbt-model", "generate-data-tests"], requiredCapabilities: ["filesystem.write"], allowedActions: ["filesystem.read", "filesystem.write", "shell.execute"] }),
  agent({ id: "reviewer", name: "Reviewer", icon: "shield-check", description: "Independently challenges proposed changes.", role: "Independent reviewer", systemInstructions: "Find failure modes, test assumptions, and assess blast radius independently of Builder.", skills: ["review-data-pr"], requiredCapabilities: ["filesystem.read", "shell.execute"], allowedActions: ["filesystem.read", "shell.execute"] }),
  agent({ id: "historian", name: "Historian", icon: "library", description: "Finds relevant institutional knowledge.", role: "Knowledge researcher", systemInstructions: "Search prior incidents, decisions, tickets, and documentation. Preserve provenance.", skills: ["incident-investigation"], requiredCapabilities: ["docs.read"], allowedActions: ["docs.read"] }),
  agent({ id: "reporter", name: "Reporter", icon: "file-text", description: "Turns evidence into clear operational artifacts.", role: "Technical communicator", systemInstructions: "Produce concise summaries that separate evidence, inference, decision, and next action.", skills: ["document-data-model"], requiredCapabilities: [], allowedActions: ["draft.report"] })
];

export const builtInSkills: SkillDefinition[] = [
  { schemaVersion: "1", version: "1.0.0", id: "incident-investigation", name: "Incident investigation", instructions: "Frame the symptom, establish the baseline, generate competing hypotheses, gather evidence, falsify, bound impact, and recommend the smallest safe action.", requiredCapabilities: [], optionalCapabilities: ["warehouse.query", "docs.read"], expectedOutputs: ["Evidence ledger", "Root-cause assessment", "Remediation"], evaluationCriteria: ["Claims cite evidence", "Competing hypotheses considered", "Blast radius bounded"] },
  { schemaVersion: "1", version: "1.0.0", id: "metric-change-analysis", name: "Metric change analysis", instructions: "Validate the metric definition, segment the change, align releases and pipelines, and quantify confidence.", requiredCapabilities: ["warehouse.query"], optionalCapabilities: [], expectedOutputs: ["Segment comparison"], evaluationCriteria: ["Definition verified", "Change quantified"] }
];

export const builtInTools: ToolDefinition[] = [
  { schemaVersion: "1", version: "1.0.0", id: "warehouse.query", name: "Query warehouse", description: "Execute a read-only analytical query.", requiredCapability: "warehouse.query", risk: "SAFE_READ", classification: "read", provider: "runtime", timeoutMs: 60_000, audit: true },
  { schemaVersion: "1", version: "1.0.0", id: "docs.read", name: "Search engineering knowledge", description: "Read incident and architecture documentation.", requiredCapability: "docs.read", risk: "SAFE_READ", classification: "read", provider: "runtime", timeoutMs: 30_000, audit: true },
  { schemaVersion: "1", version: "1.0.0", id: "filesystem.write", name: "Apply local change", description: "Modify files inside the selected workspace.", requiredCapability: "filesystem.write", risk: "LOCAL_WRITE", classification: "write", provider: "runtime", timeoutMs: 30_000, audit: true }
];

export const incidentWorkflow: WorkflowDefinition = {
  schemaVersion: "1", version: "1.0.0", id: "incident-investigation", name: "Incident investigation",
  root: { id: "root", type: "sequence", name: "Investigate and remediate", children: [
    { id: "plan", type: "action", name: "Frame objective and plan", agentId: "commander", taskId: "task-plan", timeoutMs: 20_000 },
    { id: "research", type: "parallel", name: "Gather current and historical evidence", children: [
      { id: "investigate", type: "action", name: "Investigate metric change", agentId: "detective", taskId: "task-investigate", timeoutMs: 30_000, retries: 1 },
      { id: "history", type: "action", name: "Search prior incidents", agentId: "historian", taskId: "task-history", timeoutMs: 30_000 }
    ]},
    { id: "build", type: "action", name: "Propose minimal change", agentId: "builder", taskId: "task-build", timeoutMs: 30_000 },
    { id: "approve", type: "approval", name: "Approve local change", taskId: "task-approval", action: "filesystem.write", capability: "filesystem.write", risk: "LOCAL_WRITE" },
    { id: "review", type: "action", name: "Review and test independently", agentId: "reviewer", taskId: "task-review", timeoutMs: 30_000 },
    { id: "report", type: "action", name: "Publish investigation report", agentId: "reporter", taskId: "task-report", timeoutMs: 30_000 }
  ]}
};

export const instructions: Record<string, string> = {
  plan: "Create a concise plan and assign evidence-seeking work.",
  investigate: "Analyze the change by cohort and release. State hypotheses and confidence.",
  history: "Search prior incidents and documentation for matching signatures.",
  build: "Inspect the implicated code and draft the smallest safe patch plus tests. Do not apply it.",
  review: "Independently review the proposed patch, run relevant tests, and assess blast radius.",
  report: "Create a short incident report with cause, evidence, impact, remediation, and confidence."
};
