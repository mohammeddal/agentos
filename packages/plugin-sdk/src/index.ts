export interface PluginManifest {
  schemaVersion: "1";
  id: string;
  name: string;
  version: string;
  staffforge: { minVersion: string; maxVersion?: string };
  permissions: string[];
  contributes: {
    agents?: string[]; skills?: string[]; tools?: string[]; workflows?: string[];
    capabilities?: string[]; policies?: string[]; commands?: string[]; ui?: string[];
    eventProcessors?: string[]; contextProviders?: string[]; memoryProviders?: string[];
  };
}

export interface PluginLoadResult { manifest?: PluginManifest; errors: string[] }

const pluginIdPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
export function validatePluginManifest(input: unknown): PluginLoadResult {
  if (!input || typeof input !== "object") return { errors: ["Manifest must be an object."] };
  const value = input as Record<string, unknown>;
  const errors: string[] = [];
  if (value.schemaVersion !== "1") errors.push("Unsupported schemaVersion.");
  if (typeof value.id !== "string" || !pluginIdPattern.test(value.id)) errors.push("Plugin id must be a reverse-domain identifier.");
  if (typeof value.name !== "string" || value.name.trim().length < 2) errors.push("Plugin name is required.");
  if (typeof value.version !== "string" || !/^\d+\.\d+\.\d+/.test(value.version)) errors.push("Plugin version must be semantic.");
  if (!value.staffforge || typeof value.staffforge !== "object") errors.push("StaffForge compatibility is required.");
  if (!Array.isArray(value.permissions) || value.permissions.some((item) => typeof item !== "string")) errors.push("Permissions must be a string array.");
  if (!value.contributes || typeof value.contributes !== "object") errors.push("Contributions object is required.");
  return errors.length ? { errors } : { manifest: input as PluginManifest, errors };
}

export class PluginRegistry {
  private manifests = new Map<string, PluginManifest>();
  register(input: unknown) {
    const result = validatePluginManifest(input);
    if (!result.manifest) return result;
    if (this.manifests.has(result.manifest.id)) return { errors: [`Plugin already registered: ${result.manifest.id}`] };
    this.manifests.set(result.manifest.id, result.manifest);
    return result;
  }
  list() { return [...this.manifests.values()]; }
}
