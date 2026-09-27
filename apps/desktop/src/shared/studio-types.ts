export type RoleId = "detective" | "builder" | "reviewer" | "historian";
export type RunStatus = "running" | "waiting" | "completed" | "failed" | "cancelled";
export type RunPhase =
  | "assigned"
  | "planning"
  | "working"
  | "needs-you"
  | "verifying"
  | "done"
  | "failed";
export type AgentVisualState =
  | "idle"
  | "planning"
  | "reading"
  | "typing"
  | "terminal"
  | "reviewing"
  | "waiting"
  | "done";
export type MissionStatus =
  | "planning"
  | "executing"
  | "waiting"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";
export type MissionTaskStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";
export type MissionTaskKey = "discovery" | "architecture" | "implementation" | "verification";
export type MemoryKind = "workspace-fact" | "decision" | "preference" | "lesson" | "artifact";
export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  source: "built-in" | "personal" | "project";
  role: RoleId;
  model?: string;
  reasoningEffort?: string;
}
export interface SkillProfile {
  id: string;
  name: string;
  description: string;
  source: "personal" | "project";
}
export interface ActivityItem {
  id: string;
  label: string;
  detail: string;
  at: string;
  state: "working" | "done" | "error";
}
export interface FileEntry {
  name: string;
  kind: "folder" | "file" | "link";
}
export interface Decision {
  id: string;
  title: string;
  reason: string;
  details: string;
  kind: "approval" | "question";
  questions?: { id: string; question: string; options: string[] }[];
}
export interface LiveRun {
  id: string;
  objective: string;
  displayObjective?: string;
  workspace: string;
  role: RoleId;
  status: RunStatus;
  agentId: string;
  agentName: string;
  routingReason: string;
  skillIds: string[];
  skillNames: string[];
  source: "filesystem" | "codex";
  intent: "read" | "write";
  action: string;
  phase: RunPhase;
  visualState: AgentVisualState;
  startedAt: string;
  finishedAt?: string;
  answer: string;
  error?: string;
  activities: ActivityItem[];
  decisions: Decision[];
  files?: FileEntry[];
  directory?: string;
  threadId?: string;
  missionId?: string;
  missionTaskId?: string;
  memoryIds?: string[];
  memoryCapturedAt?: string;
}
export interface MemoryRecord {
  id: string;
  scope: string;
  kind: MemoryKind;
  title: string;
  value: string;
  confidence: number;
  provenance: string;
  sourceRunIds: string[];
  sourceObjective: string;
  sourceAgent: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  status: "review" | "active" | "conflicted" | "superseded";
  conflictWith?: string;
  reviewedAt?: string;
}
export interface MissionTask {
  id: string;
  key: MissionTaskKey;
  title: string;
  description: string;
  role: RoleId;
  agentId: string;
  status: MissionTaskStatus;
  dependsOn: string[];
  runId?: string;
  summary?: string;
}
export interface Mission {
  id: string;
  objective: string;
  workspace: string;
  kind: "change" | "analysis";
  status: MissionStatus;
  stage: "discovery" | "implementation" | "verification" | "delivery";
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  acceptanceCriteria: string[];
  tasks: MissionTask[];
  error?: string;
  delivery?: { summary: string; verified: boolean; evidence: string[] };
}
export interface RoutePreview {
  agentId: string;
  agentName: string;
  role: RoleId;
  reason: string;
  access: string;
  review: string;
}
export interface StudioState {
  connected: boolean;
  authenticated: boolean;
  detail: string;
  workspaces: { id: string; name: string; path: string }[];
  runs: LiveRun[];
  missions: Mission[];
  agents: AgentProfile[];
  skills: SkillProfile[];
  memories: MemoryRecord[];
}
