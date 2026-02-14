import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture setText calls on the Markdown output widget
const markdownSetText = vi.fn();

vi.mock("@mariozechner/pi-tui", () => {
  class FakeComponent {
    addChild() {}
  }
  class Box extends FakeComponent {
    addChild() {}
    setBgFn() {}
  }
  class Text extends FakeComponent {
    setText() {}
  }
  class Markdown extends FakeComponent {
    setText(text: string) {
      markdownSetText(text);
    }
  }
  class Spacer extends FakeComponent {}
  class Container extends FakeComponent {
    addChild() {}
  }
  return { Box, Container, Markdown, Spacer, Text };
});

vi.mock("../../agents/tool-display.js", () => ({
  resolveToolDisplay: () => ({ emoji: "🔧", label: "Test Tool" }),
  formatToolDetail: () => "",
}));

vi.mock("../theme/theme.js", () => ({
  theme: {
    toolPendingBg: (l: string) => l,
    toolErrorBg: (l: string) => l,
    toolSuccessBg: (l: string) => l,
    toolTitle: (l: string) => l,
    toolOutput: (l: string) => l,
    bold: (l: string) => l,
    dim: (l: string) => l,
  },
  markdownTheme: {},
}));

import { extractText, extractErrorText, ToolExecutionComponent } from "./tool-execution.js";

beforeEach(() => {
  markdownSetText.mockClear();
});

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

  it("extracts error when content has no text blocks (regression)", () => {
    const result = {
      content: [],
      details: { status: "error", error: "openai embeddings failed: 429" },
    };
    expect(extractText(result)).toBe("");
    expect(extractErrorText(result)).toBe("openai embeddings failed: 429");
  });
});

describe("ToolExecutionComponent (integration)", () => {
  it("displays error text when tool result has no content but has details.error", () => {
    const component = new ToolExecutionComponent("test_tool", {});
    markdownSetText.mockClear();

    component.setResult(
      { content: [], details: { status: "error", error: "Command failed with exit code 1" } },
      { isError: true },
    );

    const lastCall = markdownSetText.mock.calls.at(-1)?.[0];
    expect(lastCall).toBe("Command failed with exit code 1");
  });

  it("displays error text from details.message", () => {
    const component = new ToolExecutionComponent("test_tool", {});
    markdownSetText.mockClear();

    component.setResult(
      { content: [], details: { status: "error", message: "Rate limit exceeded: 429" } },
      { isError: true },
    );

    const lastCall = markdownSetText.mock.calls.at(-1)?.[0];
    expect(lastCall).toBe("Rate limit exceeded: 429");
  });

  it("prefers content text over error fallback when both exist", () => {
    const component = new ToolExecutionComponent("test_tool", {});
    markdownSetText.mockClear();

    component.setResult(
      {
        content: [{ type: "text", text: "Detailed error output here" }],
        details: { status: "error", error: "short error" },
      },
      { isError: true },
    );

    const lastCall = markdownSetText.mock.calls.at(-1)?.[0];
    expect(lastCall).toBe("Detailed error output here");
  });

  it("shows empty string for non-error result with no content (not a regression)", () => {
    const component = new ToolExecutionComponent("test_tool", {});
    markdownSetText.mockClear();

    component.setResult({ content: [] }, { isError: false });

    const lastCall = markdownSetText.mock.calls.at(-1)?.[0];
    expect(lastCall).toBe("");
  });

  it("shows ellipsis for partial result with no content", () => {
    const component = new ToolExecutionComponent("test_tool", {});
    markdownSetText.mockClear();

    component.setPartialResult({ content: [] });

    const lastCall = markdownSetText.mock.calls.at(-1)?.[0];
    expect(lastCall).toBe("…");
  });
});
