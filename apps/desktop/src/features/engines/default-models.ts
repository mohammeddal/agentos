import { isModelDefaults, type ModelChoice } from "./model-choice";

/** App-wide model per engine. Workflow, step, agent, and chat choices take precedence. */
export const DEFAULT_MODELS_STORAGE = "agentos:default-models:v1";

export function readDefaultModels(): Record<string, ModelChoice> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(DEFAULT_MODELS_STORAGE) || "null");
    return isModelDefaults(saved) ? saved : {};
  } catch {
    return {};
  }
}

export function saveDefaultModels(value: Record<string, ModelChoice>) {
  localStorage.setItem(DEFAULT_MODELS_STORAGE, JSON.stringify(value));
}

/** Returns the first choice that names a model or effort, so empty pickers fall through. */
export function firstChoice(...choices: (ModelChoice | undefined)[]): ModelChoice | undefined {
  return choices.find((choice) => !!choice && (!!choice.model || !!choice.effort));
}
