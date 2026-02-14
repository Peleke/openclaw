import { describe, it, expect } from "vitest";
import { extractText, extractErrorText } from "./tool-execution.js";

describe("extractText", () => {
  it("returns text from text content blocks", () => {
    const result = {
      content: [
        { type: "text", text: "hello" },
        { type: "text", text: "world" },
      ],
    };
    expect(extractText(result)).toBe("hello\nworld");
  });

  it("returns empty string when no content", () => {
    expect(extractText(undefined)).toBe("");
    expect(extractText({})).toBe("");
    expect(extractText({ content: [] })).toBe("");
  });

  it("describes image blocks", () => {
    const result = {
      content: [{ type: "image", mimeType: "image/png", bytes: 2048, omitted: true }],
    };
    expect(extractText(result)).toBe("[image/png 2kb (omitted)]");
  });

  it("ignores unknown content types", () => {
    const result = {
      content: [{ type: "unknown", text: "ignored" }],
    };
    expect(extractText(result)).toBe("");
  });
});

describe("extractErrorText", () => {
  it("returns error from details.error", () => {
    const result = { details: { status: "error", error: "connection refused" } };
    expect(extractErrorText(result)).toBe("connection refused");
  });

  it("returns message from details.message", () => {
    const result = { details: { status: "error", message: "not found" } };
    expect(extractErrorText(result)).toBe("not found");
  });

  it("returns reason from details.reason", () => {
    const result = { details: { reason: "quota exceeded" } };
    expect(extractErrorText(result)).toBe("quota exceeded");
  });

  it("prefers error over message over reason", () => {
    const result = {
      details: { error: "err", message: "msg", reason: "rsn" },
    };
    expect(extractErrorText(result)).toBe("err");
  });

  it("returns empty string when no details", () => {
    expect(extractErrorText(undefined)).toBe("");
    expect(extractErrorText({})).toBe("");
    expect(extractErrorText({ details: {} })).toBe("");
  });

  it("skips whitespace-only values", () => {
    const result = { details: { error: "  ", message: "real error" } };
    expect(extractErrorText(result)).toBe("real error");
  });

  it("trims whitespace from error text", () => {
    const result = { details: { error: "  spaced out  " } };
    expect(extractErrorText(result)).toBe("spaced out");
  });

  // Regression: tool errors previously showed empty TUI message
  // because extractText only looked at content blocks, ignoring details.
  it("extracts error when content has no text blocks (regression)", () => {
    const result = {
      content: [],
      details: { status: "error", error: "openai embeddings failed: 429" },
    };
    // extractText returns "" for this result (no text blocks)
    expect(extractText(result)).toBe("");
    // extractErrorText should recover the error message
    expect(extractErrorText(result)).toBe("openai embeddings failed: 429");
  });
});
