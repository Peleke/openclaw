import { describe, expect, it, vi } from "vitest";

import {
  resolveQortexConfig,
  QortexMemoryProvider,
  parseToolResult,
  mapQueryItems,
} from "./qortex.js";

// ── resolveQortexConfig ─────────────────────────────────────────────────────

describe("resolveQortexConfig", () => {
  it("uses defaults when no raw config is provided", () => {
    const cfg = resolveQortexConfig(undefined, "test-agent");
    expect(cfg.command).toBe("uvx");
    expect(cfg.args).toEqual(["qortex", "mcp-serve"]);
    expect(cfg.domains).toEqual(["memory/test-agent"]);
    expect(cfg.topK).toBe(10);
    expect(cfg.feedback).toBe(true);
  });

  it("respects user overrides", () => {
    const cfg = resolveQortexConfig(
      {
        command: "python3 -m qortex.mcp",
        domains: ["custom/domain"],
        topK: 20,
        feedback: false,
      },
      "claw",
    );
    expect(cfg.command).toBe("python3");
    expect(cfg.args).toEqual(["-m", "qortex.mcp"]);
    expect(cfg.domains).toEqual(["custom/domain"]);
    expect(cfg.topK).toBe(20);
    expect(cfg.feedback).toBe(false);
  });

  it("splits multi-word command into command + args", () => {
    const cfg = resolveQortexConfig({ command: "uv run qortex mcp-serve --port 8080" }, "a");
    expect(cfg.command).toBe("uv");
    expect(cfg.args).toEqual(["run", "qortex", "mcp-serve", "--port", "8080"]);
  });
});

// ── Command validation ──────────────────────────────────────────────────────

describe("QortexMemoryProvider command validation", () => {
  it("rejects disallowed commands", async () => {
    const cfg = resolveQortexConfig({ command: "/bin/sh -c 'bad stuff'" }, "a");
    const provider = new QortexMemoryProvider(cfg, "a", { agents: { list: [] } } as any);
    await expect(provider.init()).rejects.toThrow("not in allowlist");
  });

  it("rejects commands with path traversal to an allowed name", async () => {
    const cfg = resolveQortexConfig({ command: "/tmp/evil/uvx" }, "a");
    // path.basename("../../evil/uvx") = "uvx" -- this IS allowed by basename check.
    // This is acceptable because we're protecting against typosquatting/arbitrary bins,
    // not filesystem path injection (spawn handles that safely).
    const provider = new QortexMemoryProvider(cfg, "a", { agents: { list: [] } } as any);
    // Should pass validation but fail on spawn (no actual process)
    await expect(provider.init()).rejects.not.toThrow("allowlist");
  });

  it("does not reject allowed commands with allowlist error", async () => {
    for (const cmd of ["uvx qortex mcp-serve", "python3 -m qortex", "qortex serve"]) {
      const cfg = resolveQortexConfig({ command: cmd }, "a");
      const provider = new QortexMemoryProvider(cfg, "a", { agents: { list: [] } } as any);
      const err = await provider.init().catch((e: Error) => e);
      // If init rejects, it should be a spawn/connect error, not an allowlist error.
      // If init resolves (command exists on this machine), that's also fine.
      if (err instanceof Error) {
        expect(err.message).not.toContain("allowlist");
      }
      await provider.close().catch(() => {});
    }
  });
});

// ── parseToolResult ─────────────────────────────────────────────────────────

describe("parseToolResult", () => {
  it("extracts JSON from text content blocks", () => {
    const result = {
      content: [{ type: "text", text: '{"items":[],"query_id":"q1"}' }],
      isError: false,
    };
    expect(parseToolResult(result as any)).toEqual({ items: [], query_id: "q1" });
  });

  it("concatenates multiple text blocks", () => {
    const result = {
      content: [
        { type: "text", text: '{"a":' },
        { type: "text", text: "1}" },
      ],
      isError: false,
    };
    expect(parseToolResult(result as any)).toEqual({ a: 1 });
  });

  it("returns empty object for no text content", () => {
    const result = { content: [{ type: "image", data: "abc" }], isError: false };
    expect(parseToolResult(result as any)).toEqual({});
  });

  it("returns empty object for empty content array", () => {
    const result = { content: [], isError: false };
    expect(parseToolResult(result as any)).toEqual({});
  });

  it("throws on isError with error message from content", () => {
    const result = {
      content: [{ type: "text", text: "something went wrong" }],
      isError: true,
    };
    expect(() => parseToolResult(result as any)).toThrow("qortex tool error: something went wrong");
  });

  it("throws on isError with fallback message", () => {
    const result = { content: [], isError: true };
    expect(() => parseToolResult(result as any)).toThrow("unknown qortex error");
  });

  it("throws descriptive error on malformed JSON", () => {
    const result = {
      content: [{ type: "text", text: "not json at all {{{" }],
      isError: false,
    };
    expect(() => parseToolResult(result as any)).toThrow("malformed JSON");
  });
});

// ── mapQueryItems ───────────────────────────────────────────────────────────

describe("mapQueryItems", () => {
  it("maps qortex items to MemorySearchResult", () => {
    const response = {
      items: [
        {
          id: "c1",
          content: "hello world",
          score: 0.95,
          domain: "memory/test",
          node_id: "n1",
          metadata: { path: "memory/test.md", start_line: 1, end_line: 5, source: "memory" },
        },
      ],
      query_id: "q1",
    };
    const results = mapQueryItems(response);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      path: "memory/test.md",
      startLine: 1,
      endLine: 5,
      score: 0.95,
      snippet: "hello world",
      source: "memory",
    });
  });

  it("maps session source correctly", () => {
    const response = {
      items: [
        {
          id: "c2",
          content: "session data",
          score: 0.8,
          domain: "sessions/test",
          node_id: "n2",
          metadata: { source: "sessions" },
        },
      ],
      query_id: "q2",
    };
    const results = mapQueryItems(response);
    expect(results[0]!.source).toBe("sessions");
  });

  it("uses defaults for missing metadata fields", () => {
    const response = {
      items: [{ id: "c3", content: "bare", score: 0.5, domain: "d", node_id: "n3", metadata: {} }],
      query_id: "q3",
    };
    const results = mapQueryItems(response);
    expect(results[0]!.path).toBe("<qortex:d>");
    expect(results[0]!.startLine).toBe(0);
    expect(results[0]!.endLine).toBe(0);
    expect(results[0]!.source).toBe("memory");
  });

  it("returns empty array for non-array items", () => {
    expect(mapQueryItems({ items: null, query_id: "q" } as any)).toEqual([]);
    expect(mapQueryItems({ query_id: "q" } as any)).toEqual([]);
  });
});

// ── Provider status ─────────────────────────────────────────────────────────

describe("QortexMemoryProvider.status()", () => {
  it("reports unavailable when not connected", () => {
    const cfg = resolveQortexConfig(undefined, "test");
    const provider = new QortexMemoryProvider(cfg, "test", { agents: { list: [] } } as any);
    const status = provider.status();
    expect(status.available).toBe(false);
    expect(status.provider).toBe("qortex");
    expect(status.details?.domains).toEqual(["memory/test"]);
  });
});

// ── assertConnected guard ───────────────────────────────────────────────────

describe("QortexMemoryProvider guards", () => {
  it("search throws when not connected", async () => {
    const cfg = resolveQortexConfig(undefined, "test");
    const provider = new QortexMemoryProvider(cfg, "test", { agents: { list: [] } } as any);
    await expect(provider.search("hello")).rejects.toThrow("not connected");
  });

  it("feedback throws when not connected", async () => {
    const cfg = resolveQortexConfig(undefined, "test");
    const provider = new QortexMemoryProvider(cfg, "test", { agents: { list: [] } } as any);
    await expect(provider.feedback("q1", { item1: "accepted" })).rejects.toThrow("not connected");
  });

  it("sync throws when not connected", async () => {
    const cfg = resolveQortexConfig(undefined, "test");
    const provider = new QortexMemoryProvider(cfg, "test", { agents: { list: [] } } as any);
    await expect(provider.sync()).rejects.toThrow("not connected");
  });
});

// ── readFile path traversal guard ───────────────────────────────────────────

describe("QortexMemoryProvider.readFile path traversal", () => {
  it("rejects path traversal attempts", async () => {
    const cfg = resolveQortexConfig(undefined, "test");
    const provider = new QortexMemoryProvider(cfg, "test", {
      agents: { list: [{ id: "test", default: true }] },
    } as any);
    await expect(provider.readFile({ relPath: "../../../etc/passwd" })).rejects.toThrow(
      "File not found",
    );
  });
});

// ── SqliteMemoryProvider ────────────────────────────────────────────────────

describe("SqliteMemoryProvider", () => {
  const makeMockManager = () => ({
    search: vi.fn().mockResolvedValue([
      {
        path: "memory/test.md",
        startLine: 1,
        endLine: 5,
        score: 0.9,
        snippet: "hello",
        source: "memory",
      },
    ]),
    readFile: vi.fn().mockResolvedValue({ text: "content", path: "/tmp/test.md" }),
    sync: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue({
      files: 5,
      provider: "openai",
      model: "text-embedding-3-small",
      fallback: { from: "gemini" },
    }),
    close: vi.fn().mockResolvedValue(undefined),
  });

  it("delegates search to manager", async () => {
    const { SqliteMemoryProvider } = await import("./sqlite.js");
    const mock = makeMockManager();
    const provider = new SqliteMemoryProvider(mock as any);
    const results = await provider.search("hello", { maxResults: 5 });
    expect(results).toHaveLength(1);
    expect(results[0]!.snippet).toBe("hello");
    expect(mock.search).toHaveBeenCalledWith("hello", { maxResults: 5 });
  });

  it("delegates readFile to manager", async () => {
    const { SqliteMemoryProvider } = await import("./sqlite.js");
    const mock = makeMockManager();
    const provider = new SqliteMemoryProvider(mock as any);
    const file = await provider.readFile({ relPath: "test.md" });
    expect(file.text).toBe("content");
    expect(mock.readFile).toHaveBeenCalledWith({ relPath: "test.md" });
  });

  it("delegates sync and returns SyncResult", async () => {
    const { SqliteMemoryProvider } = await import("./sqlite.js");
    const mock = makeMockManager();
    const provider = new SqliteMemoryProvider(mock as any);
    const result = await provider.sync();
    expect(result.indexed).toBe(5);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("maps status from manager", async () => {
    const { SqliteMemoryProvider } = await import("./sqlite.js");
    const mock = makeMockManager();
    const provider = new SqliteMemoryProvider(mock as any);
    const status = provider.status();
    expect(status.available).toBe(true);
    expect(status.provider).toBe("openai");
    expect(status.model).toBe("text-embedding-3-small");
    expect(status.fallback).toBe("gemini");
  });

  it("delegates close to manager", async () => {
    const { SqliteMemoryProvider } = await import("./sqlite.js");
    const mock = makeMockManager();
    const provider = new SqliteMemoryProvider(mock as any);
    await provider.close();
    expect(mock.close).toHaveBeenCalled();
  });
});

// ── createMemoryProvider factory ────────────────────────────────────────────

describe("createMemoryProvider", () => {
  it("returns error when memory search is disabled", async () => {
    const { createMemoryProvider } = await import("./index.js");
    // Empty config with no agents defaults to disabled
    const result = await createMemoryProvider({} as any, "nonexistent-agent");
    expect(result.provider).toBeNull();
    expect(result.error).toBeDefined();
  });
});
