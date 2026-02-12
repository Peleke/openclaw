import { describe, it, expect, beforeEach } from "vitest";
import {
  parseToolResult,
  parseCommandString,
  getSharedQortexConnection,
  setSharedQortexConnection,
} from "./connection.js";
import type { QortexConnection } from "./types.js";

describe("parseToolResult()", () => {
  it("parses JSON text content", () => {
    const result = parseToolResult({
      content: [{ type: "text", text: '{"selected_arms": ["a"]}' }],
    });
    expect(result).toEqual({ selected_arms: ["a"] });
  });

  it("concatenates multiple text parts", () => {
    const result = parseToolResult({
      content: [
        { type: "text", text: '{"a":' },
        { type: "text", text: "1}" },
      ],
    });
    expect(result).toEqual({ a: 1 });
  });

  it("ignores non-text content types", () => {
    const result = parseToolResult({
      content: [
        { type: "image", data: "..." },
        { type: "text", text: '{"ok": true}' },
      ],
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns empty object for empty text", () => {
    const result = parseToolResult({ content: [] });
    expect(result).toEqual({});
  });

  it("returns empty object for undefined content", () => {
    const result = parseToolResult({});
    expect(result).toEqual({});
  });

  it("throws on isError with error message", () => {
    expect(() =>
      parseToolResult({
        isError: true,
        content: [{ type: "text", text: "something went wrong" }],
      }),
    ).toThrow("qortex tool error: something went wrong");
  });

  it("throws on isError with generic message when no text", () => {
    expect(() => parseToolResult({ isError: true, content: [] })).toThrow(
      "qortex tool error: unknown qortex error",
    );
  });

  it("throws on malformed JSON", () => {
    expect(() =>
      parseToolResult({
        content: [{ type: "text", text: "not json {" }],
      }),
    ).toThrow("qortex returned malformed JSON");
  });

  it("handles text with undefined text field", () => {
    const result = parseToolResult({
      content: [{ type: "text" }],
    });
    expect(result).toEqual({});
  });
});

describe("parseCommandString()", () => {
  it("splits simple command", () => {
    const result = parseCommandString("uvx qortex mcp-serve");
    expect(result).toEqual({
      command: "uvx",
      args: ["qortex", "mcp-serve"],
    });
  });

  it("handles command with no args", () => {
    const result = parseCommandString("qortex");
    expect(result).toEqual({
      command: "qortex",
      args: [],
    });
  });

  it("handles multiple spaces between args", () => {
    const result = parseCommandString("uv  run   qortex");
    expect(result).toEqual({
      command: "uv",
      args: ["run", "qortex"],
    });
  });

  it("handles command with many arguments", () => {
    const result = parseCommandString("python3 -m qortex.mcp serve --port 8080");
    expect(result).toEqual({
      command: "python3",
      args: ["-m", "qortex.mcp", "serve", "--port", "8080"],
    });
  });
});

describe("shared qortex connection singleton", () => {
  beforeEach(() => {
    // Reset to undefined between tests
    setSharedQortexConnection(undefined as unknown as QortexConnection);
  });

  it("returns undefined when no connection has been set", () => {
    expect(getSharedQortexConnection()).toBeUndefined();
  });

  it("returns the connection after set", () => {
    const mock: QortexConnection = {
      isConnected: true,
      init: async () => {},
      callTool: async () => ({}),
      close: async () => {},
    };
    setSharedQortexConnection(mock);
    expect(getSharedQortexConnection()).toBe(mock);
  });

  it("replaces a previously set connection", () => {
    const first: QortexConnection = {
      isConnected: false,
      init: async () => {},
      callTool: async () => ({}),
      close: async () => {},
    };
    const second: QortexConnection = {
      isConnected: true,
      init: async () => {},
      callTool: async () => ({}),
      close: async () => {},
    };
    setSharedQortexConnection(first);
    setSharedQortexConnection(second);
    expect(getSharedQortexConnection()).toBe(second);
  });
});
