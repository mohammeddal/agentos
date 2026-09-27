import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useSyncExternalStore } from "react";
import type { ModelChoice } from "./model-choice";
import "./model-picker.css";

export type ProviderModel = {
  id: string;
  name: string;
  description: string;
  efforts: string[];
  defaultEffort: string | null;
  isDefault: boolean;
};
type Catalog = { models: ProviderModel[]; loading: boolean; error: string };
const empty: Catalog = { models: [], loading: false, error: "" };
const catalogs = new Map<string, Catalog>();
const listeners = new Set<() => void>();
function publish(engine: string, state: Catalog) {
  catalogs.set(engine, state);
  listeners.forEach((fn) => fn());
}
async function refresh(engine: string) {
  if (!isTauri() || catalogs.get(engine)?.loading) return;
  publish(engine, { models: [], loading: true, error: "" });
  try {
    publish(engine, {
      models: await invoke<ProviderModel[]>("live_models", { engine }),
      loading: false,
      error: "",
    });
  } catch (e) {
    publish(engine, { models: [], loading: false, error: String(e) });
  }
}
export function modelChoiceError(models: ProviderModel[], value: ModelChoice): string {
  const model = value.model
    ? models.find((m) => m.id === value.model)
    : models.find((m) => m.isDefault);
  if (!model) return "This model is no longer in the catalog. Refresh and choose again.";
  if (value.effort && !model.efforts.includes(value.effort))
    return "Choose a supported effort for this model.";
  return "";
}
export function ModelPicker({
  engine,
  value = {},
  onChange,
  label = "Model settings",
  disabled = false,
}: {
  engine: string;
  value?: ModelChoice | undefined;
  onChange: (choice: ModelChoice) => void;
  label?: string;
  disabled?: boolean;
}) {
  const catalog = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => catalogs.get(engine) || empty,
  );
  useEffect(() => {
    if (!catalogs.has(engine)) void refresh(engine);
  }, [engine]);
  const selected = value.model
    ? catalog.models.find((m) => m.id === value.model)
    : catalog.models.find((m) => m.isDefault);
  const invalid = catalog.models.length ? modelChoiceError(catalog.models, value) : "";
  const unavailable = !isTauri() || catalog.loading || !catalog.models.length;
  return (
    <div className="co-model-picker" role="group" aria-label={label}>
      <div className="co-model-fields">
        <label>
          Model
          <select
            aria-label={`${label} model`}
            disabled={disabled || unavailable}
            value={value.model || ""}
            onChange={(e) => onChange(e.target.value ? { model: e.target.value } : {})}
          >
            <option value="">
              Recommended default
              {catalog.models.find((m) => m.isDefault)?.name
                ? ` · ${catalog.models.find((m) => m.isDefault)!.name}`
                : ""}
            </option>
            {value.model && !catalog.models.some((m) => m.id === value.model) && (
              <option value={value.model}>{value.model} · unavailable</option>
            )}
            {catalog.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reasoning effort
          <select
            aria-label={`${label} reasoning effort`}
            disabled={disabled || unavailable || !selected?.efforts.length}
            value={value.effort || ""}
            onChange={(e) =>
              onChange({
                ...(value.model ? { model: value.model } : {}),
                ...(e.target.value ? { effort: e.target.value } : {}),
              })
            }
          >
            <option value="">
              {selected && !selected.efforts.length
                ? "Not supported"
                : `Default${selected?.defaultEffort ? ` · ${selected.defaultEffort}` : ""}`}
            </option>
            {value.effort && !selected?.efforts.includes(value.effort) && (
              <option value={value.effort}>{value.effort} · unavailable</option>
            )}
            {selected?.efforts.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="co-button"
          disabled={!isTauri() || catalog.loading || disabled}
          onClick={() => void refresh(engine)}
          aria-label={`Refresh ${engine} models`}
        >
          {catalog.loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      <small>
        {!isTauri()
          ? "Available models load in the installed Mac app."
          : selected?.description ||
            "Model catalog from your installed CLI; access still depends on your account."}
      </small>
      {(catalog.error || invalid) && (
        <p className="co-form-error" role="alert">
          {catalog.error || invalid}
        </p>
      )}
    </div>
  );
}
