import { describe, it, expect } from "vitest";
import { detectReference } from "./reference-detection.js";

describe("detectReference", () => {
  describe("tool arms", () => {
    it("returns true when tool appears in toolMetas", () => {
      expect(
        detectReference({
          armId: "tool:exec:bash",
          armType: "tool",
          armLabel: "bash",
          assistantTexts: [],
          toolMetas: [{ toolName: "bash", meta: "ran ls" }],
        }),
      ).toBe(true);
    });

    it("returns false when tool is absent from toolMetas", () => {
      expect(
        detectReference({
          armId: "tool:exec:bash",
          armType: "tool",
          armLabel: "bash",
          assistantTexts: ["I used bash"],
          toolMetas: [{ toolName: "read_file" }],
        }),
      ).toBe(false);
    });
  });

  describe("skill arms", () => {
    it("returns true when skill name appears in assistant text", () => {
      expect(
        detectReference({
          armId: "skill:coding:main",
          armType: "skill",
          armLabel: "coding",
          assistantTexts: ["Using the coding skill to help"],
          toolMetas: [],
        }),
      ).toBe(true);
    });

    it("returns true when skill name appears in tool meta", () => {
      expect(
        detectReference({
          armId: "skill:coding:main",
          armType: "skill",
          armLabel: "coding",
          assistantTexts: [],
          toolMetas: [{ toolName: "skill_read", meta: "loaded coding prompt" }],
        }),
      ).toBe(true);
    });

    it("returns false when skill is not referenced", () => {
      expect(
        detectReference({
          armId: "skill:coding:main",
          armType: "skill",
          armLabel: "coding",
          assistantTexts: ["hello world"],
          toolMetas: [],
        }),
      ).toBe(false);
    });
  });

  describe("file arms", () => {
    it("returns true when filename appears in assistant text", () => {
      expect(
        detectReference({
          armId: "file:workspace:notes.md",
          armType: "file",
          armLabel: "notes.md",
          assistantTexts: ["I read notes.md and found the answer"],
          toolMetas: [],
        }),
      ).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(
        detectReference({
          armId: "file:workspace:README.md",
          armType: "file",
          armLabel: "README.md",
          assistantTexts: ["check readme.md"],
          toolMetas: [],
        }),
      ).toBe(true);
    });
  });

  describe("memory arms", () => {
    it("returns true for substring match on long labels", () => {
      const label = "The authentication system uses JWT tokens with RS256 signing";
      expect(
        detectReference({
          armId: "memory:chunk:abc123",
          armType: "memory",
          armLabel: label,
          assistantTexts: [
            "The authentication system uses JWT tokens with RS256 signing for all API endpoints",
          ],
          toolMetas: [],
        }),
      ).toBe(true);
    });

    it("returns false when content not referenced", () => {
      expect(
        detectReference({
          armId: "memory:chunk:abc123",
          armType: "memory",
          armLabel: "A completely unrelated memory chunk about databases",
          assistantTexts: ["The weather is nice today"],
          toolMetas: [],
        }),
      ).toBe(false);
    });
  });

  describe("section arms", () => {
    it("always returns true", () => {
      expect(
        detectReference({
          armId: "section:system:header",
          armType: "section",
          armLabel: "header",
          assistantTexts: [],
          toolMetas: [],
        }),
      ).toBe(true);
    });
  });
});
