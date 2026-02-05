import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { ensureLearningSchema, insertRunTrace, savePosterior } from "./store.js";
import {
  formatLearningStatus,
  formatLearningStatusFromApi,
  type LearningStatusApiData,
} from "./cli-status.js";
import type { RunTrace, LearningConfig } from "./types.js";

let db: DatabaseSync;
let tmpDir: string;

beforeEach(() => {
  const { DatabaseSync: DB } = require("node:sqlite") as typeof import("node:sqlite");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-cli-test-"));
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
    usage: { total: 500 },
    systemPromptChars: 5000,
    aborted: false,
    ...overrides,
  };
}

describe("formatLearningStatus", () => {
  it("shows empty state message for empty DB", () => {
    const output = formatLearningStatus(db);
    expect(output).toContain("No traces recorded yet");
  });

  it("shows summary with trace count", () => {
    insertRunTrace(db, makeTrace());
    savePosterior(db, {
      armId: "tool:exec:bash",
      alpha: 5,
      beta: 1,
      pulls: 5,
      lastUpdated: Date.now(),
    });
    const output = formatLearningStatus(db);
    expect(output).toContain("Learning Layer Status");
    expect(output).toContain("Arm");
    expect(output).toContain("Mean");
    expect(output).toContain("Pulls");
  });

  it("shows top and bottom arms when enough posteriors", () => {
    insertRunTrace(db, makeTrace());
    for (let i = 0; i < 8; i++) {
      savePosterior(db, {
        armId: `tool:cat:arm${i}`,
        alpha: 10 - i,
        beta: i + 1,
        pulls: 10,
        lastUpdated: Date.now(),
      });
    }
    const output = formatLearningStatus(db);
    expect(output).toContain("Top Arms");
    expect(output).toContain("Bottom Arms");
  });

  it("shows phase badge in output", () => {
    const config: LearningConfig = { enabled: true, phase: "active" };
    const output = formatLearningStatus({ db, config });
    expect(output).toContain("[ACTIVE]");
  });

  it("shows passive phase by default", () => {
    const output = formatLearningStatus({ db });
    expect(output).toContain("[PASSIVE]");
  });

  it("shows config info when provided", () => {
    const config: LearningConfig = {
      enabled: true,
      phase: "active",
      tokenBudget: 4000,
      baselineRate: 0.2,
      minPulls: 10,
    };
    const output = formatLearningStatus({ db, config });
    expect(output).toContain("Budget: 4,000");
    expect(output).toContain("Baseline: 20%");
    expect(output).toContain("Min pulls: 10");
  });

  it("shows run distribution with baseline/selected counts", () => {
    insertRunTrace(db, makeTrace({ isBaseline: true, usage: { total: 1000 } }));
    insertRunTrace(db, makeTrace({ isBaseline: true, usage: { total: 1200 } }));
    insertRunTrace(db, makeTrace({ isBaseline: false, usage: { total: 800 } }));

    const output = formatLearningStatus({ db });
    expect(output).toContain("Run Distribution");
    expect(output).toContain("Baseline:");
    expect(output).toContain("Selected:");
  });

  it("shows token savings percentage", () => {
    insertRunTrace(db, makeTrace({ isBaseline: true, usage: { total: 1000 } }));
    insertRunTrace(db, makeTrace({ isBaseline: false, usage: { total: 800 } }));

    const output = formatLearningStatus({ db });
    expect(output).toContain("Token Savings:");
    expect(output).toContain("20.0%");
  });

  it("supports legacy signature with just db", () => {
    insertRunTrace(db, makeTrace());
    const output = formatLearningStatus(db);
    expect(output).toContain("Learning Layer Status");
  });
});

// -- Tests for formatLearningStatusFromApi --

function makeApiData(overrides?: Partial<LearningStatusApiData>): LearningStatusApiData {
  return {
    summary: {
      traceCount: 20,
      armCount: 5,
      minTimestamp: Date.now() - 86400000,
      maxTimestamp: Date.now(),
      totalTokens: 100000,
      baseline: {
        baselineRuns: 5,
        selectedRuns: 15,
        baselineAvgTokens: 6000,
        selectedAvgTokens: 4500,
        tokenSavingsPercent: 25.0,
        baselineAvgDuration: null,
        selectedAvgDuration: null,
      },
      ...(overrides?.summary ?? {}),
    },
    config: {
      phase: "active",
      tokenBudget: 8000,
      baselineRate: 0.1,
      minPulls: 5,
      ...(overrides?.config ?? {}),
    },
    posteriors: overrides?.posteriors ?? [
      {
        armId: "tool:exec:bash",
        alpha: 15,
        beta: 3,
        pulls: 17,
        lastUpdated: Date.now(),
        mean: 0.833,
      },
      {
        armId: "tool:fs:Read",
        alpha: 12,
        beta: 2,
        pulls: 13,
        lastUpdated: Date.now(),
        mean: 0.857,
      },
      {
        armId: "tool:fs:Write",
        alpha: 8,
        beta: 4,
        pulls: 11,
        lastUpdated: Date.now(),
        mean: 0.667,
      },
      {
        armId: "tool:search:Grep",
        alpha: 6,
        beta: 6,
        pulls: 11,
        lastUpdated: Date.now(),
        mean: 0.5,
      },
      { armId: "tool:exec:curl", alpha: 2, beta: 8, pulls: 9, lastUpdated: Date.now(), mean: 0.2 },
    ],
  };
}

describe("formatLearningStatusFromApi", () => {
  it("renders status from API data without needing a database", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("Learning Layer Status");
    expect(output).toContain("[ACTIVE]");
  });

  it("shows PASSIVE badge when phase is passive", () => {
    const output = formatLearningStatusFromApi(makeApiData({ config: { phase: "passive" } }));
    expect(output).toContain("[PASSIVE]");
    expect(output).not.toContain("[ACTIVE]");
  });

  it("shows config info from API data", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("Budget: 8,000");
    expect(output).toContain("Baseline: 10%");
    expect(output).toContain("Min pulls: 5");
  });

  it("shows custom config values", () => {
    const output = formatLearningStatusFromApi(
      makeApiData({
        config: { phase: "active", tokenBudget: 4000, baselineRate: 0.2, minPulls: 10 },
      }),
    );
    expect(output).toContain("Budget: 4,000");
    expect(output).toContain("Baseline: 20%");
    expect(output).toContain("Min pulls: 10");
  });

  it("shows trace count and arm count", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("20");
    expect(output).toContain("5");
    expect(output).toContain("100,000");
  });

  it("shows run distribution with baseline/selected counts", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("Run Distribution");
    expect(output).toContain("Baseline:");
    expect(output).toContain("Selected:");
  });

  it("shows token savings percentage from baseline comparison", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("Token Savings:");
    expect(output).toContain("25.0%");
  });

  it("handles null tokenSavingsPercent gracefully", () => {
    const data = makeApiData();
    data.summary.baseline.tokenSavingsPercent = null;
    const output = formatLearningStatusFromApi(data);
    expect(output).toContain("Run Distribution");
    expect(output).not.toContain("Token Savings:");
  });

  it("shows top arms table when posteriors are present", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("Top Arms");
    expect(output).toContain("tool:exec:bash");
    expect(output).toContain("Arm");
    expect(output).toContain("Mean");
    expect(output).toContain("Pulls");
  });

  it("shows empty state for zero traces", () => {
    const data = makeApiData();
    data.summary.traceCount = 0;
    const output = formatLearningStatusFromApi(data);
    expect(output).toContain("No traces recorded yet");
  });

  it("shows bottom arms when more than 5 posteriors", () => {
    const posteriors = Array.from({ length: 8 }, (_, i) => ({
      armId: `tool:cat:arm${i}`,
      alpha: 10 - i,
      beta: i + 1,
      pulls: 10,
      lastUpdated: Date.now(),
      mean: (10 - i) / (10 - i + i + 1),
    }));
    const output = formatLearningStatusFromApi(makeApiData({ posteriors }));
    expect(output).toContain("Top Arms");
    expect(output).toContain("Bottom Arms");
  });

  it("does not show bottom arms when 5 or fewer posteriors", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("Top Arms");
    expect(output).not.toContain("Bottom Arms");
  });

  it("handles no config values gracefully", () => {
    const output = formatLearningStatusFromApi(makeApiData({ config: { phase: "passive" } }));
    expect(output).toContain("[PASSIVE]");
    // No config parts should be shown
    expect(output).not.toContain("Budget:");
  });

  it("handles empty posteriors array", () => {
    const output = formatLearningStatusFromApi(makeApiData({ posteriors: [] }));
    expect(output).toContain("No arm posteriors yet.");
  });

  it("shows baseline avg and selected avg in savings line", () => {
    const output = formatLearningStatusFromApi(makeApiData());
    expect(output).toContain("baseline avg: 6000");
    expect(output).toContain("selected avg: 4500");
  });

  it("shows negative savings when selected uses more tokens", () => {
    const data = makeApiData();
    data.summary.baseline.tokenSavingsPercent = -15.0;
    data.summary.baseline.baselineAvgTokens = 4000;
    data.summary.baseline.selectedAvgTokens = 4600;
    const output = formatLearningStatusFromApi(data);
    expect(output).toContain("-15.0%");
  });

  it("produces same structural output as formatLearningStatus for equivalent data", () => {
    insertRunTrace(db, makeTrace({ isBaseline: true, usage: { total: 1000 } }));
    insertRunTrace(db, makeTrace({ isBaseline: false, usage: { total: 800 } }));
    savePosterior(db, {
      armId: "tool:exec:bash",
      alpha: 5,
      beta: 1,
      pulls: 5,
      lastUpdated: Date.now(),
    });

    const dbOutput = formatLearningStatus(db);
    const apiOutput = formatLearningStatusFromApi(makeApiData());

    // Same structural sections
    expect(dbOutput).toContain("Learning Layer Status");
    expect(apiOutput).toContain("Learning Layer Status");
    expect(dbOutput).toContain("Run Distribution");
    expect(apiOutput).toContain("Run Distribution");
  });
});
