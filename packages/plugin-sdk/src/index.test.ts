import { describe, expect, it } from "vitest";
import { PluginRegistry, validatePluginManifest } from "./index.js";

const valid = { schemaVersion: "1", id: "com.example.tools", name: "Example tools", version: "1.0.0", staffforge: { minVersion: "0.1.0" }, permissions: ["docs.read"], contributes: { tools: [] } };

describe("plugin manifest", () => {
  it("accepts a versioned, namespaced manifest", () => expect(validatePluginManifest(valid).errors).toEqual([]));
  it("rejects invalid permissions and identifiers", () => expect(validatePluginManifest({ ...valid, id: "bad", permissions: "all" }).errors.length).toBeGreaterThan(0));
  it("isolates registration collisions", () => { const registry = new PluginRegistry(); expect(registry.register(valid).errors).toEqual([]); expect(registry.register(valid).errors[0]).toContain("already registered"); });
});
