import { describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockFeedback = vi.fn();
const mockGetMemoryProvider = vi.fn();

vi.mock("../../memory/search-manager.js", () => ({
  getMemoryProvider: (...args: unknown[]) => mockGetMemoryProvider(...args),
}));

// Mock resolveMemorySearchConfig to return qortex config
vi.mock("../memory-search.js", () => ({
  resolveMemorySearchConfig: (_cfg: unknown, _agentId: string) => ({
    enabled: true,
    sources: ["memory"],
    extraPaths: [],
    provider: "qortex",
    qortex: { command: "uvx", domains: ["memory/test"], topK: 10, feedback: true },
  }),
}));

import { createMemoryFeedbackTool } from "./memory-tool.js";

const makeCfg = () => ({ agents: { list: [{ id: "main", default: true }] } });

// ── Tool creation ──────────────────────────────────────────────────────────

describe("createMemoryFeedbackTool", () => {
  it("returns a tool when provider is qortex with feedback enabled", () => {
    const tool = createMemoryFeedbackTool({ config: makeCfg() as any });
    expect(tool).not.toBeNull();
    expect(tool!.name).toBe("memory_feedback");
  });

  it("returns null when config is missing", () => {
    const tool = createMemoryFeedbackTool({});
    expect(tool).toBeNull();
  });
});

// ── Execute: happy path ────────────────────────────────────────────────────

describe("memory_feedback execute", () => {
  it("sends feedback to qortex provider", async () => {
    mockFeedback.mockResolvedValue(undefined);
    mockGetMemoryProvider.mockResolvedValue({
      provider: { feedback: mockFeedback },
    });

    const tool = createMemoryFeedbackTool({ config: makeCfg() as any })!;
    const result = await tool.execute("call_1", {
      query_id: "q-123",
      item_id: "item-1",
      outcome: "accepted",
    });

    expect(result.details).toEqual({ ok: true });
    expect(mockFeedback).toHaveBeenCalledWith("q-123", { "item-1": "accepted" });
  });

  it("sends rejected feedback", async () => {
    mockFeedback.mockResolvedValue(undefined);
    mockGetMemoryProvider.mockResolvedValue({
      provider: { feedback: mockFeedback },
    });

    const tool = createMemoryFeedbackTool({ config: makeCfg() as any })!;
    const result = await tool.execute("call_2", {
      query_id: "q-456",
      item_id: "item-2",
      outcome: "rejected",
    });

    expect(result.details).toEqual({ ok: true });
    expect(mockFeedback).toHaveBeenCalledWith("q-456", { "item-2": "rejected" });
  });

  it("sends partial feedback", async () => {
    mockFeedback.mockResolvedValue(undefined);
    mockGetMemoryProvider.mockResolvedValue({
      provider: { feedback: mockFeedback },
    });

    const tool = createMemoryFeedbackTool({ config: makeCfg() as any })!;
    const result = await tool.execute("call_3", {
      query_id: "q-789",
      item_id: "item-3",
      outcome: "partial",
    });

    expect(result.details).toEqual({ ok: true });
    expect(mockFeedback).toHaveBeenCalledWith("q-789", { "item-3": "partial" });
  });
});

// ── Execute: validation ────────────────────────────────────────────────────

describe("memory_feedback validation", () => {
  it("rejects invalid outcome values", async () => {
    const tool = createMemoryFeedbackTool({ config: makeCfg() as any })!;
    const result = await tool.execute("call_4", {
      query_id: "q-1",
      item_id: "item-1",
      outcome: "invalid_value",
    });

    expect(result.details).toEqual({
      ok: false,
      error: 'outcome must be "accepted", "rejected", or "partial"',
    });
  });
});

// ── Execute: provider unavailable ──────────────────────────────────────────

describe("memory_feedback when provider unavailable", () => {
  it("returns error when provider is null", async () => {
    mockGetMemoryProvider.mockResolvedValue({
      provider: null,
      error: "memory search disabled",
    });

    const tool = createMemoryFeedbackTool({ config: makeCfg() as any })!;
    const result = await tool.execute("call_5", {
      query_id: "q-1",
      item_id: "item-1",
      outcome: "accepted",
    });

    expect(result.details).toEqual({ ok: false, error: "memory search disabled" });
  });

  it("skips gracefully when provider lacks feedback method", async () => {
    mockGetMemoryProvider.mockResolvedValue({
      provider: { search: vi.fn(), status: vi.fn() }, // no feedback method
    });

    const tool = createMemoryFeedbackTool({ config: makeCfg() as any })!;
    const result = await tool.execute("call_6", {
      query_id: "q-1",
      item_id: "item-1",
      outcome: "accepted",
    });

    expect(result.details).toEqual({
      ok: true,
      skipped: true,
      reason: "provider does not support feedback",
    });
  });
});

// ── Execute: error handling ────────────────────────────────────────────────

describe("memory_feedback error handling", () => {
  it("catches and returns provider errors", async () => {
    mockFeedback.mockRejectedValue(new Error("qortex tool error: connection lost"));
    mockGetMemoryProvider.mockResolvedValue({
      provider: { feedback: mockFeedback },
    });

    const tool = createMemoryFeedbackTool({ config: makeCfg() as any })!;
    const result = await tool.execute("call_7", {
      query_id: "q-1",
      item_id: "item-1",
      outcome: "accepted",
    });

    expect(result.details).toEqual({
      ok: false,
      error: "qortex tool error: connection lost",
    });
  });

  it("handles non-Error thrown values", async () => {
    mockFeedback.mockRejectedValue("string error");
    mockGetMemoryProvider.mockResolvedValue({
      provider: { feedback: mockFeedback },
    });

    const tool = createMemoryFeedbackTool({ config: makeCfg() as any })!;
    const result = await tool.execute("call_8", {
      query_id: "q-1",
      item_id: "item-1",
      outcome: "rejected",
    });

    expect(result.details).toEqual({ ok: false, error: "string error" });
  });
});
