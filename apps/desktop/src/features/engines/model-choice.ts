export type ModelChoice = { model?: string | undefined; effort?: string | undefined };
export type StepModelChoice = ModelChoice & { engine: string; agentId: string };
export function isModelChoice(value: unknown): value is ModelChoice {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as ModelChoice;
  return [v.model, v.effort].every(
    (s) => s === undefined || (typeof s === "string" && s.length > 0 && s.length <= 200),
  );
}
export function isModelDefaults(value: unknown): value is Record<string, ModelChoice> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(([key, v]) => ["codex", "claude"].includes(key) && isModelChoice(v))
  );
}
export function isStepModels(value: unknown): value is Record<string, StepModelChoice> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (v) =>
        isModelChoice(v) &&
        typeof (v as StepModelChoice).engine === "string" &&
        typeof (v as StepModelChoice).agentId === "string",
    )
  );
}
