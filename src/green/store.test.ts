import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureGreenSchema,
  insertCarbonTrace,
  listCarbonTraces,
  countCarbonTraces,
  getCarbonSummary,
  getProviderBreakdown,
  getCarbonTimeseries,
} from "./store.js";
import type { CarbonTrace } from "./types.js";

let db: DatabaseSync;
let tmpDir: string;

function makeTrace(overrides: Partial<CarbonTrace> = {}): CarbonTrace {
  return {
    traceId: `t-${crypto.randomUUID()}`,
    runId: "run-1",
    sessionId: "session-1",
    timestamp: Date.now(),
    provider: "anthropic",
    model: "claude-sonnet",
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 0,
    inputCo2Grams: 0.15,
    outputCo2Grams: 0.225,
    cacheCo2Grams: 0,
    totalCo2Grams: 0.375,
    waterMl: 4.5,
    factorConfidence: 0.3,
    factorSource: "estimated",
    gridCarbonUsed: 400,
    aborted: false,
    ...overrides,
  };
}

beforeEach(() => {
  const { DatabaseSync: DB } = require("node:sqlite") as typeof import("node:sqlite");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "green-store-test-"));
  db = new DB(path.join(tmpDir, "test.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  ensureGreenSchema(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("green store", () => {
  describe("ensureGreenSchema", () => {
    it("creates carbon_traces table", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;
      expect(tables.some((t) => t.name === "carbon_traces")).toBe(true);
    });

    it("creates timestamp index", () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all() as Array<{ name: string }>;
      expect(indexes.some((i) => i.name === "idx_carbon_traces_timestamp")).toBe(true);
    });

    it("creates provider index", () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all() as Array<{ name: string }>;
      expect(indexes.some((i) => i.name === "idx_carbon_traces_provider")).toBe(true);
    });

    it("creates session index", () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all() as Array<{ name: string }>;
      expect(indexes.some((i) => i.name === "idx_carbon_traces_session")).toBe(true);
    });

    it("is idempotent", () => {
      expect(() => ensureGreenSchema(db)).not.toThrow();
      expect(() => ensureGreenSchema(db)).not.toThrow();
      expect(() => ensureGreenSchema(db)).not.toThrow();
    });
  });

  describe("insertCarbonTrace / listCarbonTraces", () => {
    it("inserts and retrieves trace", () => {
      const trace = makeTrace();
      insertCarbonTrace(db, trace);

      const { traces, total } = listCarbonTraces(db, { limit: 10 });
      expect(total).toBe(1);
      expect(traces).toHaveLength(1);
      expect(traces[0].traceId).toBe(trace.traceId);
      expect(traces[0].totalCo2Grams).toBe(trace.totalCo2Grams);
    });

    it("stores all required fields", () => {
      const trace = makeTrace({
        traceId: "test-123",
        runId: "run-456",
        sessionId: "session-789",
        sessionKey: "key-abc",
        timestamp: 1700000000000,
        provider: "openai",
        model: "gpt-4o",
        channel: "telegram",
        inputTokens: 2000,
        outputTokens: 1000,
        cacheReadTokens: 500,
        inputCo2Grams: 0.4,
        outputCo2Grams: 0.6,
        cacheCo2Grams: 0.01,
        totalCo2Grams: 1.01,
        waterMl: 14.0,
        factorConfidence: 0.35,
        factorSource: "research",
        gridCarbonUsed: 350,
        durationMs: 1500,
        aborted: false,
      });
      insertCarbonTrace(db, trace);

      const { traces } = listCarbonTraces(db);
      const loaded = traces[0];

      expect(loaded.traceId).toBe("test-123");
      expect(loaded.runId).toBe("run-456");
      expect(loaded.sessionId).toBe("session-789");
      expect(loaded.sessionKey).toBe("key-abc");
      expect(loaded.timestamp).toBe(1700000000000);
      expect(loaded.provider).toBe("openai");
      expect(loaded.model).toBe("gpt-4o");
      expect(loaded.channel).toBe("telegram");
      expect(loaded.inputTokens).toBe(2000);
      expect(loaded.outputTokens).toBe(1000);
      expect(loaded.cacheReadTokens).toBe(500);
      expect(loaded.totalCo2Grams).toBeCloseTo(1.01, 2);
      expect(loaded.factorConfidence).toBeCloseTo(0.35, 2);
      expect(loaded.factorSource).toBe("research");
      expect(loaded.gridCarbonUsed).toBe(350);
      expect(loaded.durationMs).toBe(1500);
      expect(loaded.aborted).toBe(false);
    });

    it("handles optional fields as undefined", () => {
      const trace = makeTrace({
        sessionKey: undefined,
        channel: undefined,
        durationMs: undefined,
        error: undefined,
      });
      insertCarbonTrace(db, trace);

      const { traces } = listCarbonTraces(db);
      expect(traces[0].sessionKey).toBeUndefined();
      expect(traces[0].channel).toBeUndefined();
      expect(traces[0].durationMs).toBeUndefined();
      expect(traces[0].error).toBeUndefined();
    });

    it("stores error state", () => {
      const trace = makeTrace({
        aborted: true,
        error: "Test error message",
      });
      insertCarbonTrace(db, trace);

      const { traces } = listCarbonTraces(db);
      expect(traces[0].aborted).toBe(true);
      expect(traces[0].error).toBe("Test error message");
    });

    it("orders by timestamp descending", () => {
      insertCarbonTrace(db, makeTrace({ traceId: "t1", timestamp: 1000 }));
      insertCarbonTrace(db, makeTrace({ traceId: "t2", timestamp: 3000 }));
      insertCarbonTrace(db, makeTrace({ traceId: "t3", timestamp: 2000 }));

      const { traces } = listCarbonTraces(db);
      expect(traces[0].traceId).toBe("t2");
      expect(traces[1].traceId).toBe("t3");
      expect(traces[2].traceId).toBe("t1");
    });

    it("respects limit", () => {
      for (let i = 0; i < 10; i++) {
        insertCarbonTrace(db, makeTrace({ traceId: `t${i}`, timestamp: 1000 + i }));
      }

      const { traces, total } = listCarbonTraces(db, { limit: 3 });
      expect(total).toBe(10);
      expect(traces).toHaveLength(3);
    });

    it("respects offset", () => {
      for (let i = 0; i < 10; i++) {
        insertCarbonTrace(db, makeTrace({ traceId: `t${i}`, timestamp: 1000 + i }));
      }

      const { traces, total } = listCarbonTraces(db, { limit: 3, offset: 2 });
      expect(total).toBe(10);
      expect(traces).toHaveLength(3);
      // Should skip the 2 newest (t9, t8) and return t7, t6, t5
      expect(traces[0].traceId).toBe("t7");
    });

    it("upserts on duplicate traceId", () => {
      const trace1 = makeTrace({ traceId: "dup", totalCo2Grams: 1.0 });
      const trace2 = makeTrace({ traceId: "dup", totalCo2Grams: 2.0 });

      insertCarbonTrace(db, trace1);
      insertCarbonTrace(db, trace2);

      const { traces, total } = listCarbonTraces(db);
      expect(total).toBe(1);
      expect(traces[0].totalCo2Grams).toBe(2.0);
    });

    it("returns empty array for empty DB", () => {
      const { traces, total } = listCarbonTraces(db);
      expect(total).toBe(0);
      expect(traces).toEqual([]);
    });
  });

  describe("countCarbonTraces", () => {
    it("returns 0 for empty DB", () => {
      expect(countCarbonTraces(db)).toBe(0);
    });

    it("returns correct count", () => {
      insertCarbonTrace(db, makeTrace());
      insertCarbonTrace(db, makeTrace());
      insertCarbonTrace(db, makeTrace());
      expect(countCarbonTraces(db)).toBe(3);
    });
  });

  describe("getCarbonSummary", () => {
    it("returns zeros for empty DB", () => {
      const summary = getCarbonSummary(db);
      expect(summary.traceCount).toBe(0);
      expect(summary.totalCo2Grams).toBe(0);
      expect(summary.totalWaterMl).toBe(0);
      expect(summary.avgCo2PerTrace).toBe(0);
      expect(summary.avgConfidence).toBe(0);
      expect(summary.minTimestamp).toBeNull();
      expect(summary.maxTimestamp).toBeNull();
    });

    it("aggregates CO2 correctly", () => {
      insertCarbonTrace(db, makeTrace({ totalCo2Grams: 10 }));
      insertCarbonTrace(db, makeTrace({ totalCo2Grams: 20 }));
      insertCarbonTrace(db, makeTrace({ totalCo2Grams: 30 }));

      const summary = getCarbonSummary(db);
      expect(summary.traceCount).toBe(3);
      expect(summary.totalCo2Grams).toBe(60);
      expect(summary.avgCo2PerTrace).toBe(20);
    });

    it("aggregates water correctly", () => {
      insertCarbonTrace(db, makeTrace({ waterMl: 100 }));
      insertCarbonTrace(db, makeTrace({ waterMl: 200 }));

      const summary = getCarbonSummary(db);
      expect(summary.totalWaterMl).toBe(300);
    });

    it("calculates average confidence", () => {
      insertCarbonTrace(db, makeTrace({ factorConfidence: 0.2 }));
      insertCarbonTrace(db, makeTrace({ factorConfidence: 0.4 }));

      const summary = getCarbonSummary(db);
      expect(summary.avgConfidence).toBeCloseTo(0.3, 2);
    });

    it("tracks timestamp range", () => {
      insertCarbonTrace(db, makeTrace({ timestamp: 1000 }));
      insertCarbonTrace(db, makeTrace({ timestamp: 3000 }));
      insertCarbonTrace(db, makeTrace({ timestamp: 2000 }));

      const summary = getCarbonSummary(db);
      expect(summary.minTimestamp).toBe(1000);
      expect(summary.maxTimestamp).toBe(3000);
    });
  });

  describe("getProviderBreakdown", () => {
    it("returns empty array for empty DB", () => {
      expect(getProviderBreakdown(db)).toEqual([]);
    });

    it("groups by provider", () => {
      insertCarbonTrace(db, makeTrace({ provider: "anthropic", totalCo2Grams: 100 }));
      insertCarbonTrace(db, makeTrace({ provider: "anthropic", totalCo2Grams: 50 }));
      insertCarbonTrace(db, makeTrace({ provider: "openai", totalCo2Grams: 50 }));

      const breakdown = getProviderBreakdown(db);
      expect(breakdown).toHaveLength(2);

      const anthropic = breakdown.find((b) => b.provider === "anthropic");
      expect(anthropic?.traceCount).toBe(2);
      expect(anthropic?.totalCo2Grams).toBe(150);
      expect(anthropic?.percentage).toBeCloseTo(75, 1);

      const openai = breakdown.find((b) => b.provider === "openai");
      expect(openai?.traceCount).toBe(1);
      expect(openai?.totalCo2Grams).toBe(50);
      expect(openai?.percentage).toBeCloseTo(25, 1);
    });

    it("orders by CO2 descending", () => {
      insertCarbonTrace(db, makeTrace({ provider: "small", totalCo2Grams: 10 }));
      insertCarbonTrace(db, makeTrace({ provider: "large", totalCo2Grams: 100 }));
      insertCarbonTrace(db, makeTrace({ provider: "medium", totalCo2Grams: 50 }));

      const breakdown = getProviderBreakdown(db);
      expect(breakdown[0].provider).toBe("large");
      expect(breakdown[1].provider).toBe("medium");
      expect(breakdown[2].provider).toBe("small");
    });

    it("excludes traces with null provider", () => {
      insertCarbonTrace(db, makeTrace({ provider: "anthropic", totalCo2Grams: 100 }));
      insertCarbonTrace(db, makeTrace({ provider: undefined, totalCo2Grams: 50 }));

      const breakdown = getProviderBreakdown(db);
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0].provider).toBe("anthropic");
    });

    it("calculates percentages correctly", () => {
      insertCarbonTrace(db, makeTrace({ provider: "a", totalCo2Grams: 25 }));
      insertCarbonTrace(db, makeTrace({ provider: "b", totalCo2Grams: 25 }));
      insertCarbonTrace(db, makeTrace({ provider: "c", totalCo2Grams: 50 }));

      const breakdown = getProviderBreakdown(db);
      expect(breakdown.find((b) => b.provider === "c")?.percentage).toBeCloseTo(50, 1);
      expect(breakdown.find((b) => b.provider === "a")?.percentage).toBeCloseTo(25, 1);
      expect(breakdown.find((b) => b.provider === "b")?.percentage).toBeCloseTo(25, 1);
    });
  });

  describe("getCarbonTimeseries", () => {
    it("returns empty array for empty DB", () => {
      expect(getCarbonTimeseries(db, 3600000)).toEqual([]);
    });

    it("buckets by time window", () => {
      // Insert traces - timestamps will be bucketed
      insertCarbonTrace(db, makeTrace({ timestamp: 0, totalCo2Grams: 10 }));
      insertCarbonTrace(db, makeTrace({ timestamp: 1000, totalCo2Grams: 20 }));
      insertCarbonTrace(db, makeTrace({ timestamp: 3600000, totalCo2Grams: 30 }));

      const buckets = getCarbonTimeseries(db, 3600000); // 1 hour window
      // Should have at least 2 buckets (one for early timestamps, one for 3600000)
      expect(buckets.length).toBeGreaterThanOrEqual(2);
      // Total CO2 across all buckets should be 60
      const totalCo2 = buckets.reduce((sum, b) => sum + b.co2Grams, 0);
      expect(totalCo2).toBe(60);
      // Total trace count should be 3
      const totalTraces = buckets.reduce((sum, b) => sum + b.traceCount, 0);
      expect(totalTraces).toBe(3);
    });

    it("aggregates CO2 within buckets", () => {
      insertCarbonTrace(db, makeTrace({ timestamp: 100, totalCo2Grams: 5 }));
      insertCarbonTrace(db, makeTrace({ timestamp: 200, totalCo2Grams: 10 }));
      insertCarbonTrace(db, makeTrace({ timestamp: 300, totalCo2Grams: 15 }));

      const buckets = getCarbonTimeseries(db, 1000); // 1 second buckets
      // All 3 traces should be in bucket 0
      expect(buckets[0].co2Grams).toBe(30);
      expect(buckets[0].traceCount).toBe(3);
    });

    it("orders buckets by time ascending", () => {
      insertCarbonTrace(db, makeTrace({ timestamp: 10000, totalCo2Grams: 10 }));
      insertCarbonTrace(db, makeTrace({ timestamp: 0, totalCo2Grams: 5 }));
      insertCarbonTrace(db, makeTrace({ timestamp: 5000, totalCo2Grams: 7 }));

      const buckets = getCarbonTimeseries(db, 5000);
      expect(buckets[0].t).toBeLessThan(buckets[1].t);
    });

    it("handles different window sizes", () => {
      insertCarbonTrace(db, makeTrace({ timestamp: 0, totalCo2Grams: 10 }));
      insertCarbonTrace(db, makeTrace({ timestamp: 86400000, totalCo2Grams: 20 }));

      const hourBuckets = getCarbonTimeseries(db, 3600000);
      const dayBuckets = getCarbonTimeseries(db, 86400000);

      // Day buckets should have fewer entries
      expect(dayBuckets.length).toBeLessThanOrEqual(hourBuckets.length);
    });
  });
});
