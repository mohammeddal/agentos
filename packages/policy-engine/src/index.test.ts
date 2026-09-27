import { describe, expect, it } from "vitest";
import { PolicyEngine } from "./index.js";

const base = { agentId: "detective", action: "warehouse.query", capability: "warehouse.query", parameters: {}, grantedCapabilities: ["warehouse.query"], allowedActions: ["warehouse.query"] };

describe("PolicyEngine", () => {
  it("allows granted safe reads", () => expect(new PolicyEngine().evaluate({ ...base, risk: "SAFE_READ" })).toMatchObject({ effect: "allow" }));
  it("requires approval for writes", () => expect(new PolicyEngine().evaluate({ ...base, risk: "LOCAL_WRITE" })).toMatchObject({ effect: "approval", strong: false }));
  it("requires strong approval for destructive actions", () => expect(new PolicyEngine().evaluate({ ...base, risk: "DESTRUCTIVE" })).toMatchObject({ effect: "approval", strong: true }));
  it("denies capabilities that are not granted", () => expect(new PolicyEngine().evaluate({ ...base, grantedCapabilities: [], risk: "SAFE_READ" })).toMatchObject({ effect: "deny" }));
  it("denies actions outside the agent allow-list", () => expect(new PolicyEngine().evaluate({ ...base, allowedActions: [], risk: "SAFE_READ" })).toMatchObject({ effect: "deny" }));
});
