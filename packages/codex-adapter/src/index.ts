import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { promisify } from "node:util";
import { createEvent, type EventType, type RuntimeHealth, type StaffForgeEvent } from "@staffforge/schemas";
import type { RuntimeAdapter, RuntimeInstruction, RuntimeSession, RuntimeSessionOptions } from "@staffforge/runtime";

const execFileAsync = promisify(execFile);
type JsonObject = Record<string, any>;

class AppServerClient {
  private process: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: JsonObject) => void; reject: (error: Error) => void }>();
  private listeners = new Set<(message: JsonObject) => void>();

  private constructor(process: ChildProcessWithoutNullStreams) {
    this.process = process;
    const lines = readline.createInterface({ input: process.stdout });
    lines.on("line", (line) => this.receive(line));
    process.on("exit", (code) => {
      const error = new Error(`Codex app-server exited with code ${code ?? "unknown"}`);
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    });
  }

  static async start() {
    const process = spawn("codex", ["app-server", "--listen", "stdio://"], { stdio: ["pipe", "pipe", "pipe"] });
    const client = new AppServerClient(process);
    await client.request("initialize", { clientInfo: { name: "staffforge", title: "StaffForge", version: "0.1.0" } });
    client.notify("initialized", {});
    return client;
  }

  request(method: string, params: JsonObject): Promise<JsonObject> {
    const id = this.nextId++;
    this.process.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  notify(method: string, params: JsonObject) { this.process.stdin.write(`${JSON.stringify({ method, params })}\n`); }
  subscribe(listener: (message: JsonObject) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  stop() { this.process.kill("SIGTERM"); }

  private receive(line: string) {
    let message: JsonObject;
    try { message = JSON.parse(line) as JsonObject; } catch { return; }
    if (typeof message.id === "number" && ("result" in message || "error" in message)) {
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(String(message.error.message ?? "Codex request failed")));
      else request.resolve(message.result as JsonObject);
      return;
    }
    for (const listener of this.listeners) listener(message);
  }
}

class AsyncMessageQueue {
  private values: StaffForgeEvent[] = [];
  private waiters: Array<(value: StaffForgeEvent | undefined) => void> = [];
  private ended = false;
  push(value: StaffForgeEvent) { const waiter = this.waiters.shift(); waiter ? waiter(value) : this.values.push(value); }
  end() { this.ended = true; for (const waiter of this.waiters.splice(0)) waiter(undefined); }
  async next() {
    const value = this.values.shift();
    if (value) return value;
    if (this.ended) return undefined;
    return new Promise<StaffForgeEvent | undefined>((resolve) => this.waiters.push(resolve));
  }
}

function normalizedType(method: string, itemType?: string): EventType | undefined {
  if (method === "turn/started") return "task.started";
  if (method === "error") return "runtime.error";
  if (method === "item/started" && itemType === "commandExecution") return "command.started";
  if (method === "item/completed" && itemType === "commandExecution") return "command.completed";
  if (method === "item/started" && itemType === "mcpToolCall") return "mcp.called";
  if (method === "item/completed" && itemType === "mcpToolCall") return "mcp.returned";
  if (method === "item/completed" && itemType === "fileChange") return "file.changed";
  if (method === "item/completed" && itemType === "agentMessage") return "evidence.recorded";
  return undefined;
}

function safeSummary(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.replace(/(?:api[_-]?key|token|password|secret)\s*[=:]\s*[^\s,}]+/gi, "$1=[redacted]").slice(0, 4000);
}

function cleanCliOutput(value: string) {
  return value.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("WARNING: proceeding")).join("\n");
}

class CodexSession implements RuntimeSession {
  readonly id: string;
  private cancelled = false;
  constructor(private readonly client: AppServerClient, private readonly options: RuntimeSessionOptions) { this.id = options.sessionId; }

  async *submit(input: RuntimeInstruction): AsyncIterable<StaffForgeEvent> {
    const started = await this.client.request("thread/start", {
      cwd: this.options.workspacePath,
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: false,
      serviceName: "staffforge"
    });
    const threadId = String(started.thread?.id ?? "");
    if (!threadId) throw new Error("Codex did not return a thread id.");
    const queue = new AsyncMessageQueue();
    const unsubscribe = this.client.subscribe((message) => {
      if (message.params?.threadId && message.params.threadId !== threadId) return;
      if (message.method === "turn/completed") { queue.end(); return; }
      const item = message.params?.item as JsonObject | undefined;
      const type = normalizedType(String(message.method ?? ""), item?.type);
      if (!type) return;
      queue.push(createEvent({
        type, sessionId: this.options.sessionId, workspaceId: this.options.workspaceId,
        correlationId: this.options.sessionId, actor: { kind: "runtime", id: "codex" },
        subject: { kind: "task", id: input.taskId },
        payload: { summary: safeSummary(item?.text ?? item?.aggregatedOutput ?? item?.changes ?? message.params), providerType: item?.type },
        metadata: { provider: "codex-app-server" }
      }));
    });
    try {
      await this.client.request("turn/start", {
        threadId,
        input: [{ type: "text", text: `${input.instruction}\n\nObjective: ${this.options.objective}` }]
      });
      while (!this.cancelled) {
        const event = await queue.next();
        if (!event) break;
        yield event;
      }
    } finally { unsubscribe(); }
  }

  async cancel() { this.cancelled = true; }
}

export class CodexRuntimeAdapter implements RuntimeAdapter {
  readonly id = "codex";
  private client: AppServerClient | undefined;
  private sessions = new Map<string, CodexSession>();

  async health(): Promise<RuntimeHealth> {
    try {
      const [versionResult, authResult, mcpResult] = await Promise.all([
        execFileAsync("codex", ["--version"]),
        execFileAsync("codex", ["login", "status"]),
        execFileAsync("codex", ["mcp", "list"])
      ]);
      const version = `${versionResult.stdout}${versionResult.stderr}`;
      const auth = `${authResult.stdout}${authResult.stderr}`;
      const mcp = `${mcpResult.stdout}${mcpResult.stderr}`;
      const cleanVersion = cleanCliOutput(version);
      const cleanAuth = cleanCliOutput(auth);
      const capabilities = ["filesystem.read", "shell.execute"];
      if (/enabled/i.test(mcp)) capabilities.push("mcp.discover");
      return { installed: true, authenticated: /logged in/i.test(cleanAuth), version: cleanVersion, mode: "codex", details: cleanAuth, capabilities };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return { installed: code !== "ENOENT", authenticated: false, mode: "codex", details: code === "ENOENT" ? "Codex CLI was not found on PATH." : safeSummary(error), capabilities: [] };
    }
  }

  async startSession(options: RuntimeSessionOptions) {
    this.client ??= await AppServerClient.start();
    const session = new CodexSession(this.client, options);
    this.sessions.set(session.id, session);
    return session;
  }
  async resumeSession(id: string) {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Codex session ${id} is not active in this process.`);
    return session;
  }
  close() { this.client?.stop(); this.client = undefined; }
}
