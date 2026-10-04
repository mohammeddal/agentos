import { companyDomains, type Company, type CompanyTask } from "../company/company-model";
import { isModelChoice, isModelDefaults, type ModelChoice } from "../engines/model-choice";
import { validAttachments, type Attachment } from "../attachments/attachment-model";

export type PromptDraft = {
  attachments?: Attachment[];
  modelChoice?: ModelChoice;
  modelDefaults?: Record<string, ModelChoice>;
  text: string;
  makeTask: boolean;
  projectId: string;
  target: string;
  engine: string;
  chatId: string;
  /** The chat may edit files and run commands, each gated by your approval. */
  actions?: boolean;
};
export const emptyPrompt: PromptDraft = {
  text: "",
  makeTask: false,
  projectId: "",
  target: "",
  engine: "Codex",
  chatId: "",
};
export const PROMPT_STORAGE = "agentos:prompt-draft:v1";
export function parsePromptDraft(raw: string | null): PromptDraft {
  if (!raw) return { ...emptyPrompt };
  const value = JSON.parse(raw) as PromptDraft;
  if (
    !value ||
    (value.attachments !== undefined && !validAttachments(value.attachments)) ||
    (value.modelChoice !== undefined && !isModelChoice(value.modelChoice)) ||
    (value.modelDefaults !== undefined && !isModelDefaults(value.modelDefaults)) ||
    ["text", "projectId", "target", "engine", "chatId"].some(
      (key) => typeof value[key as keyof PromptDraft] !== "string",
    ) ||
    value.text.length > 3000 ||
    (value.actions !== undefined && typeof value.actions !== "boolean") ||
    typeof value.makeTask !== "boolean"
  )
    throw new Error("Unrecognized prompt draft. The saved draft was left untouched.");
  return value;
}
export function quickTaskError(company: Company, draft: PromptDraft): string | null {
  if (!draft.text.trim() || draft.text.length > 3000)
    return "Write a prompt of up to 3,000 characters.";
  if (draft.projectId && !company.projects?.some((p) => p.id === draft.projectId))
    return "Choose an available project or Company-wide.";
  const id = draft.target.slice(2);
  if (draft.target.startsWith("d:") && companyDomains(company).includes(id)) return null;
  if (
    draft.target.startsWith("a:") &&
    company.offices.some((o) => o.agents.some((a) => a.id === id))
  )
    return null;
  return "Choose a domain or agent for this task.";
}
export function taskFromPrompt(
  company: Company,
  draft: PromptDraft,
  id: string,
  createdAt: string,
): CompanyTask {
  const error = quickTaskError(company, draft);
  if (error) throw new Error(error);
  const brief = draft.text.trim();
  const title = brief
    .split(/\r?\n/)
    .find((line) => line.trim())!
    .trim();
  return {
    id,
    title: title.length > 120 ? `${title.slice(0, 119)}…` : title,
    brief,
    assignment: {
      kind: draft.target.startsWith("d:") ? "domains" : "agents",
      targets: [draft.target.slice(2)],
    },
    ...(draft.projectId ? { projectId: draft.projectId } : {}),
    status: "planned",
    createdAt,
    approval: { kind: "human" },
    schedule: { kind: "manual" },
    handoffs: [],
    ...(draft.attachments?.length ? { attachments: draft.attachments } : {}),
    ...(draft.modelDefaults ? { modelDefaults: draft.modelDefaults } : {}),
  };
}
