import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { RunTrace, ArmPosterior } from "./types.js";
import {
  ensureLearningSchema,
  insertRunTrace,
  listRunTraces,
  getRunTrace,
  loadPosteriors,
  savePosterior,
  countTraces,
  getTraceSummary,
  listRunTracesWithOffset,
  getTokenTimeseries,
} from "./store.js";

let db: InstanceType<typeof import("node:sqlite").DatabaseSync>;
let tmpDir: string;

beforeEach(() => {
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  db = new DatabaseSync(dbPath);
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
    sessionKey: "key-1",
    timestamp: Date.now(),
    provider: "anthropic",
    model: "claude-3",
    channel: "telegram",
    isBaseline: true,
    context: { sessionKey: "key-1" },
    arms: [
      { armId: "tool:exec:bash", included: true, referenced: true, tokenCost: 100 },
      { armId: "tool:fs:read", included: true, referenced: false, tokenCost: 50 },
    ],
    usage: { input: 500, output: 200, total: 700 },
    durationMs: 1234,
    systemPromptChars: 5000,
    aborted: false,
    ...overrides,
  };
}

describe("store", () => {
  describe("schema", () => {
    it("is idempotent", () => {
      // Should not throw when called again
      ensureLearningSchema(db);
      ensureLearningSchema(db);
    });
  });

  describe("run traces", () => {
    it("inserts and retrieves a trace", () => {
      const trace = makeTrace();
      insertRunTrace(db, trace);
      const loaded = getRunTrace(db, trace.traceId);
      expect(loaded).not.toBeNull();
      expect(loaded!.traceId).toBe(trace.traceId);
      expect(loaded!.arms).toHaveLength(2);
      expect(loaded!.isBaseline).toBe(true);
      expect(loaded!.usage).toEqual({ input: 500, output: 200, total: 700 });
    });

    it("lists traces newest-first", () => {
      const t1 = makeTrace({ traceId: "t1", timestamp: 1000 });
      const t2 = makeTrace({ traceId: "t2", timestamp: 2000 });
      const t3 = makeTrace({ traceId: "t3", timestamp: 3000 });
      insertRunTrace(db, t1);
      insertRunTrace(db, t2);
      insertRunTrace(db, t3);

      const traces = listRunTraces(db);
      expect(traces.map((t) => t.traceId)).toEqual(["t3", "t2", "t1"]);
    });

    it("filters by sessionKey", () => {
      insertRunTrace(db, makeTrace({ traceId: "a", sessionKey: "k1" }));
      insertRunTrace(db, makeTrace({ traceId: "b", sessionKey: "k2" }));

      const traces = listRunTraces(db, { sessionKey: "k1" });
      expect(traces).toHaveLength(1);
      expect(traces[0].sessionKey).toBe("k1");
    });

    it("respects limit", () => {
      for (let i = 0; i < 10; i++) {
        insertRunTrace(db, makeTrace({ traceId: `t${i}` }));
      }
      expect(listRunTraces(db, { limit: 3 })).toHaveLength(3);
    });

    it("returns empty for unknown trace", () => {
      expect(getRunTrace(db, "nonexistent")).toBeNull();
    });

    it("counts traces", () => {
      expect(countTraces(db)).toBe(0);
      insertRunTrace(db, makeTrace());
      insertRunTrace(db, makeTrace());
      expect(countTraces(db)).toBe(2);
    });

    it("returns empty list for empty DB", () => {
      expect(listRunTraces(db)).toEqual([]);
    });
  });

  describe("arm posteriors", () => {
    it("saves and loads posteriors", () => {
      const p: ArmPosterior = {
        armId: "tool:exec:bash",
        alpha: 5,
        beta: 2,
        pulls: 5,
        lastUpdated: Date.now(),
      };
      savePosterior(db, p);

      const posteriors = loadPosteriors(db);
      expect(posteriors.size).toBe(1);
      const loaded = posteriors.get("tool:exec:bash")!;
      expect(loaded.alpha).toBe(5);
      expect(loaded.beta).toBe(2);
      expect(loaded.pulls).toBe(5);
    });

    it("upserts on save", () => {
      savePosterior(db, {
        armId: "tool:exec:bash",
        alpha: 1,
        beta: 1,
        pulls: 0,
        lastUpdated: 1000,
      });
      savePosterior(db, {
        armId: "tool:exec:bash",
        alpha: 3,
        beta: 2,
        pulls: 3,
        lastUpdated: 2000,
      });

      const posteriors = loadPosteriors(db);
      expect(posteriors.size).toBe(1);
      expect(posteriors.get("tool:exec:bash")!.alpha).toBe(3);
    });

    it("returns empty map for empty DB", () => {
      expect(loadPosteriors(db).size).toBe(0);
    });
  });

  describe("aggregation queries", () => {
    it("getTraceSummary returns counts and totals", () => {
      insertRunTrace(db, makeTrace({ usage: { total: 300 } }));
      insertRunTrace(db, makeTrace({ usage: { total: 700 } }));
      savePosterior(db, {
        armId: "tool:exec:bash",
        alpha: 1,
        beta: 1,
        pulls: 0,
        lastUpdated: 1000,
      });

      const summary = getTraceSummary(db);
      expect(summary.traceCount).toBe(2);
      expect(summary.armCount).toBe(1);
      expect(summary.totalTokens).toBe(1000);
      expect(summary.minTimestamp).toBeDefined();
    });

    it("getTraceSummary handles empty DB", () => {
      const summary = getTraceSummary(db);
      expect(summary.traceCount).toBe(0);
      expect(summary.totalTokens).toBe(0);
    });

    it("listRunTracesWithOffset paginates", () => {
      for (let i = 0; i < 5; i++) {
        insertRunTrace(db, makeTrace({ traceId: `t${i}`, timestamp: 1000 + i }));
      }
      const result = listRunTracesWithOffset(db, { limit: 2, offset: 1 });
      expect(result.total).toBe(5);
      expect(result.traces).toHaveLength(2);
      // Ordered DESC, so offset=1 skips the newest
      expect(result.traces[0].traceId).toBe("t3");
    });

    it("getTokenTimeseries returns bucketed data", () => {
      insertRunTrace(db, makeTrace({ timestamp: 1_000_000, usage: { total: 500 } }));
      insertRunTrace(db, makeTrace({ timestamp: 2_000_000, usage: { total: 300 } }));
      const buckets = getTokenTimeseries(db, 3_600_000);
      expect(buckets.length).toBeGreaterThan(0);
      expect(buckets[0].t).toBeDefined();
      expect(buckets[0].value).toBeDefined();
    });
  });
});
