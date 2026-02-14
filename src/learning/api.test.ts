import { describe, it, expect, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createLearningApiHandler } from "./api.js";
import type { QortexLearningClient } from "./qortex-client.js";
import type { LearningConfig } from "./types.js";

function mockClient(overrides?: Partial<QortexLearningClient>): QortexLearningClient {
  return {
    isAvailable: true,
    select: vi.fn(),
    observe: vi.fn(),
    reset: vi.fn(async () => ({ learner: "openclaw", reset_count: 0, arm_ids: [] })),
    posteriors: vi.fn(async () => ({
      learner: "openclaw",
      posteriors: {},
    })),
    metrics: vi.fn(async () => ({
      learner: "openclaw",
      total_pulls: 0,
      total_reward: 0,
      accuracy: 0,
      arm_count: 0,
      explore_ratio: 0,
    })),
    sessionStart: vi.fn(),
    sessionEnd: vi.fn(),
    ...overrides,
  } as unknown as QortexLearningClient;
}

function mockReqRes(method: string, url: string, jsonBody?: Record<string, unknown>) {
  // Simulate a readable stream with optional JSON body
  const bodyStr = jsonBody ? JSON.stringify(jsonBody) : "";
  const req = {
    method,
    url,
    headers: { "content-type": "application/json" },
    on(event: string, cb: (...args: unknown[]) => void) {
      if (event === "data" && bodyStr) cb(Buffer.from(bodyStr));
      if (event === "end") cb();
      // "error" is registered but never fired in tests
    },
  } as unknown as IncomingMessage;
  let statusCode = 0;
  let body = "";
  const headers: Record<string, string> = {};
  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(v: number) {
      statusCode = v;
    },
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    end(data?: string) {
      body = data ?? "";
    },
  } as unknown as ServerResponse;
  return { req, res, getStatus: () => statusCode, getBody: () => body, getHeaders: () => headers };
}

describe("learning API handler", () => {
  it("returns false for non-learning URLs", async () => {
    const handler = createLearningApiHandler({ getClient: () => mockClient() });
    const { req, res } = mockReqRes("GET", "/some/other/path");
    expect(await handler(req, res)).toBe(false);
  });

  it("returns 503 when client is null", async () => {
    const handler = createLearningApiHandler({ getClient: () => null });
    const { req, res, getStatus } = mockReqRes("GET", "/__openclaw__/api/learning/summary");
    expect(await handler(req, res)).toBe(true);
    expect(getStatus()).toBe(503);
  });

  it("returns 503 when client not connected", async () => {
    const client = mockClient({ isAvailable: false } as unknown as Partial<QortexLearningClient>);
    const handler = createLearningApiHandler({ getClient: () => client });
    const { req, res, getStatus } = mockReqRes("GET", "/__openclaw__/api/learning/summary");
    expect(await handler(req, res)).toBe(true);
    expect(getStatus()).toBe(503);
  });

  it("GET /summary returns metrics from qortex", async () => {
    const client = mockClient({
      metrics: vi.fn(async () => ({
        learner: "openclaw",
        total_pulls: 42,
        total_reward: 35.5,
        accuracy: 0.845,
        arm_count: 7,
        explore_ratio: 0.15,
      })),
    } as unknown as Partial<QortexLearningClient>);

    const handler = createLearningApiHandler({ getClient: () => client });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/summary");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.traceCount).toBe(42);
    expect(data.armCount).toBe(7);
    expect(data.accuracy).toBe(0.845);
    expect(data.exploreRatio).toBe(0.15);
    expect(data.totalReward).toBe(35.5);
  });

  it("GET /metrics is alias for /summary", async () => {
    const client = mockClient({
      metrics: vi.fn(async () => ({
        learner: "openclaw",
        total_pulls: 10,
        total_reward: 8,
        accuracy: 0.8,
        arm_count: 3,
        explore_ratio: 0.1,
      })),
    } as unknown as Partial<QortexLearningClient>);

    const handler = createLearningApiHandler({ getClient: () => client });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/metrics");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.traceCount).toBe(10);
  });

  it("GET /summary returns 503 when metrics fail", async () => {
    const client = mockClient({
      metrics: vi.fn(async () => null),
    } as unknown as Partial<QortexLearningClient>);

    const handler = createLearningApiHandler({ getClient: () => client });
    const { req, res, getStatus } = mockReqRes("GET", "/__openclaw__/api/learning/summary");
    await handler(req, res);
    expect(getStatus()).toBe(503);
  });

  it("GET /posteriors converts map to sorted array", async () => {
    const client = mockClient({
      posteriors: vi.fn(async () => ({
        learner: "openclaw",
        posteriors: {
          "tool:exec:bash": {
            alpha: 5,
            beta: 1,
            pulls: 5,
            total_reward: 4.2,
            last_updated: "2025-01-01T00:00:00Z",
            mean: 0.833,
          },
          "tool:fs:Read": {
            alpha: 1,
            beta: 5,
            pulls: 5,
            total_reward: 0.8,
            last_updated: "2025-01-02T00:00:00Z",
            mean: 0.167,
          },
        },
      })),
    } as unknown as Partial<QortexLearningClient>);

    const handler = createLearningApiHandler({ getClient: () => client });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/posteriors");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data).toHaveLength(2);
    // Sorted by mean descending
    expect(data[0].armId).toBe("tool:exec:bash");
    expect(data[0].mean).toBe(0.833);
    expect(data[1].armId).toBe("tool:fs:Read");
    expect(data[1].mean).toBe(0.167);
  });

  it("GET /posteriors returns 503 when posteriors fail", async () => {
    const client = mockClient({
      posteriors: vi.fn(async () => null),
    } as unknown as Partial<QortexLearningClient>);

    const handler = createLearningApiHandler({ getClient: () => client });
    const { req, res, getStatus } = mockReqRes("GET", "/__openclaw__/api/learning/posteriors");
    await handler(req, res);
    expect(getStatus()).toBe(503);
  });

  it("GET /posteriors marks underexplored arms based on config minPulls", async () => {
    const client = mockClient({
      posteriors: vi.fn(async () => ({
        learner: "openclaw",
        posteriors: {
          "low-pulls": {
            alpha: 2,
            beta: 1,
            pulls: 2,
            total_reward: 1.5,
            last_updated: "2025-01-01T00:00:00Z",
            mean: 0.667,
          },
          "high-pulls": {
            alpha: 8,
            beta: 2,
            pulls: 9,
            total_reward: 7.2,
            last_updated: "2025-01-01T00:00:00Z",
            mean: 0.8,
          },
        },
      })),
    } as unknown as Partial<QortexLearningClient>);

    const config: LearningConfig = { enabled: true, phase: "active", minPulls: 5 };
    const handler = createLearningApiHandler({ getClient: () => client, getConfig: () => config });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/posteriors");
    await handler(req, res);
    const data = JSON.parse(getBody());

    const underexplored = data.find((p: { armId: string }) => p.armId === "low-pulls");
    const explored = data.find((p: { armId: string }) => p.armId === "high-pulls");
    expect(underexplored.isUnderexplored).toBe(true);
    expect(explored.isUnderexplored).toBe(false);
  });

  it("GET /posteriors assigns confidence levels", async () => {
    const client = mockClient({
      posteriors: vi.fn(async () => ({
        learner: "openclaw",
        posteriors: {
          low: {
            alpha: 2,
            beta: 1,
            pulls: 3,
            total_reward: 1,
            last_updated: "2025-01-01T00:00:00Z",
            mean: 0.5,
          },
          med: {
            alpha: 5,
            beta: 5,
            pulls: 10,
            total_reward: 5,
            last_updated: "2025-01-01T00:00:00Z",
            mean: 0.5,
          },
          high: {
            alpha: 20,
            beta: 5,
            pulls: 25,
            total_reward: 20,
            last_updated: "2025-01-01T00:00:00Z",
            mean: 0.8,
          },
        },
      })),
    } as unknown as Partial<QortexLearningClient>);

    const handler = createLearningApiHandler({ getClient: () => client });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/posteriors");
    await handler(req, res);
    const data = JSON.parse(getBody());

    expect(data.find((p: { armId: string }) => p.armId === "low").confidence).toBe("low");
    expect(data.find((p: { armId: string }) => p.armId === "med").confidence).toBe("medium");
    expect(data.find((p: { armId: string }) => p.armId === "high").confidence).toBe("high");
  });

  it("GET /config returns default config when getConfig not provided", async () => {
    const handler = createLearningApiHandler({ getClient: () => mockClient() });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/config");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.enabled).toBe(false);
    expect(data.phase).toBe("passive");
    expect(data.tokenBudget).toBe(8000);
    expect(data.baselineRate).toBe(0.1);
    expect(data.minPulls).toBe(5);
    expect(data.backend).toBe("qortex");
  });

  it("GET /config returns actual config when provided", async () => {
    const config: LearningConfig = {
      enabled: true,
      phase: "active",
      tokenBudget: 4000,
      baselineRate: 0.2,
      minPulls: 10,
    };
    const handler = createLearningApiHandler({
      getClient: () => mockClient(),
      getConfig: () => config,
    });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/config");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.enabled).toBe(true);
    expect(data.phase).toBe("active");
    expect(data.tokenBudget).toBe(4000);
  });

  it("GET /traces returns placeholder", async () => {
    const handler = createLearningApiHandler({ getClient: () => mockClient() });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/traces");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.traces).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("GET /timeseries returns placeholder", async () => {
    const handler = createLearningApiHandler({ getClient: () => mockClient() });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/timeseries");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.buckets).toEqual([]);
  });

  it("returns 404 for unknown routes", async () => {
    const handler = createLearningApiHandler({ getClient: () => mockClient() });
    const { req, res, getStatus } = mockReqRes("GET", "/__openclaw__/api/learning/unknown");
    await handler(req, res);
    expect(getStatus()).toBe(404);
  });

  it("returns 405 for non-GET methods on GET-only routes", async () => {
    const handler = createLearningApiHandler({ getClient: () => mockClient() });
    const { req, res, getStatus } = mockReqRes("POST", "/__openclaw__/api/learning/summary");
    await handler(req, res);
    expect(getStatus()).toBe(405);
  });

  describe("POST /reset", () => {
    it("resets all arms when no body", async () => {
      const resetFn = vi.fn(async () => ({
        learner: "openclaw",
        reset_count: 5,
        arm_ids: ["a", "b", "c", "d", "e"],
      }));
      const client = mockClient({ reset: resetFn } as unknown as Partial<QortexLearningClient>);
      const handler = createLearningApiHandler({ getClient: () => client });
      const { req, res, getBody, getStatus } = mockReqRes(
        "POST",
        "/__openclaw__/api/learning/reset",
      );
      await handler(req, res);
      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());
      expect(data.reset_count).toBe(5);
      expect(resetFn).toHaveBeenCalledWith(undefined);
    });

    it("resets specific arms when arm_ids provided", async () => {
      const resetFn = vi.fn(async () => ({
        learner: "openclaw",
        reset_count: 2,
        arm_ids: ["a", "b"],
      }));
      const client = mockClient({ reset: resetFn } as unknown as Partial<QortexLearningClient>);
      const handler = createLearningApiHandler({ getClient: () => client });
      const { req, res, getStatus } = mockReqRes("POST", "/__openclaw__/api/learning/reset", {
        arm_ids: ["a", "b"],
      });
      await handler(req, res);
      expect(getStatus()).toBe(200);
      expect(resetFn).toHaveBeenCalledWith({ arm_ids: ["a", "b"] });
    });

    it("returns 503 when reset fails", async () => {
      const client = mockClient({
        reset: vi.fn(async () => null),
      } as unknown as Partial<QortexLearningClient>);
      const handler = createLearningApiHandler({ getClient: () => client });
      const { req, res, getStatus } = mockReqRes("POST", "/__openclaw__/api/learning/reset");
      await handler(req, res);
      expect(getStatus()).toBe(503);
    });

    it("returns 405 for GET on /reset", async () => {
      const handler = createLearningApiHandler({ getClient: () => mockClient() });
      const { req, res, getStatus } = mockReqRes("GET", "/__openclaw__/api/learning/reset");
      await handler(req, res);
      expect(getStatus()).toBe(405);
    });
  });

  describe("POST /reward", () => {
    it("records a lagged reward observation", async () => {
      const observeFn = vi.fn(async () => ({
        arm_id: "tool:web:web_search",
        alpha: 3,
        beta: 1,
        mean: 0.75,
        pulls: 3,
      }));
      const client = mockClient({ observe: observeFn });
      const handler = createLearningApiHandler({ getClient: () => client });
      const { req, res, getBody, getStatus } = mockReqRes(
        "POST",
        "/__openclaw__/api/learning/reward",
        { arm_id: "tool:web:web_search", outcome: "accepted", reward: 1.0, reason: "useful" },
      );
      await handler(req, res);
      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());
      expect(data.ok).toBe(true);
      expect(data.arm_id).toBe("tool:web:web_search");
      expect(observeFn).toHaveBeenCalledWith(
        "tool:web:web_search",
        "accepted",
        expect.objectContaining({
          reward: 1.0,
          context: { lagged: true, reason: "useful" },
        }),
      );
    });

    it("defaults to accepted with reward 1.0 when outcome not specified", async () => {
      const observeFn = vi.fn(async () => ({
        arm_id: "a",
        alpha: 2,
        beta: 1,
        mean: 0.67,
        pulls: 2,
      }));
      const client = mockClient({ observe: observeFn });
      const handler = createLearningApiHandler({ getClient: () => client });
      const { req, res, getStatus } = mockReqRes("POST", "/__openclaw__/api/learning/reward", {
        arm_id: "a",
      });
      await handler(req, res);
      expect(getStatus()).toBe(200);
      expect(observeFn).toHaveBeenCalledWith(
        "a",
        "accepted",
        expect.objectContaining({ reward: 1.0, context: { lagged: true } }),
      );
    });

    it("returns 400 when arm_id missing", async () => {
      const handler = createLearningApiHandler({ getClient: () => mockClient() });
      const { req, res, getStatus } = mockReqRes("POST", "/__openclaw__/api/learning/reward", {
        outcome: "accepted",
      });
      await handler(req, res);
      expect(getStatus()).toBe(400);
    });

    it("returns 503 when observe fails", async () => {
      const client = mockClient({
        observe: vi.fn(async () => null),
      });
      const handler = createLearningApiHandler({ getClient: () => client });
      const { req, res, getStatus } = mockReqRes("POST", "/__openclaw__/api/learning/reward", {
        arm_id: "a",
      });
      await handler(req, res);
      expect(getStatus()).toBe(503);
    });

    it("returns 405 for GET on /reward", async () => {
      const handler = createLearningApiHandler({ getClient: () => mockClient() });
      const { req, res, getStatus } = mockReqRes("GET", "/__openclaw__/api/learning/reward");
      await handler(req, res);
      expect(getStatus()).toBe(405);
    });
  });

  it("sets CORS header on responses", async () => {
    const handler = createLearningApiHandler({ getClient: () => mockClient() });
    const { req, res, getHeaders } = mockReqRes("GET", "/__openclaw__/api/learning/config");
    await handler(req, res);
    expect(getHeaders()["Access-Control-Allow-Origin"]).toBeDefined();
  });

  describe("GET /dashboard", () => {
    it("returns HTML dashboard", async () => {
      const handler = createLearningApiHandler({ getClient: () => mockClient() });
      const { req, res, getBody, getStatus, getHeaders } = mockReqRes(
        "GET",
        "/__openclaw__/api/learning/dashboard",
      );
      await handler(req, res);

      expect(getStatus()).toBe(200);
      expect(getHeaders()["Content-Type"]).toContain("text/html");
      expect(getHeaders()["Cache-Control"]).toBe("no-store");
      expect(getBody()).toContain("<!DOCTYPE html>");
      expect(getBody()).toContain("Learning Dashboard");
    });

    it("serves dashboard even when client is null", async () => {
      const handler = createLearningApiHandler({ getClient: () => null });
      const { req, res, getBody, getStatus } = mockReqRes(
        "GET",
        "/__openclaw__/api/learning/dashboard",
      );
      await handler(req, res);

      expect(getStatus()).toBe(200);
      expect(getBody()).toContain("Learning Dashboard");
    });

    it("returns 405 for non-GET methods on dashboard", async () => {
      const handler = createLearningApiHandler({ getClient: () => mockClient() });

      for (const method of ["POST", "PUT", "DELETE"]) {
        const { req, res, getStatus } = mockReqRes(method, "/__openclaw__/api/learning/dashboard");
        await handler(req, res);
        expect(getStatus()).toBe(405);
      }
    });

    it("handles trailing slash on dashboard route", async () => {
      const handler = createLearningApiHandler({ getClient: () => mockClient() });
      const { req, res, getStatus, getBody } = mockReqRes(
        "GET",
        "/__openclaw__/api/learning/dashboard/",
      );
      await handler(req, res);

      expect(getStatus()).toBe(200);
      expect(getBody()).toContain("Learning Dashboard");
    });

    it("bypasses client null-check (serves before client gate)", async () => {
      const handler = createLearningApiHandler({ getClient: () => null });
      const {
        req: reqSummary,
        res: resSummary,
        getStatus: getSumStatus,
      } = mockReqRes("GET", "/__openclaw__/api/learning/summary");
      await handler(reqSummary, resSummary);
      expect(getSumStatus()).toBe(503);

      const {
        req: reqDash,
        res: resDash,
        getStatus: getDashStatus,
      } = mockReqRes("GET", "/__openclaw__/api/learning/dashboard");
      await handler(reqDash, resDash);
      expect(getDashStatus()).toBe(200);
    });
  });
});
