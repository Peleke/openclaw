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
});
