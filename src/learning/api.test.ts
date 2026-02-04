import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { ensureLearningSchema, insertRunTrace, savePosterior } from "./store.js";
import { createLearningApiHandler } from "./api.js";
import { SEED_ARM_IDS } from "./strategy.js";
import type { RunTrace, ArmPosterior, LearningConfig } from "./types.js";

let db: DatabaseSync;
let tmpDir: string;

beforeEach(() => {
  const { DatabaseSync: DB } = require("node:sqlite") as typeof import("node:sqlite");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-api-test-"));
  db = new DB(path.join(tmpDir, "test.db"));
  ensureLearningSchema(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeTrace(overrides?: Partial<RunTrace>): RunTrace {
  return {
    traceId: `trace-${Math.random().toString(36).slice(2)}`,
    runId: "run-1",
    sessionId: "sess-1",
    timestamp: Date.now(),
    isBaseline: false,
    context: {},
    arms: [{ armId: "tool:exec:bash", included: true, referenced: true, tokenCost: 100 }],
    usage: { input: 300, output: 200, total: 500 },
    systemPromptChars: 5000,
    aborted: false,
    ...overrides,
  };
}

function mockReqRes(method: string, url: string) {
  const req = {
    method,
    url,
    headers: {},
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
    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res } = mockReqRes("GET", "/some/other/path");
    expect(await handler(req, res)).toBe(false);
  });

  it("returns 503 when DB unavailable", async () => {
    const handler = createLearningApiHandler({ getDb: () => null });
    const { req, res, getStatus, getBody } = mockReqRes(
      "GET",
      "/__openclaw__/api/learning/summary",
    );
    expect(await handler(req, res)).toBe(true);
    expect(getStatus()).toBe(503);
  });

  it("GET /summary returns summary", async () => {
    insertRunTrace(db, makeTrace());
    savePosterior(db, {
      armId: "tool:exec:bash",
      alpha: 3,
      beta: 1,
      pulls: 3,
      lastUpdated: Date.now(),
    });

    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/summary");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.traceCount).toBe(1);
    expect(data.armCount).toBe(1);
    expect(data.totalTokens).toBe(500);
  });

  it("GET /posteriors returns sorted posteriors", async () => {
    savePosterior(db, { armId: "a", alpha: 5, beta: 1, pulls: 5, lastUpdated: 1000 });
    savePosterior(db, { armId: "b", alpha: 1, beta: 5, pulls: 5, lastUpdated: 2000 });

    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/posteriors");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data).toHaveLength(2);
    expect(data[0].armId).toBe("a"); // higher mean
    expect(data[0].mean).toBeGreaterThan(data[1].mean);
  });

  it("GET /traces supports pagination", async () => {
    for (let i = 0; i < 5; i++) {
      insertRunTrace(db, makeTrace({ traceId: `t${i}`, timestamp: 1000 + i }));
    }

    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getBody } = mockReqRes(
      "GET",
      "/__openclaw__/api/learning/traces?limit=2&offset=1",
    );
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.total).toBe(5);
    expect(data.traces).toHaveLength(2);
  });

  it("GET /timeseries returns buckets", async () => {
    insertRunTrace(db, makeTrace({ timestamp: 1000000 }));

    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getBody } = mockReqRes(
      "GET",
      "/__openclaw__/api/learning/timeseries?metric=tokens&window=1h",
    );
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.buckets).toBeDefined();
    expect(Array.isArray(data.buckets)).toBe(true);
  });

  it("returns 404 for unknown routes", async () => {
    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getStatus } = mockReqRes("GET", "/__openclaw__/api/learning/unknown");
    await handler(req, res);
    expect(getStatus()).toBe(404);
  });

  it("returns 405 for non-GET methods", async () => {
    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getStatus } = mockReqRes("POST", "/__openclaw__/api/learning/summary");
    await handler(req, res);
    expect(getStatus()).toBe(405);
  });

  it("handles empty DB gracefully", async () => {
    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/summary");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.traceCount).toBe(0);
    expect(data.totalTokens).toBe(0);
  });

  describe("/config endpoint", () => {
    it("returns default config when getConfig not provided", async () => {
      const handler = createLearningApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/config");
      await handler(req, res);
      const data = JSON.parse(getBody());
      expect(data.enabled).toBe(false);
      expect(data.phase).toBe("passive");
      expect(data.tokenBudget).toBe(8000);
      expect(data.baselineRate).toBe(0.1);
      expect(data.minPulls).toBe(5);
      expect(data.seedArmIds).toEqual(SEED_ARM_IDS);
    });

    it("returns actual config when getConfig provided", async () => {
      const config: LearningConfig = {
        enabled: true,
        phase: "active",
        tokenBudget: 4000,
        baselineRate: 0.2,
        minPulls: 10,
      };
      const handler = createLearningApiHandler({ getDb: () => db, getConfig: () => config });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/config");
      await handler(req, res);
      const data = JSON.parse(getBody());
      expect(data.enabled).toBe(true);
      expect(data.phase).toBe("active");
      expect(data.tokenBudget).toBe(4000);
      expect(data.baselineRate).toBe(0.2);
      expect(data.minPulls).toBe(10);
    });
  });

  describe("/posteriors with Thompson context", () => {
    it("includes credible intervals", async () => {
      savePosterior(db, {
        armId: "tool:exec:Bash",
        alpha: 10,
        beta: 2,
        pulls: 11,
        lastUpdated: 1000,
      });

      const handler = createLearningApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/posteriors");
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data[0].credibleInterval).toBeDefined();
      expect(data[0].credibleInterval.lower).toBeGreaterThanOrEqual(0);
      expect(data[0].credibleInterval.upper).toBeLessThanOrEqual(1);
      expect(data[0].credibleInterval.lower).toBeLessThan(data[0].credibleInterval.upper);
    });

    it("marks seed arms correctly", async () => {
      savePosterior(db, {
        armId: "tool:fs:Read",
        alpha: 5,
        beta: 1,
        pulls: 5,
        lastUpdated: 1000,
      });
      savePosterior(db, {
        armId: "tool:custom:foo",
        alpha: 5,
        beta: 1,
        pulls: 5,
        lastUpdated: 1000,
      });

      const handler = createLearningApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/posteriors");
      await handler(req, res);
      const data = JSON.parse(getBody());

      const seedArm = data.find((p: { armId: string }) => p.armId === "tool:fs:Read");
      const nonSeedArm = data.find((p: { armId: string }) => p.armId === "tool:custom:foo");

      expect(seedArm.isSeed).toBe(true);
      expect(nonSeedArm.isSeed).toBe(false);
    });

    it("marks underexplored arms based on config", async () => {
      savePosterior(db, { armId: "arm-1", alpha: 3, beta: 1, pulls: 2, lastUpdated: 1000 });
      savePosterior(db, { armId: "arm-2", alpha: 8, beta: 2, pulls: 9, lastUpdated: 1000 });

      const config: LearningConfig = { enabled: true, phase: "active", minPulls: 5 };
      const handler = createLearningApiHandler({ getDb: () => db, getConfig: () => config });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/posteriors");
      await handler(req, res);
      const data = JSON.parse(getBody());

      const underexplored = data.find((p: { armId: string }) => p.armId === "arm-1");
      const explored = data.find((p: { armId: string }) => p.armId === "arm-2");

      expect(underexplored.isUnderexplored).toBe(true);
      expect(explored.isUnderexplored).toBe(false);
    });

    it("includes confidence levels", async () => {
      savePosterior(db, { armId: "low", alpha: 2, beta: 1, pulls: 2, lastUpdated: 1000 });
      savePosterior(db, { armId: "medium", alpha: 8, beta: 2, pulls: 9, lastUpdated: 1000 });
      savePosterior(db, { armId: "high", alpha: 20, beta: 5, pulls: 24, lastUpdated: 1000 });

      const handler = createLearningApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/posteriors");
      await handler(req, res);
      const data = JSON.parse(getBody());

      const low = data.find((p: { armId: string }) => p.armId === "low");
      const medium = data.find((p: { armId: string }) => p.armId === "medium");
      const high = data.find((p: { armId: string }) => p.armId === "high");

      expect(low.confidence).toBe("low");
      expect(medium.confidence).toBe("medium");
      expect(high.confidence).toBe("high");
    });
  });

  describe("/summary with baseline comparison", () => {
    it("includes baseline comparison stats", async () => {
      insertRunTrace(db, makeTrace({ isBaseline: true, usage: { total: 1000 } }));
      insertRunTrace(db, makeTrace({ isBaseline: true, usage: { total: 1200 } }));
      insertRunTrace(db, makeTrace({ isBaseline: false, usage: { total: 800 } }));
      insertRunTrace(db, makeTrace({ isBaseline: false, usage: { total: 600 } }));

      const handler = createLearningApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/summary");
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.baseline).toBeDefined();
      expect(data.baseline.baselineRuns).toBe(2);
      expect(data.baseline.selectedRuns).toBe(2);
      expect(data.baseline.baselineAvgTokens).toBe(1100); // (1000+1200)/2
      expect(data.baseline.selectedAvgTokens).toBe(700); // (800+600)/2
      expect(data.baseline.tokenSavingsPercent).toBeCloseTo(36.36, 1); // (1100-700)/1100*100
    });

    it("handles no baseline runs gracefully", async () => {
      insertRunTrace(db, makeTrace({ isBaseline: false }));

      const handler = createLearningApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/summary");
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.baseline.baselineRuns).toBe(0);
      expect(data.baseline.tokenSavingsPercent).toBeNull();
    });
  });
});
