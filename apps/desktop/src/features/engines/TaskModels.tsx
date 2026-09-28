import type { CompanyTask } from "../company/company-model";
import type { LiveStep } from "./live-runtime";
import { ModelPicker } from "./ModelPicker";

export function TaskModels({
  task,
  steps,
  save,
  disabled = false,
  compact = false,
}: {
  task: CompanyTask;
  steps: LiveStep[];
  save: (task: CompanyTask) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const all = steps.flatMap((s, i) => [
    ...(s.reviewer ? [{ step: s.reviewer, title: `${i + 1}. Review · ${s.reviewer.label}` }] : []),
    { step: s, title: `${i + 1}. ${s.label}` },
  ]);
  const engines = [...new Set(all.map(({ step }) => step.engine))];
  return (
    <details className="co-task-models" open>
      <summary>
        {compact
          ? "Model & reasoning for this block"
          : "Models & reasoning · Workflow defaults and step overrides"}
      </summary>
      <p>
        Use one default per engine. Expand step overrides when a particular agent needs a different
        model. Changes apply to the next run; re-enable a schedule to update its saved plan.
      </p>
      {!compact &&
        engines.map((engine) => (
          <div key={engine}>
            <strong>{engine === "codex" ? "Codex" : "Claude Code"} default</strong>
            <ModelPicker
              engine={engine}
              value={task.modelDefaults?.[engine]}
              label={`${engine} workflow default`}
              disabled={disabled}
              onChange={(choice) =>
                save({ ...task, modelDefaults: { ...task.modelDefaults, [engine]: choice } })
              }
            />
          </div>
        ))}
      <details open={compact || undefined}>
        <summary>
          Per-step overrides · {all.length} {all.length === 1 ? "step" : "steps"}
        </summary>
        {all.map(({ step, title }) => {
          const saved = task.stepModels?.[step.id];
          const overridden =
            !!saved && saved.engine === step.engine && saved.agentId === step.agentId;
          return (
            <div className="co-step-model" key={step.id}>
              <header>
                <strong>
                  {title} · {step.engine === "codex" ? "Codex" : "Claude Code"}
                </strong>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Override ${title}`}
                    checked={overridden}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = { ...task.stepModels };
                      if (e.target.checked)
                        next[step.id] = {
                          engine: step.engine,
                          agentId: step.agentId,
                          model: step.model,
                          effort: step.effort,
                        };
                      else delete next[step.id];
                      save({ ...task, stepModels: next });
                    }}
                  />{" "}
                  Customize this step
                </label>
              </header>
              {overridden ? (
                <ModelPicker
                  engine={step.engine}
                  value={saved}
                  label={title}
                  disabled={disabled}
                  onChange={(choice) =>
                    save({
                      ...task,
                      stepModels: {
                        ...task.stepModels,
                        [step.id]: { ...choice, engine: step.engine, agentId: step.agentId },
                      },
                    })
                  }
                />
              ) : (
                <p>
                  {step.id.startsWith("link-")
                    ? "Linked workflow settings"
                    : "Inherits workflow default"}{" "}
                  · {step.model || "Recommended model"} · {step.effort || "Default"} effort
                </p>
              )}
            </div>
          );
        })}
      </details>
    </details>
  );
}
