import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureGreenSchema, insertCarbonTrace } from "./store.js";
import {
  formatGreenStatus,
  formatGreenStatusFromApi,
  type GreenStatusApiData,
} from "./cli-status.js";
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

// -- Tests for formatGreenStatusFromApi --

function makeApiData(overrides?: Partial<GreenStatusApiData>): GreenStatusApiData {
  return {
    summary: {
      traceCount: 10,
      totalCo2Grams: 1500,
      totalWaterMl: 2500,
      avgCo2PerTrace: 150,
      avgConfidence: 0.3,
      minTimestamp: Date.now() - 86400000,
      maxTimestamp: Date.now(),
      totalTokens: 50000,
      intensityPerMillionTokens: 30,
      intensityPerQuery: 0.15,
      uncertaintyLower: 0.5,
      uncertaintyUpper: 1.5,
      equivalents: {
        carKm: 5.3,
        phoneCharges: 120,
        treeDays: 0.8,
        googleSearches: 2142,
      },
      providers: [
        { provider: "anthropic", traceCount: 7, totalCo2Grams: 1050, percentage: 70 },
        { provider: "openai", traceCount: 3, totalCo2Grams: 450, percentage: 30 },
      ],
      confidence: { label: "Low", color: "yellow" },
      ...(overrides?.summary ?? {}),
    },
    config: {
      enabled: true,
      defaultGridCarbon: 400,
      ...(overrides?.config ?? {}),
    },
    targets: {
      targets: [],
      progress: [],
      ...(overrides?.targets ?? {}),
    },
  };
}

describe("formatGreenStatusFromApi", () => {
  it("renders status from API data without needing a database", () => {
    const output = formatGreenStatusFromApi(makeApiData());
    expect(output).toContain("Environmental Impact");
    expect(output).toContain("[TRACKING]");
  });

  it("shows DISABLED badge when config.enabled is false", () => {
    const output = formatGreenStatusFromApi(
      makeApiData({ config: { enabled: false, defaultGridCarbon: 400 } }),
    );
    expect(output).toContain("[DISABLED]");
    expect(output).not.toContain("[TRACKING]");
  });

  it("shows carbon totals in kg when >= 1000g", () => {
    const output = formatGreenStatusFromApi(makeApiData());
    expect(output).toContain("1.50 kg");
  });

  it("shows carbon totals in grams when < 1000g", () => {
    const data = makeApiData();
    data.summary.totalCo2Grams = 500;
    const output = formatGreenStatusFromApi(data);
    expect(output).toContain("500.0 g");
  });

  it("shows water totals in liters when >= 1000ml", () => {
    const output = formatGreenStatusFromApi(makeApiData());
    expect(output).toContain("2.5 L");
  });

  it("shows water totals in ml when < 1000ml", () => {
    const data = makeApiData();
    data.summary.totalWaterMl = 500;
    const output = formatGreenStatusFromApi(data);
    expect(output).toContain("500 ml");
  });

  it("shows equivalents from API data", () => {
    const output = formatGreenStatusFromApi(makeApiData());
    expect(output).toContain("Driving 5.3 km");
    expect(output).toContain("120 phone charges");
    expect(output).toContain("0.8 tree-days");
  });

  it("shows provider breakdown from API data", () => {
    const output = formatGreenStatusFromApi(makeApiData());
    expect(output).toContain("Provider Breakdown");
    expect(output).toContain("anthropic");
    expect(output).toContain("openai");
    expect(output).toContain("70%");
    expect(output).toContain("30%");
  });

  it("shows intensity metrics when totalTokens > 0", () => {
    const output = formatGreenStatusFromApi(makeApiData());
    expect(output).toContain("Intensity Metrics (TCFD)");
    expect(output).toContain("Per 1M tokens");
    expect(output).toContain("Per query");
  });

  it("shows confidence from API data", () => {
    const output = formatGreenStatusFromApi(makeApiData());
    expect(output).toContain("Confidence");
    expect(output).toContain("30%");
    expect(output).toContain("Low");
  });

  it("shows grid carbon config from API data", () => {
    const output = formatGreenStatusFromApi(makeApiData());
    expect(output).toContain("Grid: 400");
  });

  it("shows custom grid carbon value", () => {
    const output = formatGreenStatusFromApi(
      makeApiData({ config: { enabled: true, defaultGridCarbon: 250 } }),
    );
    expect(output).toContain("Grid: 250");
  });

  it("shows empty state for zero traces", () => {
    const data = makeApiData();
    data.summary.traceCount = 0;
    const output = formatGreenStatusFromApi(data);
    expect(output).toContain("No carbon traces recorded yet");
  });

  it("shows SBTi targets when present", () => {
    const data = makeApiData({
      targets: {
        targets: [
          {
            targetId: "t1",
            name: "Net Zero 2030",
            baseYear: 2024,
            baseYearEmissionsGrams: 1000,
            targetYear: 2030,
            targetReductionPercent: 50,
            pathway: "1.5C",
            createdAt: Date.now(),
          },
        ],
        progress: [
          {
            target: {
              targetId: "t1",
              name: "Net Zero 2030",
              baseYear: 2024,
              baseYearEmissionsGrams: 1000,
              targetYear: 2030,
              targetReductionPercent: 50,
              pathway: "1.5C",
              createdAt: Date.now(),
            },
            currentYearEmissionsGrams: 600,
            progressPercent: 40,
            onTrack: true,
            projectedEndYear: 2029,
          },
        ],
      },
    });
    const output = formatGreenStatusFromApi(data);
    expect(output).toContain("Emission Targets (SBTi)");
    expect(output).toContain("Net Zero 2030");
    expect(output).toContain("40%");
  });

  it("shows off-track indicator for behind targets", () => {
    const data = makeApiData({
      targets: {
        targets: [
          {
            targetId: "t1",
            name: "Reduction 2030",
            baseYear: 2024,
            baseYearEmissionsGrams: 1000,
            targetYear: 2030,
            targetReductionPercent: 80,
            pathway: "1.5C",
            createdAt: Date.now(),
          },
        ],
        progress: [
          {
            target: {
              targetId: "t1",
              name: "Reduction 2030",
              baseYear: 2024,
              baseYearEmissionsGrams: 1000,
              targetYear: 2030,
              targetReductionPercent: 80,
              pathway: "1.5C",
              createdAt: Date.now(),
            },
            currentYearEmissionsGrams: 900,
            progressPercent: 10,
            onTrack: false,
            projectedEndYear: null,
          },
        ],
      },
    });
    const output = formatGreenStatusFromApi(data);
    expect(output).toContain("\u26A0"); // Warning sign for off-track
  });

  it("produces identical output shape to formatGreenStatus for same data", () => {
    // Both paths should produce output with the same structural elements
    insertCarbonTrace(db, makeTrace({ totalCo2Grams: 1500, waterMl: 2500 }));
    const dbOutput = formatGreenStatus(db);
    const apiOutput = formatGreenStatusFromApi(makeApiData());

    // Same structural sections present
    expect(dbOutput).toContain("Environmental Impact");
    expect(apiOutput).toContain("Environmental Impact");
    expect(dbOutput).toContain("Provider Breakdown");
    expect(apiOutput).toContain("Provider Breakdown");
  });
});
