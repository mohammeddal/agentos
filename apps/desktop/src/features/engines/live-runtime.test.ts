import { describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
const memoryStore = vi.hoisted(() => ({ contents: null as string | null }));
vi.mock("../memory/memory-storage", () => ({
  memoryFile: async () => ({ contents: memoryStore.contents, path: "test.md" }),
}));
import {
  chatRequest,
  compileTask,
  engineId,
  refreshRequestMemory,
  startLive,
} from "./live-runtime";
import { isCompanyTask, isCompanyChat } from "../company/company-model";
import { modelChoiceError } from "./ModelPicker";
import { renderMemory } from "../memory/company-memory";
import { starterCompany, type Company, type CompanyTask } from "../company/company-model";
import { newCanvasNode } from "../tasks/task-canvas-model";
const task = (patch: Partial<CompanyTask> = {}): CompanyTask => ({
  id: "task-1",
  title: "Test",
  brief: "Answer a question",
  status: "planned",
  createdAt: new Date().toISOString(),
  assignment: { kind: "agents", targets: ["data-engineer"] },
  approval: { kind: "human" },
  ...patch,
});
describe("native execution plans", () => {
  it("adds the saved agent prompt and selected skills to performer and reviewer steps", () => {
    const company: Company = {
      ...structuredClone(starterCompany),
      offices: starterCompany.offices.map((office) => ({
        ...office,
        agents: office.agents.map((agent) =>
          agent.id === "data-engineer" || agent.id === "reviewer"
            ? {
                ...agent,
                prompt: `Instructions for ${agent.name}`,
                skills: [
                  {
                    id: `skill:${agent.id}`,
                    name: `${agent.id}-skill`,
                    engine: agent.engine === "Codex" ? ("codex" as const) : ("claude" as const),
                    source: `/skills/${agent.id}/SKILL.md`,
                    scope: "Personal",
                  },
                ],
              }
            : agent,
        ),
      })),
    };
    const steps = compileTask(company, task({ approval: { kind: "agent", agentId: "reviewer" } }));
    expect(steps[0]?.prompt).toContain("Instructions for Data Engineer");
    expect(steps[0]?.prompt).toContain("data-engineer-skill (Personal)");
    expect(steps[0]?.prompt).toContain("cannot be loaded");
    expect(steps[0]?.reviewer?.prompt).toContain("Instructions for PR Reviewer");
    expect(steps[0]?.reviewer?.prompt).toContain("reviewer-skill (Personal)");
  });
  it("sends only this message's files and propagates task files to agents and reviewers", async () => {
    const attachment = {
      id: "00000000-0000-0000-0000-000000000001",
      name: "reference.txt",
      size: 12,
      kind: "text" as const,
      mime: "text/plain",
    };
    const chat = {
      id: "chat",
      engine: "Codex",
      createdAt: new Date().toISOString(),
      messages: [
        { id: "old", text: "Old", createdAt: new Date().toISOString(), attachments: [attachment] },
        { id: "current", text: "New", createdAt: new Date().toISOString() },
      ],
    };
    expect(
      (await chatRequest(starterCompany, chat, "New", "current")).steps[0]?.attachments,
    ).toEqual([]);
    expect((await chatRequest(starterCompany, chat, "Old", "old")).steps[0]?.attachments).toEqual([
      attachment.id,
    ]);
    const steps = compileTask(
      starterCompany,
      task({ attachments: [attachment], approval: { kind: "agent", agentId: "reviewer" } }),
    );
    expect(steps[0]?.attachments).toEqual([attachment.id]);
    expect(steps[0]?.reviewer?.attachments).toEqual([attachment.id]);
  });
  it("saves chat selections and passes them to the native step", async () => {
    const chat = {
      id: "chat",
      engine: "Codex",
      createdAt: new Date().toISOString(),
      messages: [{ id: "m", text: "Hello", createdAt: new Date().toISOString() }],
      modelChoice: { model: "catalog-model", effort: "low" },
    };
    expect(isCompanyChat(JSON.parse(JSON.stringify(chat)))).toBe(true);
    const request = await chatRequest(
      starterCompany,
      chat,
      "Hello",
      "00000000-0000-0000-0000-000000000001",
    );
    expect(request.steps[0]).toMatchObject({ model: "catalog-model", effort: "low" });
  });
  it("applies defaults separately per provider and overrides a repeated agent step", () => {
    const t = task({
      modelDefaults: {
        codex: { model: "codex-choice", effort: "medium" },
        claude: { model: "claude-choice", effort: "high" },
      },
      approval: { kind: "agent", agentId: "reviewer" },
      handoffs: [
        {
          id: "again",
          after: "start",
          kind: "agent",
          targetId: "data-engineer",
          instruction: "Review",
          condition: { kind: "success" },
        },
      ],
      stepModels: {
        "handoff-again": {
          engine: "codex",
          agentId: "data-engineer",
          model: "other-model",
          effort: "low",
        },
        "start-data-engineer-review": {
          engine: "claude",
          agentId: "reviewer",
          model: "review-model",
        },
      },
    });
    expect(isCompanyTask(JSON.parse(JSON.stringify(t)))).toBe(true);
    const steps = compileTask(starterCompany, t);
    expect(steps[0]).toMatchObject({ model: "codex-choice", effort: "medium" });
    expect(steps[0]?.reviewer).toMatchObject({ model: "review-model", effort: undefined });
    expect(steps[1]).toMatchObject({ model: "other-model", effort: "low" });
  });
  it("does not transfer an override to a different agent or engine", () => {
    const steps = compileTask(
      starterCompany,
      task({
        modelDefaults: { codex: { model: "default" } },
        stepModels: {
          "start-data-engineer": { engine: "codex", agentId: "another-agent", model: "wrong" },
        },
      }),
    );
    expect(steps[0]?.model).toBe("default");
    const changed = compileTask(
      starterCompany,
      task({
        stepModels: {
          "start-data-engineer": { engine: "claude", agentId: "data-engineer", model: "wrong" },
        },
      }),
    );
    expect(changed[0]?.model).toBeUndefined();
  });
  it("keeps an agent override when other domain members are added before it", () => {
    const t = task({
      assignment: { kind: "domains", targets: ["Data & Analytics"] },
      stepModels: {
        "start-investigator": {
          engine: "codex",
          agentId: "investigator",
          model: "retained",
          effort: "high",
        },
      },
    });
    const company = {
      ...starterCompany,
      offices: starterCompany.offices.map((o) => ({ ...o, agents: [...o.agents].reverse() })),
    };
    expect(compileTask(company, t).find((s) => s.agentId === "investigator")).toMatchObject({
      model: "retained",
      effort: "high",
    });
  });
  it("keeps linked-task choices and namespaces reviewer IDs", () => {
    const linked = task({
      id: "linked",
      modelDefaults: { codex: { model: "linked-model" } },
      approval: { kind: "agent", agentId: "investigator" },
    });
    const parent = task({
      modelDefaults: { codex: { model: "parent-model" } },
      handoffs: [
        {
          id: "next",
          after: "start",
          kind: "task",
          targetId: "linked",
          instruction: "",
          condition: { kind: "success" },
        },
      ],
    });
    const steps = compileTask({ ...starterCompany, tasks: [parent, linked] }, parent);
    expect(steps[0]?.model).toBe("parent-model");
    expect(steps[1]?.model).toBe("linked-model");
    expect(steps[1]?.reviewer?.id).toBe("link-next-start-data-engineer-review");
    expect(steps[1]?.reviewer?.model).toBe("linked-model");
  });
  it("supports explicit provider defaults and visual-node overrides", () => {
    const root = newCanvasNode("task", 0, 0, "root");
    const worker = { ...newCanvasNode("agent", 0, 0, "worker"), reference: "data-engineer" };
    const steps = compileTask(
      starterCompany,
      task({
        modelDefaults: { codex: { model: "task-model", effort: "high" } },
        stepModels: {
          "canvas-worker-data-engineer": { engine: "codex", agentId: "data-engineer" },
        },
        canvas: {
          version: 1,
          nodes: [root, worker],
          edges: [{ id: "wire", from: "root", to: "worker", kind: "flow", condition: "success" }],
        },
      }),
    );
    expect(steps[0]?.model).toBeUndefined();
    expect(steps[0]?.effort).toBeUndefined();
  });
  it("shows unavailable models and invalid efforts instead of silently replacing them", () => {
    const models = [
      {
        id: "one",
        name: "One",
        description: "",
        isDefault: true,
        efforts: ["low"],
        defaultEffort: "low",
      },
    ];
    expect(modelChoiceError(models, {})).toBe("");
    expect(modelChoiceError(models, { model: "gone" })).toMatch(/no longer/);
    expect(modelChoiceError(models, { model: "one", effort: "max" })).toMatch(/supported effort/);
    expect(isCompanyTask({ ...task(), modelDefaults: { codex: { model: 123 } } })).toBe(false);
  });
  it("an Approved edge cannot bypass a human gate without a checkpoint block", () => {
    const root = { ...newCanvasNode("task", 0, 0, "root"), prompt: "Test" };
    const agent = { ...newCanvasNode("agent", 0, 0, "agent"), reference: "data-engineer" };
    const plan = compileTask(
      starterCompany,
      task({
        approval: { kind: "none" },
        canvas: {
          version: 1,
          nodes: [root, agent],
          edges: [{ id: "edge", from: "root", to: "agent", kind: "flow", condition: "approved" }],
        },
      }),
    );
    expect(plan[0]?.approval).toBe(true);
  });
  it("does not reuse old memory after memory is switched off", async () => {
    memoryStore.contents = renderMemory({ version: 1, enabled: false, entries: [] });
    const refreshed = await refreshRequestMemory({
      id: "scheduled",
      key: "task:test",
      title: "test",
      mode: "task",
      folder: "",
      context: "Old memory must disappear",
      contextWithoutMemory: "Project brief",
      memoryScopes: [],
      steps: [],
    });
    expect(refreshed.context).toBe("Project brief");
    memoryStore.contents = null;
  });
  it("requires legacy schedule snapshots to be re-enabled instead of guessing memory boundaries", async () => {
    await expect(
      refreshRequestMemory({
        id: "scheduled",
        key: "task:test",
        title: "test",
        mode: "task",
        folder: "",
        context: "Legacy mixed context",
        steps: [],
      }),
    ).rejects.toThrow(/Re-enable/);
  });
  it("compiles a visual agent flow with context and a human checkpoint", () => {
    const root = { ...newCanvasNode("task", 0, 0, "root"), prompt: "Build the plan" };
    const agent = {
      ...newCanvasNode("agent", 0, 0, "agent"),
      reference: "data-engineer",
      prompt: "Use exact figures",
    };
    const approval = newCanvasNode("approval", 0, 0, "approve");
    const notes = { ...newCanvasNode("context", 0, 0, "notes"), prompt: "Budget is 50" };
    const steps = compileTask(
      starterCompany,
      task({
        canvas: {
          version: 1,
          nodes: [root, approval, agent, notes],
          edges: [
            { id: "1", from: "root", to: "approve", kind: "flow", condition: "success" },
            { id: "2", from: "approve", to: "agent", kind: "flow", condition: "approved" },
            { id: "3", from: "notes", to: "agent", kind: "attachment", condition: "always" },
          ],
        },
      }),
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]?.approval).toBe(true);
    expect(steps[0]?.prompt).toContain("Budget is 50");
    expect(steps[0]?.prompt).toContain("Use exact figures");
  });
  it("compiles a visual office block into that office's agents", () => {
    const root = { ...newCanvasNode("task", 0, 0, "root"), prompt: "Investigate together" };
    const office = {
      ...newCanvasNode("office", 300, 0, "office"),
      reference: "engineering",
      prompt: "Return one verified recommendation",
    };
    const steps = compileTask(
      starterCompany,
      task({
        canvas: {
          version: 1,
          nodes: [root, office],
          edges: [{ id: "1", from: "root", to: "office", kind: "flow", condition: "success" }],
        },
      }),
    );
    expect(steps.map((step) => step.agentId)).toEqual(["developer", "reviewer"]);
    expect(steps[1]?.after).toEqual([steps[0]!.id]);
    expect(steps.every((step) => step.prompt.includes("Return one verified recommendation"))).toBe(
      true,
    );
  });
  it("uses the canvas root custom prompt even without other blocks", () => {
    const root = { ...newCanvasNode("task", 0, 0, "root"), prompt: "Changed instructions" };
    const steps = compileTask(
      starterCompany,
      task({ canvas: { version: 1, nodes: [root], edges: [] } }),
    );
    expect(steps[0]?.prompt).toContain("Changed instructions");
  });
  it("maps only supported providers", () => {
    expect(engineId("Codex")).toBe("codex");
    expect(engineId("Claude Code")).toBe("claude");
    expect(() => engineId("Gemini")).toThrow();
  });
  it("preserves the explicit human gate", () => {
    const steps = compileTask(starterCompany, task());
    expect(steps[0]?.approval).toBe(true);
    expect(steps[0]?.engine).toBe("codex");
  });
  it("chains all assigned domain members using stable IDs", () => {
    const steps = compileTask(
      starterCompany,
      task({ assignment: { kind: "domains", targets: ["Data & Analytics"] } }),
    );
    expect(steps.map((s) => s.agentId)).toEqual(["data-engineer", "analyst", "investigator"]);
    expect(steps[1]?.after).toEqual([steps[0]!.id]);
    expect(steps[1]?.engine).toBe("claude");
  });
  it("fails closed for a visual constraint that is not executable", () => {
    expect(() =>
      compileTask(
        starterCompany,
        task({
          canvas: {
            version: 1,
            nodes: [
              newCanvasNode("task", 0, 0, "root"),
              newCanvasNode("restriction", 0, 0, "limit"),
            ],
            edges: [],
          },
        }),
      ),
    ).toThrow(/blueprint/);
  });
  it("rejects an unassigned domain instead of pretending to run", () => {
    expect(() =>
      compileTask(
        starterCompany,
        task({ assignment: { kind: "domains", targets: ["Marketing"] } }),
      ),
    ).toThrow(/at least one/);
  });
  it("includes a separate reviewer and prevents self approval", () => {
    const steps = compileTask(
      starterCompany,
      task({ approval: { kind: "agent", agentId: "reviewer" } }),
    );
    expect(steps[0]?.reviewer?.engine).toBe("claude");
    expect(() =>
      compileTask(starterCompany, task({ approval: { kind: "agent", agentId: "data-engineer" } })),
    ).toThrow(/separate/);
  });
  it("preserves failure and structured output conditions", () => {
    const steps = compileTask(
      starterCompany,
      task({
        handoffs: [
          {
            id: "recover",
            after: "start",
            kind: "agent",
            targetId: "investigator",
            instruction: "Recover",
            condition: { kind: "failure" },
          },
          {
            id: "match",
            after: "recover",
            kind: "agent",
            targetId: "reviewer",
            instruction: "Review",
            condition: { kind: "match", field: "score", operator: "gt", value: "7" },
          },
        ],
      }),
    );
    expect(steps[1]?.condition).toBe("failure");
    expect(steps[2]?.matchRule?.field).toBe("score");
  });
  it("expands a linked task without discarding its gates", () => {
    const linked = task({ id: "linked", approval: { kind: "human" } });
    const parent = task({
      handoffs: [
        {
          id: "link",
          after: "start",
          kind: "task",
          targetId: "linked",
          instruction: "",
          condition: { kind: "success" },
        },
      ],
    });
    const company: Company = { ...starterCompany, tasks: [parent, linked] };
    const steps = compileTask(company, parent);
    expect(steps).toHaveLength(2);
    expect(steps[1]?.approval).toBe(true);
    expect(steps[1]?.after).toEqual([steps[0]!.id]);
  });
  it("does not cross project boundaries through a linked task", () => {
    const linked = task({ id: "linked", projectId: "different" });
    const parent = task({
      handoffs: [
        {
          id: "link",
          after: "start",
          kind: "task",
          targetId: "linked",
          instruction: "",
          condition: { kind: "success" },
        },
      ],
    });
    expect(() => compileTask({ ...starterCompany, tasks: [parent, linked] }, parent)).toThrow(
      /same project/,
    );
  });
  it("browser preview cannot start a provider", async () => {
    await expect(
      startLive({
        id: "x",
        key: "chat:x",
        title: "x",
        mode: "chat",
        folder: "",
        context: "",
        steps: [],
      }),
    ).rejects.toThrow(/installed Mac app/);
  });
});
