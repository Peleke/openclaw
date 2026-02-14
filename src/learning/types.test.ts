import { describe, it, expect } from "vitest";
import { parseArmId, buildArmId, CRITICAL_SEED_ARMS } from "./types.js";

describe("parseArmId", () => {
  it("parses a valid tool arm ID", () => {
    const result = parseArmId("tool:exec:bash");
    expect(result).toEqual({ type: "tool", category: "exec", id: "bash" });
  });

  it("parses arm ID with colons in the id segment", () => {
    const result = parseArmId("file:workspace:path:to:file.md");
    expect(result).toEqual({ type: "file", category: "workspace", id: "path:to:file.md" });
  });

  it("parses all valid arm types", () => {
    for (const type of ["tool", "memory", "skill", "file", "section"] as const) {
      expect(parseArmId(`${type}:cat:id`)).toEqual({ type, category: "cat", id: "id" });
    }
  });

  it("returns null for fewer than 3 segments", () => {
    expect(parseArmId("tool:exec")).toBeNull();
    expect(parseArmId("tool")).toBeNull();
    expect(parseArmId("")).toBeNull();
  });

  it("returns null for invalid type", () => {
    expect(parseArmId("banana:cat:id")).toBeNull();
  });

  it("returns null for empty category or id", () => {
    expect(parseArmId("tool::bash")).toBeNull();
  });
});

describe("CRITICAL_SEED_ARMS", () => {
  it("contains only valid parseable arm IDs", () => {
    for (const armId of CRITICAL_SEED_ARMS) {
      const parsed = parseArmId(armId);
      expect(parsed, `"${armId}" should be a valid arm ID`).not.toBeNull();
    }
  });

  it("includes core filesystem and execution tools", () => {
    expect(CRITICAL_SEED_ARMS).toContain("tool:fs:Read");
    expect(CRITICAL_SEED_ARMS).toContain("tool:exec:Bash");
    expect(CRITICAL_SEED_ARMS).toContain("tool:web:web_search");
  });
});

describe("buildArmId", () => {
  it("builds a valid arm ID", () => {
    expect(buildArmId("tool", "exec", "bash")).toBe("tool:exec:bash");
  });

  it("round-trips with parseArmId", () => {
    const id = buildArmId("skill", "coding", "main");
    const parsed = parseArmId(id);
    expect(parsed).toEqual({ type: "skill", category: "coding", id: "main" });
  });
});
