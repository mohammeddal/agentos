import { describe, expect, it } from "vitest";
import { simpleCd, terminalDockHeight, visibleTerminalText } from "./terminal-model";

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

  it("keeps a resized terminal within useful viewport bounds", () => {
    expect(terminalDockHeight(120, 1_000)).toBe(180);
    expect(terminalDockHeight(420, 1_000)).toBe(420);
    expect(terminalDockHeight(900, 1_000)).toBe(720);
  });
});
