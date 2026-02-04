import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureGreenSchema, insertCarbonTrace } from "./store.js";
import { formatGreenStatus } from "./cli-status.js";
import type { CarbonTrace, GreenConfig } from "./types.js";

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
    scope: 3,
    category: 1,
    calculationMethod: "average-data",
    dataQualityScore: 3,
    aborted: false,
    ...overrides,
  };
}

beforeEach(() => {
  const { DatabaseSync: DB } = require("node:sqlite") as typeof import("node:sqlite");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "green-cli-test-"));
  db = new DB(path.join(tmpDir, "test.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  ensureGreenSchema(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("formatGreenStatus", () => {
  it("shows empty state for empty DB", () => {
    const output = formatGreenStatus(db);
    expect(output).toContain("No carbon traces recorded yet");
  });

  it("shows tracking status", () => {
    const output = formatGreenStatus(db);
    expect(output).toContain("[TRACKING]");
  });

  it("shows disabled when config.enabled=false", () => {
    const config: GreenConfig = { enabled: false };
    const output = formatGreenStatus({ db, config });
    expect(output).toContain("[DISABLED]");
  });

  it("shows header with Environmental Impact", () => {
    insertCarbonTrace(db, makeTrace());
    const output = formatGreenStatus(db);
    expect(output).toContain("Environmental Impact");
  });

  it("shows carbon totals", () => {
    insertCarbonTrace(db, makeTrace({ totalCo2Grams: 1500 }));
    const output = formatGreenStatus(db);
    expect(output).toContain("1.50 kg");
  });

  it("shows water totals", () => {
    insertCarbonTrace(db, makeTrace({ waterMl: 2000 }));
    const output = formatGreenStatus(db);
    expect(output).toContain("2.0 L");
  });

  it("shows equivalents", () => {
    insertCarbonTrace(db, makeTrace({ totalCo2Grams: 1200 }));
    const output = formatGreenStatus(db);
    expect(output).toContain("Driving");
    expect(output).toContain("phone charges");
    expect(output).toContain("tree-days");
  });

  it("shows provider breakdown", () => {
    insertCarbonTrace(db, makeTrace({ provider: "anthropic", totalCo2Grams: 100 }));
    insertCarbonTrace(db, makeTrace({ provider: "openai", totalCo2Grams: 50 }));

    const output = formatGreenStatus(db);
    expect(output).toContain("Provider Breakdown");
    expect(output).toContain("anthropic");
    expect(output).toContain("openai");
  });

  it("shows confidence level", () => {
    insertCarbonTrace(db, makeTrace({ factorConfidence: 0.3 }));
    const output = formatGreenStatus(db);
    expect(output).toContain("Confidence");
    expect(output).toContain("30%");
  });

  it("shows grid carbon in config", () => {
    const output = formatGreenStatus(db);
    expect(output).toContain("Grid: 400");
  });
});
