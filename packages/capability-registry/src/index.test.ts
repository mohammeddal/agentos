import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "./index.js";

describe("CapabilityRegistry", () => {
  it("resolves the highest-priority available provider without vendor branching", async () => {
    const registry = new CapabilityRegistry();
    registry.register({ id: "unavailable", capabilities: ["warehouse.query"], priority: 100, available: async () => false });
    registry.register({ id: "provider-b", capabilities: ["warehouse.query"], priority: 20, available: async () => true });
    registry.register({ id: "provider-a", capabilities: ["warehouse.query"], priority: 10, available: async () => true });
    expect((await registry.resolve("warehouse.query"))?.id).toBe("provider-b");
  });
});
