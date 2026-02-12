import { describe, it, expect } from "vitest";
import { buildExcludedToolsGuidance } from "./excluded-tools-guidance.js";

describe("buildExcludedToolsGuidance()", () => {
  it("returns null when no excluded arms", () => {
    expect(buildExcludedToolsGuidance(undefined)).toBeNull();
    expect(buildExcludedToolsGuidance([])).toBeNull();
  });

  it("returns null when excluded arms are non-tool types only", () => {
    expect(buildExcludedToolsGuidance(["skill:coding:main", "file:workspace:notes.md"])).toBeNull();
  });

  it("lists excluded tool names from arm IDs", () => {
    const result = buildExcludedToolsGuidance([
      "tool:exec:bash",
      "tool:fs:Read",
      "tool:web:webSearch",
    ]);
    expect(result).toContain("bash");
    expect(result).toContain("Read");
    expect(result).toContain("webSearch");
    expect(result).toContain("unavailable");
  });

  it("only includes tool-type arms, ignoring skill and file arms", () => {
    const result = buildExcludedToolsGuidance([
      "tool:exec:bash",
      "skill:coding:main",
      "file:workspace:foo.md",
    ]);
    expect(result).toContain("bash");
    expect(result).not.toContain("coding");
    expect(result).not.toContain("foo.md");
  });

  it("skips malformed arm IDs", () => {
    const result = buildExcludedToolsGuidance(["tool:exec:bash", "malformed", "also:bad"]);
    expect(result).toContain("bash");
  });

  it("handles arm IDs with embedded colons in the id segment", () => {
    const result = buildExcludedToolsGuidance(["tool:exec:mcp:my:tool"]);
    expect(result).toContain("mcp:my:tool");
    expect(result).toContain("unavailable");
  });

  it("sanitizes control characters and truncates long tool names", () => {
    const result = buildExcludedToolsGuidance([
      "tool:exec:bad\x00name",
      `tool:exec:${"a".repeat(100)}`,
    ]);
    expect(result).toContain("badname");
    expect(result).not.toContain("\x00");
    expect(result).toContain("a".repeat(64));
    expect(result).not.toContain("a".repeat(65));
  });

  it("property: every tool-type arm name appears in the output", () => {
    const toolNames = ["bash", "Read", "webSearch", "sendMessage", "customTool"];
    const arms = toolNames.map((n) => `tool:other:${n}`);
    const result = buildExcludedToolsGuidance(arms)!;
    for (const name of toolNames) {
      expect(result).toContain(name);
    }
  });
});
