export type WorkflowNode =
  | { id: string; type: "action"; name: string; agentId: string; taskId: string; timeoutMs?: number; retries?: number }
  | { id: string; type: "sequence"; name: string; children: WorkflowNode[] }
  | { id: string; type: "parallel"; name: string; children: WorkflowNode[] }
  | { id: string; type: "approval"; name: string; taskId: string; action: string; capability: string; risk: "LOCAL_WRITE" | "EXTERNAL_WRITE" | "PRODUCTION_WRITE" | "DESTRUCTIVE" }
  | { id: string; type: "condition"; name: string; key: string; then: WorkflowNode; otherwise?: WorkflowNode };

export interface WorkflowDefinition { schemaVersion: "1"; version: string; id: string; name: string; root: WorkflowNode }
export interface WorkflowContext { sessionId: string; workspaceId: string; objective: string; values: Record<string, unknown> }

export interface WorkflowHooks {
  started(node: WorkflowNode, context: WorkflowContext): Promise<void>;
  completed(node: WorkflowNode, context: WorkflowContext): Promise<void>;
  failed(node: WorkflowNode, error: Error, context: WorkflowContext): Promise<void>;
  execute(node: Extract<WorkflowNode, { type: "action" }>, context: WorkflowContext): Promise<void>;
  approval(node: Extract<WorkflowNode, { type: "approval" }>, context: WorkflowContext): Promise<boolean>;
}

export class WorkflowEngine {
  constructor(private readonly hooks: WorkflowHooks) {}

  async run(definition: WorkflowDefinition, context: WorkflowContext) {
    await this.visit(definition.root, context);
  }

  private async visit(node: WorkflowNode, context: WorkflowContext): Promise<void> {
    await this.hooks.started(node, context);
    try {
      if (node.type === "sequence") {
        for (const child of node.children) await this.visit(child, context);
      } else if (node.type === "parallel") {
        await Promise.all(node.children.map((child) => this.visit(child, context)));
      } else if (node.type === "condition") {
        const branch = context.values[node.key] ? node.then : node.otherwise;
        if (branch) await this.visit(branch, context);
      } else if (node.type === "approval") {
        const approved = await this.hooks.approval(node, context);
        if (!approved) throw new Error(`Approval rejected for ${node.action}`);
      } else {
        await this.runAction(node, context);
      }
      await this.hooks.completed(node, context);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      await this.hooks.failed(node, normalized, context);
      throw normalized;
    }
  }

  private async runAction(node: Extract<WorkflowNode, { type: "action" }>, context: WorkflowContext) {
    let lastError: Error | undefined;
    const attempts = (node.retries ?? 0) + 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const work = this.hooks.execute(node, context);
        if (!node.timeoutMs) return await work;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            work,
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Step ${node.id} timed out`)), node.timeoutMs); })
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw lastError ?? new Error(`Step ${node.id} failed`);
  }
}
