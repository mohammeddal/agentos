import type { RuntimeHealth, StaffForgeEvent } from "@staffforge/schemas";

export interface RuntimeSessionOptions { sessionId: string; workspaceId: string; workspacePath: string; objective: string }
export interface RuntimeInstruction { agentId: string; taskId: string; instruction: string; capability?: string }
export interface RuntimeSession { id: string; submit(input: RuntimeInstruction): AsyncIterable<StaffForgeEvent>; cancel(): Promise<void> }

export interface RuntimeAdapter {
  readonly id: string;
  health(): Promise<RuntimeHealth>;
  startSession(options: RuntimeSessionOptions): Promise<RuntimeSession>;
  resumeSession(id: string): Promise<RuntimeSession>;
}

export { MockRuntimeAdapter } from "./mock.js";
