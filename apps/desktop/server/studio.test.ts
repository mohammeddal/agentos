import { describe, expect, it } from "vitest";
import { roleFor, writeIntent } from "./studio";

describe("Studio request routing", () => {
  it.each(["Add a memory panel", "Update the workflow", "Redesign the project room", "Set up a local test"])("treats %s as change work", objective => {
    expect(writeIntent(objective)).toBe(true);
    expect(roleFor(objective)).toBe("builder");
  });

  it("keeps inspection and review with read-oriented agents", () => {
    expect(writeIntent("Inspect the memory files and explain the workflow")).toBe(false);
    expect(writeIntent("Explain how to update the memory files")).toBe(false);
    expect(roleFor("Explain how to update the memory files")).toBe("detective");
    expect(writeIntent("Review the memory files and then fix the stale entry")).toBe(true);
    expect(roleFor("Inspect the memory files and explain the workflow")).toBe("detective");
    expect(roleFor("Review the memory implementation for security issues")).toBe("reviewer");
  });
});
