import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { RunTrace, ArmPosterior, LearningConfig } from "./types.js";
import { ensureLearningSchema, loadPosteriors, savePosterior } from "./store.js";
import {
  updatePosteriors,
  batchUpdatePosteriors,
  getPosteriorStats,
  type UpdatePosteriorsResult,
} from "./update.js";

let db: InstanceType<typeof import("node:sqlite").DatabaseSync>;
let tmpDir: string;

beforeEach(() => {
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-update-test-"));
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
    isBaseline: false,
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

function makeConfig(overrides?: Partial<LearningConfig>): LearningConfig {
  return {
    enabled: true,
    phase: "active",
    strategy: "thompson",
    tokenBudget: 8000,
    baselineRate: 0.1,
    minPulls: 5,
    ...overrides,
  };
}

describe("updatePosteriors", () => {
  describe("phase checks", () => {
    it("skips update in passive phase", () => {
      const trace = makeTrace();
      const config = makeConfig({ phase: "passive" });

      const result = updatePosteriors({ db, trace, config });

      expect(result.updated).toBe(0);
      expect(result.created).toBe(0);
      expect(loadPosteriors(db).size).toBe(0);
    });

    it("updates in active phase", () => {
      const trace = makeTrace();
      const config = makeConfig({ phase: "active" });

      const result = updatePosteriors({ db, trace, config });

      expect(result.updated + result.created).toBeGreaterThan(0);
    });
  });

  describe("aborted/errored runs", () => {
    it("skips aborted runs", () => {
      const trace = makeTrace({ aborted: true });
      const config = makeConfig();

      const result = updatePosteriors({ db, trace, config });

      expect(result.updated).toBe(0);
      expect(result.created).toBe(0);
    });

    it("skips errored runs", () => {
      const trace = makeTrace({ error: "some error" });
      const config = makeConfig();

      const result = updatePosteriors({ db, trace, config });

      expect(result.updated).toBe(0);
      expect(result.created).toBe(0);
    });
  });

  describe("reward calculation", () => {
    it("increments alpha for referenced arms (reward=1)", () => {
      const trace = makeTrace({
        arms: [{ armId: "tool:exec:bash", included: true, referenced: true, tokenCost: 100 }],
      });
      const config = makeConfig();

      updatePosteriors({ db, trace, config });

      const posteriors = loadPosteriors(db);
      const posterior = posteriors.get("tool:exec:bash")!;
      // Initial curated prior is (3, 1), after success becomes (4, 1)
      expect(posterior.alpha).toBe(4);
      expect(posterior.beta).toBe(1);
    });

    it("increments beta for unreferenced arms (reward=0)", () => {
      const trace = makeTrace({
        arms: [{ armId: "tool:fs:read", included: true, referenced: false, tokenCost: 50 }],
      });
      const config = makeConfig();

      updatePosteriors({ db, trace, config });

      const posteriors = loadPosteriors(db);
      const posterior = posteriors.get("tool:fs:read")!;
      // Initial curated prior is (3, 1), after failure becomes (3, 2)
      expect(posterior.alpha).toBe(3);
      expect(posterior.beta).toBe(2);
    });
  });

  describe("included/excluded arms", () => {
    it("only updates included arms", () => {
      const trace = makeTrace({
        arms: [
          { armId: "tool:included:one", included: true, referenced: true, tokenCost: 100 },
          { armId: "tool:excluded:two", included: false, referenced: false, tokenCost: 50 },
        ],
      });
      const config = makeConfig();

      updatePosteriors({ db, trace, config });

      const posteriors = loadPosteriors(db);
      expect(posteriors.has("tool:included:one")).toBe(true);
      expect(posteriors.has("tool:excluded:two")).toBe(false);
    });
  });

  describe("existing vs new posteriors", () => {
    it("creates new posteriors for unknown arms", () => {
      const trace = makeTrace({
        arms: [{ armId: "tool:new:arm", included: true, referenced: true, tokenCost: 100 }],
      });
      const config = makeConfig();

      const result = updatePosteriors({ db, trace, config });

      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
    });

    it("updates existing posteriors", () => {
      // Pre-populate a posterior
      savePosterior(db, {
        armId: "tool:existing:arm",
        alpha: 5,
        beta: 3,
        pulls: 7,
        lastUpdated: 1000,
      });

      const trace = makeTrace({
        arms: [{ armId: "tool:existing:arm", included: true, referenced: true, tokenCost: 100 }],
      });
      const config = makeConfig();

      const result = updatePosteriors({ db, trace, config });

      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);

      const posteriors = loadPosteriors(db);
      const posterior = posteriors.get("tool:existing:arm")!;
      expect(posterior.alpha).toBe(6); // 5 + 1
      expect(posterior.beta).toBe(3); // unchanged
      expect(posterior.pulls).toBe(8); // 7 + 1
    });
  });

  describe("file arms use learned prior", () => {
    it("uses neutral prior (1,1) for file arms", () => {
      const trace = makeTrace({
        arms: [
          { armId: "file:workspace:README.md", included: true, referenced: true, tokenCost: 200 },
        ],
      });
      const config = makeConfig();

      updatePosteriors({ db, trace, config });

      const posteriors = loadPosteriors(db);
      const posterior = posteriors.get("file:workspace:README.md")!;
      // Initial learned prior is (1, 1), after success becomes (2, 1)
      expect(posterior.alpha).toBe(2);
      expect(posterior.beta).toBe(1);
    });
  });
});

describe("batchUpdatePosteriors", () => {
  it("processes multiple traces", () => {
    const traces = [
      makeTrace({
        arms: [{ armId: "tool:a:one", included: true, referenced: true, tokenCost: 100 }],
      }),
      makeTrace({
        arms: [{ armId: "tool:b:two", included: true, referenced: false, tokenCost: 100 }],
      }),
      makeTrace({
        arms: [{ armId: "tool:a:one", included: true, referenced: true, tokenCost: 100 }],
      }),
    ];
    const config = makeConfig();

    const result = batchUpdatePosteriors(db, traces, config);

    expect(result.updated + result.created).toBeGreaterThan(0);

    const posteriors = loadPosteriors(db);
    expect(posteriors.has("tool:a:one")).toBe(true);
    expect(posteriors.has("tool:b:two")).toBe(true);

    // tool:a:one should have 2 successes
    const posteriorA = posteriors.get("tool:a:one")!;
    expect(posteriorA.pulls).toBe(2);
  });

  it("handles empty trace array", () => {
    const result = batchUpdatePosteriors(db, [], makeConfig());
    expect(result.updated).toBe(0);
    expect(result.created).toBe(0);
  });
});

describe("getPosteriorStats", () => {
  it("returns null for unknown arm", () => {
    const posteriors = new Map<string, ArmPosterior>();
    const stats = getPosteriorStats(posteriors, "unknown:arm:id");
    expect(stats).toBeNull();
  });

  it("returns correct stats for known arm", () => {
    const posteriors = new Map<string, ArmPosterior>();
    posteriors.set("tool:known:arm", {
      armId: "tool:known:arm",
      alpha: 8,
      beta: 2,
      pulls: 8,
      lastUpdated: Date.now(),
    });

    const stats = getPosteriorStats(posteriors, "tool:known:arm");

    expect(stats).not.toBeNull();
    expect(stats!.mean).toBeCloseTo(0.8); // 8 / (8+2)
    expect(stats!.pulls).toBe(8);
    expect(stats!.confidence).toBe("medium"); // 5 <= 8 < 20
  });

  it("returns high confidence for many pulls", () => {
    const posteriors = new Map<string, ArmPosterior>();
    posteriors.set("tool:well:explored", {
      armId: "tool:well:explored",
      alpha: 25,
      beta: 5,
      pulls: 28,
      lastUpdated: Date.now(),
    });

    const stats = getPosteriorStats(posteriors, "tool:well:explored");
    expect(stats!.confidence).toBe("high");
  });

  it("returns low confidence for few pulls", () => {
    const posteriors = new Map<string, ArmPosterior>();
    posteriors.set("tool:under:explored", {
      armId: "tool:under:explored",
      alpha: 2,
      beta: 1,
      pulls: 1,
      lastUpdated: Date.now(),
    });

    const stats = getPosteriorStats(posteriors, "tool:under:explored");
    expect(stats!.confidence).toBe("low");
  });
});
