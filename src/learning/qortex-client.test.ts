import { describe, it, expect, vi } from "vitest";
import { QortexLearningClient } from "./qortex-client.js";
import type { QortexMcpConnection } from "../qortex/connection.js";

function mockConnection(overrides?: Partial<QortexMcpConnection>): QortexMcpConnection {
  return {
    isConnected: true,
    callTool: vi.fn(),
    callToolRaw: vi.fn(),
    init: vi.fn(),
    close: vi.fn(),
    ...overrides,
  } as unknown as QortexMcpConnection;
}

describe("QortexLearningClient", () => {
  describe("isAvailable", () => {
    it("returns true when connection is connected", () => {
      const conn = mockConnection({ isConnected: true });
      const client = new QortexLearningClient(conn);
      expect(client.isAvailable).toBe(true);
    });

    it("returns false when connection is disconnected", () => {
      const conn = mockConnection({ isConnected: false });
      const client = new QortexLearningClient(conn);
      expect(client.isAvailable).toBe(false);
    });
  });

  describe("select()", () => {
    it("calls qortex_learning_select with correct params", async () => {
      const mockResult = {
        selected_arms: ["a", "b"],
        excluded_arms: ["c"],
        is_baseline: false,
        scores: { a: 0.8, b: 0.6 },
        token_budget: 5000,
        used_tokens: 3000,
      };
      const conn = mockConnection({
        callTool: vi.fn(async () => mockResult),
      });
      const client = new QortexLearningClient(conn, "test-learner");

      const candidates = [
        { id: "a", metadata: { type: "tool" }, token_cost: 100 },
        { id: "b", token_cost: 200 },
        { id: "c", token_cost: 300 },
      ];
      const result = await client.select(candidates, {
        token_budget: 5000,
        context: { channel: "slack" },
        k: 2,
      });

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_select",
        {
          learner: "test-learner",
          candidates: [
            { id: "a", metadata: { type: "tool" }, token_cost: 100 },
            { id: "b", metadata: {}, token_cost: 200 },
            { id: "c", metadata: {}, token_cost: 300 },
          ],
          context: { channel: "slack" },
          k: 2,
          token_budget: 5000,
          min_pulls: 0,
        },
        { timeout: expect.any(Number) },
      );
      expect(result).toEqual(mockResult);
    });

    it("uses defaults when opts not provided", async () => {
      const conn = mockConnection({
        callTool: vi.fn(async () => ({
          selected_arms: ["a"],
          excluded_arms: [],
          is_baseline: true,
          scores: {},
          token_budget: 0,
          used_tokens: 0,
        })),
      });
      const client = new QortexLearningClient(conn);

      await client.select([{ id: "a" }]);

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_select",
        expect.objectContaining({
          learner: "openclaw",
          context: null,
          k: 0,
          token_budget: 0,
          min_pulls: 0,
        }),
        expect.any(Object),
      );
    });

    it("forwards min_pulls to qortex_learning_select", async () => {
      const conn = mockConnection({
        callTool: vi.fn(async () => ({
          selected_arms: ["a"],
          excluded_arms: [],
          is_baseline: false,
          scores: {},
          token_budget: 5000,
          used_tokens: 100,
        })),
      });
      const client = new QortexLearningClient(conn, "test-learner");

      await client.select([{ id: "a", token_cost: 100 }], {
        token_budget: 5000,
        min_pulls: 3,
      });

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_select",
        expect.objectContaining({ min_pulls: 3 }),
        expect.any(Object),
      );
    });

    it("normalizes object arm entries from qortex to string IDs", async () => {
      const conn = mockConnection({
        callTool: vi.fn(async () => ({
          selected_arms: [
            { id: "tool:exec:bash", metadata: {}, token_cost: 100 },
            "skill:coding:main",
          ],
          excluded_arms: [{ id: "file:workspace:notes.md", metadata: {}, token_cost: 50 }],
          is_baseline: false,
          scores: {},
          token_budget: 8000,
          used_tokens: 500,
        })),
      });
      const client = new QortexLearningClient(conn);

      const result = await client.select([{ id: "a" }]);

      expect(result.selected_arms).toEqual(["tool:exec:bash", "skill:coding:main"]);
      expect(result.excluded_arms).toEqual(["file:workspace:notes.md"]);
    });

    it("falls back to all candidates when connection unavailable", async () => {
      const conn = mockConnection({ isConnected: false });
      const client = new QortexLearningClient(conn);

      const result = await client.select([
        { id: "a", token_cost: 100 },
        { id: "b", token_cost: 200 },
      ]);

      expect(result.selected_arms).toEqual(["a", "b"]);
      expect(result.excluded_arms).toEqual([]);
      expect(result.is_baseline).toBe(true);
      expect(result.used_tokens).toBe(300);
    });

    it("falls back to all candidates when callTool throws", async () => {
      const conn = mockConnection({
        callTool: vi.fn(async () => {
          throw new Error("timeout");
        }),
      });
      const client = new QortexLearningClient(conn);

      const result = await client.select([
        { id: "a", token_cost: 100 },
        { id: "b", token_cost: 200 },
      ]);

      expect(result.selected_arms).toEqual(["a", "b"]);
      expect(result.is_baseline).toBe(true);
    });

    it("fallback respects token budget", async () => {
      const conn = mockConnection({ isConnected: false });
      const client = new QortexLearningClient(conn);

      const result = await client.select(
        [
          { id: "a", token_cost: 300 },
          { id: "b", token_cost: 300 },
          { id: "c", token_cost: 300 },
        ],
        { token_budget: 500 },
      );

      expect(result.selected_arms).toEqual(["a"]);
      expect(result.excluded_arms).toEqual(["b", "c"]);
      expect(result.token_budget).toBe(500);
      expect(result.used_tokens).toBe(300);
    });

    it("fallback includes all when budget is 0", async () => {
      const conn = mockConnection({ isConnected: false });
      const client = new QortexLearningClient(conn);

      const result = await client.select(
        [
          { id: "a", token_cost: 1000 },
          { id: "b", token_cost: 2000 },
        ],
        { token_budget: 0 },
      );

      expect(result.selected_arms).toEqual(["a", "b"]);
    });
  });

  describe("observe()", () => {
    it("calls qortex_learning_observe with correct params", async () => {
      const mockResult = { arm_id: "a", alpha: 3, beta: 1, mean: 0.75, pulls: 3 };
      const conn = mockConnection({
        callTool: vi.fn(async () => mockResult),
      });
      const client = new QortexLearningClient(conn, "test");

      const result = await client.observe("arm-1", "accepted", {
        reward: 1.0,
        context: { phase: "active" },
      });

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_observe",
        {
          learner: "test",
          arm_id: "arm-1",
          outcome: "accepted",
          reward: 1.0,
          context: { phase: "active" },
        },
        { timeout: expect.any(Number) },
      );
      expect(result).toEqual(mockResult);
    });

    it("returns null when connection unavailable", async () => {
      const conn = mockConnection({ isConnected: false });
      const client = new QortexLearningClient(conn);

      const result = await client.observe("a", "rejected");
      expect(result).toBeNull();
    });

    it("returns null when callTool throws", async () => {
      const conn = mockConnection({
        callTool: vi.fn(async () => {
          throw new Error("fail");
        }),
      });
      const client = new QortexLearningClient(conn);

      const result = await client.observe("a", "accepted");
      expect(result).toBeNull();
    });

    it("uses default reward and context when opts not provided", async () => {
      const conn = mockConnection({
        callTool: vi.fn(async () => ({ arm_id: "a", alpha: 1, beta: 1, mean: 0.5, pulls: 1 })),
      });
      const client = new QortexLearningClient(conn);

      await client.observe("a", "accepted");

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_observe",
        expect.objectContaining({ reward: 0.0, context: null }),
        expect.any(Object),
      );
    });
  });

  describe("posteriors()", () => {
    it("calls qortex_learning_posteriors and returns result", async () => {
      const mockResult = {
        learner: "openclaw",
        posteriors: {
          "arm-1": {
            alpha: 5,
            beta: 2,
            pulls: 6,
            total_reward: 4,
            last_updated: "2025-01-01",
            mean: 0.714,
          },
        },
      };
      const conn = mockConnection({
        callTool: vi.fn(async () => mockResult),
      });
      const client = new QortexLearningClient(conn, "openclaw");

      const result = await client.posteriors({ arm_ids: ["arm-1"] });

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_posteriors",
        { learner: "openclaw", context: null, arm_ids: ["arm-1"] },
        { timeout: expect.any(Number) },
      );
      expect(result).toEqual(mockResult);
    });

    it("returns null when unavailable", async () => {
      const conn = mockConnection({ isConnected: false });
      const client = new QortexLearningClient(conn);
      expect(await client.posteriors()).toBeNull();
    });

    it("returns null when callTool throws", async () => {
      const conn = mockConnection({
        callTool: vi.fn(async () => {
          throw new Error("fail");
        }),
      });
      const client = new QortexLearningClient(conn);
      expect(await client.posteriors()).toBeNull();
    });
  });

  describe("metrics()", () => {
    it("calls qortex_learning_metrics and returns result", async () => {
      const mockResult = {
        learner: "openclaw",
        total_pulls: 100,
        total_reward: 85,
        accuracy: 0.85,
        arm_count: 12,
        explore_ratio: 0.1,
      };
      const conn = mockConnection({
        callTool: vi.fn(async () => mockResult),
      });
      const client = new QortexLearningClient(conn);

      const result = await client.metrics({ window: 100 });

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_metrics",
        { learner: "openclaw", window: 100 },
        { timeout: expect.any(Number) },
      );
      expect(result).toEqual(mockResult);
    });

    it("returns null when unavailable", async () => {
      const conn = mockConnection({ isConnected: false });
      const client = new QortexLearningClient(conn);
      expect(await client.metrics()).toBeNull();
    });
  });

  describe("reset()", () => {
    it("calls qortex_learning_reset with all arms when no arm_ids", async () => {
      const mockResult = {
        learner: "openclaw",
        reset_count: 5,
        arm_ids: ["a", "b", "c", "d", "e"],
      };
      const conn = mockConnection({
        callTool: vi.fn(async () => mockResult),
      });
      const client = new QortexLearningClient(conn, "openclaw");

      const result = await client.reset();

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_reset",
        { learner: "openclaw", arm_ids: null },
        { timeout: expect.any(Number) },
      );
      expect(result).toEqual(mockResult);
    });

    it("calls qortex_learning_reset with specific arm_ids", async () => {
      const mockResult = { learner: "openclaw", reset_count: 2, arm_ids: ["a", "b"] };
      const conn = mockConnection({
        callTool: vi.fn(async () => mockResult),
      });
      const client = new QortexLearningClient(conn);

      const result = await client.reset({ arm_ids: ["a", "b"] });

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_reset",
        { learner: "openclaw", arm_ids: ["a", "b"] },
        { timeout: expect.any(Number) },
      );
      expect(result).toEqual(mockResult);
    });

    it("returns null when connection unavailable", async () => {
      const conn = mockConnection({ isConnected: false });
      const client = new QortexLearningClient(conn);
      expect(await client.reset()).toBeNull();
    });

    it("returns null when callTool throws", async () => {
      const conn = mockConnection({
        callTool: vi.fn(async () => {
          throw new Error("reset failed");
        }),
      });
      const client = new QortexLearningClient(conn);
      expect(await client.reset()).toBeNull();
    });
  });

  describe("sessionStart()", () => {
    it("calls qortex_learning_session_start", async () => {
      const conn = mockConnection({
        callTool: vi.fn(async () => ({ session_id: "s1", learner: "openclaw" })),
      });
      const client = new QortexLearningClient(conn);

      const result = await client.sessionStart("test-session");

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_session_start",
        { learner: "openclaw", session_name: "test-session" },
        { timeout: expect.any(Number) },
      );
      expect(result).toEqual({ session_id: "s1", learner: "openclaw" });
    });

    it("returns null when unavailable", async () => {
      const conn = mockConnection({ isConnected: false });
      const client = new QortexLearningClient(conn);
      expect(await client.sessionStart("s")).toBeNull();
    });
  });

  describe("sessionEnd()", () => {
    it("calls qortex_learning_session_end without learner param", async () => {
      const conn = mockConnection({
        callTool: vi.fn(async () => ({
          session_id: "s1",
          learner: "openclaw",
          selected_arms: [],
          outcomes: {},
          started_at: "2025-01-01",
          ended_at: "2025-01-01",
        })),
      });
      const client = new QortexLearningClient(conn);

      await client.sessionEnd("s1");

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_session_end",
        { session_id: "s1" },
        { timeout: expect.any(Number) },
      );
    });

    it("returns null when unavailable", async () => {
      const conn = mockConnection({ isConnected: false });
      const client = new QortexLearningClient(conn);
      expect(await client.sessionEnd("s1")).toBeNull();
    });
  });

  describe("custom learner name", () => {
    it("uses default learner name 'openclaw'", async () => {
      const conn = mockConnection({
        callTool: vi.fn(async () => null),
      });
      const client = new QortexLearningClient(conn);

      await client.metrics();

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_metrics",
        expect.objectContaining({ learner: "openclaw" }),
        expect.any(Object),
      );
    });

    it("uses custom learner name when provided", async () => {
      const conn = mockConnection({
        callTool: vi.fn(async () => null),
      });
      const client = new QortexLearningClient(conn, "my-project");

      await client.metrics();

      expect(conn.callTool).toHaveBeenCalledWith(
        "qortex_learning_metrics",
        expect.objectContaining({ learner: "my-project" }),
        expect.any(Object),
      );
    });
  });
});
