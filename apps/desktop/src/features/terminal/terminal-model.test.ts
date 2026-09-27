import { describe, expect, it } from "vitest";
import { simpleCd, visibleTerminalText } from "./terminal-model";

describe("terminal presentation", () => {
  it("removes terminal control sequences before rendering output", () => {
    expect(visibleTerminalText("\u001b[31mfailed\u001b[0m\n")).toBe("failed\n");
  });

  it("recognizes only standalone directory changes", () => {
    expect(simpleCd("cd")).toBe("~");
    expect(simpleCd('cd "a folder"')).toBe("a folder");
    expect(simpleCd("cd project && ls")).toBeNull();
    expect(simpleCd("echo cd project")).toBeNull();
  });
});
