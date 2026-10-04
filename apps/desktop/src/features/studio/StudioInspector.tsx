import { useEffect, useState, type ReactNode } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { companyDomains, type Company } from "../company/company-model";
import {
  blockNames,
  contextTypeNames,
  type CanvasEdge,
  type CanvasNode,
  type ContextType,
  type DecorItem,
} from "../tasks/task-canvas-model";
import type { ApprovalRule } from "../tasks/task-approvals";
import { schedulePreview, type TaskSchedule } from "../tasks/task-workflow";
import { useInstalledTools } from "../engines/installed-tools";
import { readSkillDocument, type Capability } from "../engines/engine-inventory";
import { AssistantMessage } from "../../shared/AssistantMessage";
import { AttachmentEditor } from "../attachments/Attachments";
import { ModelPicker } from "../engines/ModelPicker";
import type { ModelChoice } from "../engines/model-choice";
import { projectRepository } from "../projects/project-repository";
import { kindColors, swatches, type Alignment, type Box } from "./studio-model";

export type WorkflowMeta = {
  projectId: string;
  directory: string;
  approval: ApprovalRule;
  schedule: TaskSchedule;
  modelDefaults: Record<string, ModelChoice>;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="st-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      type="number"
      value={Math.round(value)}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
    />
  );
}

export function ColorField({
  label,
  value,
  onChange,
  allowNone = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowNone?: boolean;
}) {
  const solid = value.slice(0, 7);
  const none = value.length === 9 && value.endsWith("00");
  return (
    <div className="st-color">
      <span>{label}</span>
      <div className="st-color-row">
        <input
          type="color"
          aria-label={`${label} colour`}
          value={/^#[0-9a-f]{6}$/i.test(solid) ? solid : "#000000"}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          className="st-hex"
          aria-label={`${label} hex`}
          value={none ? "None" : solid.toUpperCase()}
          onChange={(event) => {
            const text = event.target.value.trim();
            if (/^#?[0-9a-f]{6}$/i.test(text)) onChange(text.startsWith("#") ? text : `#${text}`);
          }}
        />
        {allowNone && (
          <button type="button" className="st-chip" onClick={() => onChange("#00000000")}>
            None
          </button>
        )}
      </div>
      <div className="st-swatches">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Use ${swatch}`}
            style={{ background: swatch }}
            aria-pressed={solid.toLowerCase() === swatch}
            onClick={() => onChange(swatch)}
          />
        ))}
      </div>
    </div>
  );
}

function BoxFields({ box, change }: { box: Box; change: (box: Box) => void }) {
  return (
    <div className="st-grid2">
      <Field label="X">
        <NumberInput value={box.x} onChange={(x) => change({ ...box, x })} />
      </Field>
      <Field label="Y">
        <NumberInput value={box.y} onChange={(y) => change({ ...box, y })} />
      </Field>
      <Field label="W">
        <NumberInput value={box.w} onChange={(w) => change({ ...box, w })} />
      </Field>
      <Field label="H">
        <NumberInput value={box.h} onChange={(h) => change({ ...box, h })} />
      </Field>
    </div>
  );
}

export function AlignBar({
  count,
  align,
  distribute,
}: {
  count: number;
  align: (how: Alignment) => void;
  distribute: (axis: "horizontal" | "vertical") => void;
}) {
  const buttons: [Alignment, ReactNode, string][] = [
    ["left", <AlignStartVertical size={15} />, "Align left"],
    ["hcenter", <AlignCenterVertical size={15} />, "Align horizontal centers"],
    ["right", <AlignEndVertical size={15} />, "Align right"],
    ["top", <AlignStartHorizontal size={15} />, "Align top"],
    ["vcenter", <AlignCenterHorizontal size={15} />, "Align vertical centers"],
    ["bottom", <AlignEndHorizontal size={15} />, "Align bottom"],
  ];
  return (
    <div className="st-align" role="group" aria-label="Alignment">
      {buttons.map(([how, icon, label]) => (
        <button
          key={how}
          type="button"
          title={label}
          aria-label={label}
          disabled={count < 2}
          onClick={() => align(how)}
        >
          {icon}
        </button>
      ))}
      <button
        type="button"
        title="Distribute horizontally"
        aria-label="Distribute horizontally"
        disabled={count < 3}
        onClick={() => distribute("horizontal")}
      >
        <AlignHorizontalDistributeCenter size={15} />
      </button>
      <button
        type="button"
        title="Distribute vertically"
        aria-label="Distribute vertically"
        disabled={count < 3}
        onClick={() => distribute("vertical")}
      >
        <AlignVerticalDistributeCenter size={15} />
      </button>
    </div>
  );
}

export function DecorDesign({
  item,
  update,
  setBox,
}: {
  item: DecorItem;
  update: (patch: Partial<DecorItem>) => void;
  setBox: (box: Box) => void;
}) {
  return (
    <>
      <section className="st-section">
        <h4>{item.type === "section" ? "Section" : item.type === "sticky" ? "Sticky" : "Layer"}</h4>
        <Field label="Name">
          <input
            value={item.name}
            maxLength={200}
            onChange={(e) => update({ name: e.target.value })}
          />
        </Field>
        <BoxFields box={item} change={setBox} />
      </section>
      <section className="st-section">
        <h4>{item.type === "text" ? "Text colour" : "Fill"}</h4>
        <ColorField
          label={item.type === "text" ? "Colour" : "Fill"}
          value={item.fill}
          allowNone={item.type !== "text"}
          onChange={(fill) => update({ fill })}
        />
      </section>
      {item.type !== "text" && (
        <section className="st-section">
          <h4>Stroke</h4>
          <ColorField
            label="Stroke"
            value={item.stroke}
            allowNone
            onChange={(stroke) => update({ stroke })}
          />
          {item.type !== "ellipse" && (
            <Field label="Corner radius">
              <NumberInput
                value={item.radius}
                onChange={(radius) => update({ radius: Math.max(0, Math.min(500, radius)) })}
              />
            </Field>
          )}
        </section>
      )}
      {item.type !== "section" && (
        <section className="st-section">
          <h4>Text</h4>
          <textarea
            rows={3}
            maxLength={4000}
            value={item.text}
            onChange={(event) => update({ text: event.target.value })}
          />
          <Field label="Size">
            <NumberInput
              value={item.fontSize}
              onChange={(fontSize) => update({ fontSize: Math.max(6, Math.min(200, fontSize)) })}
            />
          </Field>
        </section>
      )}
    </>
  );
}

export function NodeDesign({
  node,
  box,
  setBox,
  setFill,
}: {
  node: CanvasNode;
  box: Box;
  setBox: (box: Box) => void;
  setFill: (fill: string | undefined) => void;
}) {
  return (
    <>
      <section className="st-section">
        <h4>{blockNames[node.kind]} block</h4>
        <BoxFields box={box} change={setBox} />
      </section>
      <section className="st-section">
        <h4>Colour</h4>
        <ColorField
          label="Accent"
          value={node.style?.fill || kindColors[node.kind]}
          onChange={(fill) => setFill(fill)}
        />
        {node.style?.fill && (
          <button type="button" className="st-link" onClick={() => setFill(undefined)}>
            Reset to {blockNames[node.kind].toLowerCase()} colour
          </button>
        )}
      </section>
    </>
  );
}

function ToolPicker({
  node,
  update,
}: {
  node: CanvasNode;
  update: (patch: Partial<CanvasNode>) => void;
}) {
  const engine = node.engine === "claude" ? "claude" : "codex";
  const tools = useInstalledTools(engine).filter((tool) => tool.kind === node.kind);
  return (
    <>
      <Field label="Engine">
        <select
          value={engine}
          onChange={(event) =>
            update({ engine: event.target.value, reference: "", source: "", capabilityStatus: "" })
          }
        >
          <option value="codex">Codex</option>
          <option value="claude">Claude Code</option>
        </select>
      </Field>
      <Field label={`Installed ${blockNames[node.kind].toLowerCase()}`}>
        <select
          value={node.reference}
          onChange={(event) => {
            const tool = tools.find((candidate) => candidate.id === event.target.value);
            if (tool)
              update({
                reference: tool.id,
                title: tool.name.slice(0, 120),
                source: tool.source,
                engine,
                capabilityStatus: tool.status,
              });
          }}
        >
          <option value="">Choose…</option>
          {node.reference && !tools.some((tool) => tool.id === node.reference) && (
            <option value={node.reference}>{node.title} (not found)</option>
          )}
          {tools.map((tool) => (
            <option key={tool.id} value={tool.id}>
              {tool.name}
            </option>
          ))}
        </select>
      </Field>
      {!tools.length && (
        <p className="st-hint">
          Nothing installed for {engine === "claude" ? "Claude Code" : "Codex"} yet. Add one from
          Library → Capabilities.
        </p>
      )}
      <ToolDetails node={node} tool={tools.find((t) => t.id === node.reference)} />
      <Field label="How this step should use it (optional)">
        <textarea
          rows={3}
          maxLength={2000}
          value={node.prompt}
          placeholder="e.g. Use it to check each story's original source before writing."
          onChange={(event) => update({ prompt: event.target.value })}
        />
      </Field>
    </>
  );
}

/** What a tool is and, for skills, the instructions it gives the agent (its SKILL.md). */
function ToolDetails({ node, tool }: { node: CanvasNode; tool: Capability | undefined }) {
  const [doc, setDoc] = useState<{ path: string; text: string; error: string } | null>(null);
  const source = tool?.source || node.source;
  const isSkill = node.kind === "skill" && source.endsWith("SKILL.md");
  useEffect(() => {
    if (!isSkill) return setDoc(null);
    let live = true;
    readSkillDocument(source)
      .then((text) => live && setDoc({ path: source, text, error: "" }))
      .catch(
        (error) =>
          live && setDoc({ path: source, text: "", error: String(error).replace(/^Error: /, "") }),
      );
    return () => {
      live = false;
    };
  }, [source, isSkill]);
  if (!node.reference) return null;
  // Drop YAML front matter; its description is shown above.
  const body = doc?.text.replace(/^---\n[\s\S]*?\n---\n?/, "").trim() || "";
  return (
    <div className="st-tool-details">
      {tool?.description && <p dir="auto">{tool.description}</p>}
      <dl>
        <div>
          <dt>Type</dt>
          <dd>{blockNames[node.kind]}</dd>
        </div>
        {tool?.scope && (
          <div>
            <dt>Scope</dt>
            <dd>{tool.scope}</dd>
          </div>
        )}
        <div>
          <dt>Status</dt>
          <dd>{tool?.status || node.capabilityStatus || "unknown"}</dd>
        </div>
        {source && (
          <div>
            <dt>Source</dt>
            <dd title={source}>
              <code>{source.replace(/^\/Users\/[^/]+/, "~")}</code>
            </dd>
          </div>
        )}
      </dl>
      {isSkill && (
        <details className="st-skill-doc" open>
          <summary>Skill instructions</summary>
          {doc?.error ? (
            <p className="st-error">{doc.error}</p>
          ) : body ? (
            <AssistantMessage text={body} />
          ) : (
            <p className="st-hint">Loading…</p>
          )}
        </details>
      )}
      {node.kind === "mcp" && (
        <p className="st-hint">
          MCP settings stay in the engine&apos;s config and aren&apos;t shown here, since they can
          include keys.
        </p>
      )}
    </div>
  );
}

/** What a block does when the workflow runs. */
export function NodeWorkflow({
  company,
  node,
  update,
}: {
  company: Company;
  node: CanvasNode;
  update: (patch: Partial<CanvasNode>) => void;
}) {
  const agents = company.offices.flatMap((office) =>
    office.agents.map((agent) => ({ ...agent, office: office.name })),
  );
  const isRoot = node.kind === "task";
  return (
    <section className="st-section">
      <h4>{isRoot ? "Workflow start" : blockNames[node.kind]}</h4>
      {node.kind === "agent" && (
        <Field label="Agent">
          <select
            value={node.reference}
            onChange={(event) => {
              const agent = agents.find((candidate) => candidate.id === event.target.value);
              update({ reference: event.target.value, ...(agent ? { title: agent.name } : {}) });
            }}
          >
            <option value="">Choose an agent…</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} · {agent.office}
              </option>
            ))}
          </select>
        </Field>
      )}
      {node.kind === "office" && (
        <Field label="Office">
          <select
            value={node.reference}
            onChange={(event) => {
              const office = company.offices.find((o) => o.id === event.target.value);
              update({ reference: event.target.value, ...(office ? { title: office.name } : {}) });
            }}
          >
            <option value="">Choose an office…</option>
            {company.offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {node.kind === "domain" && (
        <Field label="Domain">
          <select
            value={node.reference}
            onChange={(event) =>
              update({ reference: event.target.value, title: event.target.value })
            }
          >
            <option value="">Choose a domain…</option>
            {companyDomains(company).map((domain) => (
              <option key={domain}>{domain}</option>
            ))}
          </select>
        </Field>
      )}
      {!["agent", "office", "domain", "mcp", "skill", "connector"].includes(node.kind) && (
        <Field label={isRoot ? "Workflow name" : "Name"}>
          <input
            value={node.title}
            maxLength={120}
            onChange={(event) => update({ title: event.target.value })}
          />
        </Field>
      )}
      {node.kind === "prompt" && (
        <Field label="Engine">
          <select
            value={node.engine || "codex"}
            onChange={(e) => update({ engine: e.target.value })}
          >
            <option value="codex">Codex</option>
            <option value="claude">Claude Code</option>
          </select>
        </Field>
      )}
      {node.kind === "approval" && (
        <Field label="Who approves">
          <select value={node.reviewer} onChange={(e) => update({ reviewer: e.target.value })}>
            <option value="human">Me</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} (agent review)
              </option>
            ))}
          </select>
        </Field>
      )}
      {node.kind === "context" && (
        <>
          <Field label="Source type">
            <select
              value={node.contextType || "notes"}
              onChange={(e) => update({ contextType: e.target.value as ContextType })}
            >
              {Object.entries(contextTypeNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {(node.contextType || "notes") !== "notes" && (
            <Field label="Source">
              <input
                value={node.source}
                maxLength={2000}
                placeholder="Link, path, or reference"
                onChange={(e) => update({ source: e.target.value })}
              />
            </Field>
          )}
          <ContextFiles node={node} update={update} />
        </>
      )}
      {["mcp", "skill", "connector"].includes(node.kind) && (
        <ToolPicker node={node} update={update} />
      )}
      {node.kind !== "approval" && !["mcp", "skill", "connector"].includes(node.kind) && (
        <Field
          label={
            isRoot
              ? "Outcome"
              : node.kind === "context"
                ? "Notes for the agent"
                : "Instructions for this step"
          }
        >
          <textarea
            rows={isRoot ? 6 : 5}
            maxLength={6000}
            value={node.prompt}
            placeholder={
              isRoot
                ? "What should this workflow achieve? Say what done looks like."
                : "Say what this step should do. Type “use notebooklm” to attach an installed tool."
            }
            onChange={(e) => update({ prompt: e.target.value })}
          />
        </Field>
      )}
    </section>
  );
}

/** Files a context block sends to its step on every run (images, PDFs, text). */
function ContextFiles({
  node,
  update,
}: {
  node: CanvasNode;
  update: (patch: Partial<CanvasNode>) => void;
}) {
  const named = node.files || [];
  // Files picked in the older builder have no names saved; keep them as they are.
  const unnamed = (node.attachmentIds || []).filter((id) => !named.some((f) => f.id === id));
  return (
    <div className="st-field st-context-files">
      <span>Files</span>
      <AttachmentEditor
        value={named}
        onChange={(files) =>
          update({ files, attachmentIds: [...unnamed, ...files.map((f) => f.id)].slice(0, 8) })
        }
        onBusy={() => undefined}
        compact
      >
        <small>
          {named.length || unnamed.length
            ? `Sent to the step on every run${unnamed.length ? ` · ${unnamed.length} earlier file${unnamed.length === 1 ? "" : "s"}` : ""}.`
            : "Drop, paste, or attach images, PDFs, or text files the step should always see."}
        </small>
      </AttachmentEditor>
    </div>
  );
}

export function EdgeWorkflow({
  edge,
  fromApproval,
  update,
  remove,
}: {
  edge: CanvasEdge;
  fromApproval: boolean;
  update: (condition: CanvasEdge["condition"]) => void;
  remove: () => void;
}) {
  return (
    <section className="st-section">
      <h4>Connection</h4>
      {edge.kind === "attachment" ? (
        <p className="st-hint">Gives the connected step this resource. It always applies.</p>
      ) : (
        <Field label="Continue when">
          <select
            value={edge.condition}
            disabled={fromApproval}
            onChange={(e) => update(e.target.value as CanvasEdge["condition"])}
          >
            {fromApproval ? (
              <option value="approved">Approved</option>
            ) : (
              <>
                <option value="success">The previous step succeeds</option>
                <option value="failure">The previous step fails</option>
                <option value="always">The previous step finishes</option>
              </>
            )}
          </select>
        </Field>
      )}
      <button type="button" className="st-danger" onClick={remove}>
        <Trash2 size={13} /> Delete connection
      </button>
    </section>
  );
}

/** Workflow-wide settings, shown when nothing is selected. */
export function WorkflowSettings({
  company,
  meta,
  change,
  folderLabel,
}: {
  company: Company;
  meta: WorkflowMeta;
  change: (patch: Partial<WorkflowMeta>) => void;
  folderLabel: string;
}) {
  const agents = company.offices.flatMap((office) => office.agents);
  const preview = schedulePreview(meta.schedule);
  return (
    <>
      <section className="st-section">
        <h4>Workflow</h4>
        <Field label="Project">
          <select value={meta.projectId} onChange={(e) => change({ projectId: e.target.value })}>
            <option value="">Company-wide</option>
            {(company.projects || []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="st-field">
          <span>Saves files to</span>
          <code className="st-path" title={folderLabel}>
            {folderLabel}
          </code>
          <div className="st-row">
            <button
              type="button"
              className="st-chip"
              onClick={() =>
                void projectRepository("pick")
                  .then((picked) => picked && change({ directory: picked.path }))
                  .catch(() => undefined)
              }
            >
              <FolderOpen size={12} /> Choose folder…
            </button>
            {meta.directory && (
              <button type="button" className="st-chip" onClick={() => change({ directory: "" })}>
                Use default
              </button>
            )}
          </div>
        </div>
        <Field label="Before it starts">
          <select
            value={
              meta.approval.kind === "agent" ? `agent:${meta.approval.agentId}` : meta.approval.kind
            }
            onChange={(e) => {
              const value = e.target.value;
              change({
                approval: value.startsWith("agent:")
                  ? { kind: "agent", agentId: value.slice(6) }
                  : value === "human"
                    ? { kind: "human" }
                    : { kind: "none" },
              });
            }}
          >
            <option value="none">Start right away</option>
            <option value="human">Ask me first</option>
            {agents.map((agent) => (
              <option key={agent.id} value={`agent:${agent.id}`}>
                {agent.name} reviews first
              </option>
            ))}
          </select>
        </Field>
      </section>
      <section className="st-section">
        <h4>Schedule</h4>
        <Field label="Runs">
          <select
            value={meta.schedule.kind}
            onChange={(e) =>
              change({
                schedule:
                  e.target.value === "cron"
                    ? {
                        kind: "cron",
                        expression: "0 9 * * 1-5",
                        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                      }
                    : { kind: "manual" },
              })
            }
          >
            <option value="manual">When I run it</option>
            <option value="cron">On a schedule</option>
          </select>
        </Field>
        {meta.schedule.kind === "cron" && (
          <>
            <Field label="Cron (min hour day month weekday)">
              <input
                value={meta.schedule.expression}
                onChange={(e) =>
                  change({
                    schedule: {
                      ...(meta.schedule as { kind: "cron"; expression: string; timeZone: string }),
                      expression: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Time zone">
              <input
                value={meta.schedule.timeZone}
                onChange={(e) =>
                  change({
                    schedule: {
                      ...(meta.schedule as { kind: "cron"; expression: string; timeZone: string }),
                      timeZone: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <p className={preview.error ? "st-error" : "st-hint"}>
              {preview.error ||
                `Next: ${preview.dates.map((date) => new Date(date).toLocaleString()).join(" · ")}`}
            </p>
          </>
        )}
      </section>
      <section className="st-section">
        <h4>Default models</h4>
        {(["codex", "claude"] as const).map((engine) => (
          <div key={engine} className="st-model">
            <small>{engine === "codex" ? "Codex" : "Claude Code"}</small>
            <ModelPicker
              engine={engine}
              value={meta.modelDefaults[engine]}
              label={`${engine} workflow default`}
              onChange={(choice) =>
                change({ modelDefaults: { ...meta.modelDefaults, [engine]: choice } })
              }
            />
          </div>
        ))}
      </section>
    </>
  );
}
