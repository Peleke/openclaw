import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureGreenSchema, insertCarbonTrace, insertCarbonTarget } from "./store.js";
import type { CarbonTrace, CarbonTarget } from "./types.js";
import {
  periodToRange,
  exportGhgProtocol,
  exportCdp,
  exportTcfd,
  exportIso14064,
  METHODOLOGY_DESCRIPTION,
  EMISSION_FACTOR_SOURCES,
} from "./exports.js";

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

function makeTarget(overrides: Partial<CarbonTarget> = {}): CarbonTarget {
  return {
    targetId: crypto.randomUUID(),
    name: "Net Zero 2030",
    baseYear: 2024,
    baseYearEmissionsGrams: 1000000,
    targetYear: 2030,
    targetReductionPercent: 50,
    pathway: "1.5C",
    createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  const { DatabaseSync: DB } = require("node:sqlite") as typeof import("node:sqlite");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "green-exports-test-"));
  db = new DB(path.join(tmpDir, "test.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  ensureGreenSchema(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("periodToRange", () => {
  it("parses year format", () => {
    const { start, end } = periodToRange("2025");
    expect(new Date(start).getFullYear()).toBe(2025);
    expect(new Date(start).getMonth()).toBe(0);
    expect(new Date(start).getDate()).toBe(1);
    expect(new Date(end).getFullYear()).toBe(2025);
    expect(new Date(end).getMonth()).toBe(11);
  });

  it("parses quarter format", () => {
    const { start, end } = periodToRange("2025-Q1");
    expect(new Date(start).getMonth()).toBe(0); // January
    expect(new Date(end).getMonth()).toBe(2); // March

    const q2 = periodToRange("2025-Q2");
    expect(new Date(q2.start).getMonth()).toBe(3); // April

    const q3 = periodToRange("2025-Q3");
    expect(new Date(q3.start).getMonth()).toBe(6); // July

    const q4 = periodToRange("2025-Q4");
    expect(new Date(q4.start).getMonth()).toBe(9); // October
  });

  it("parses month format", () => {
    const { start } = periodToRange("2025-06");
    expect(new Date(start).getMonth()).toBe(5); // June (0-indexed)
    expect(new Date(start).getDate()).toBe(1);
  });

  it("returns all time for invalid format", () => {
    const { start, end } = periodToRange("invalid");
    expect(start).toBe(0);
    expect(end).toBeGreaterThan(0);
  });

  it("parses ISO week format", () => {
    // 2025-W05 is Jan 27 - Feb 2
    const { start, end } = periodToRange("2025-W05");
    const startDate = new Date(start);
    const endDate = new Date(end);

    // Start should be Monday
    expect(startDate.getUTCDay()).toBe(1); // Monday
    // End should be Sunday (at 23:59:59.999)
    expect(endDate.getUTCDay()).toBe(0); // Sunday

    // Verify it spans ~7 days (Monday 00:00 to Sunday 23:59:59.999)
    const diffMs = end - start;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    // Should be close to 7 days (6 days 23 hours 59 minutes 59 seconds)
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  it("parses ISO week format case-insensitively", () => {
    const upper = periodToRange("2025-W10");
    const lower = periodToRange("2025-w10");
    expect(upper.start).toBe(lower.start);
    expect(upper.end).toBe(lower.end);
  });

  it("handles week 1 which may start in previous year", () => {
    const { start } = periodToRange("2025-W01");
    const startDate = new Date(start);
    // Week 1 of 2025 starts Dec 30, 2024 (Monday)
    expect(startDate.getUTCDay()).toBe(1); // Monday
  });
});

describe("exportGhgProtocol", () => {
  it("returns valid GHG Protocol structure for empty DB", () => {
    const result = exportGhgProtocol(db, "2025");

    expect(result.reportingPeriod).toBe("2025");
    expect(result.organizationalBoundary).toContain("Operational control");
    expect(result.scope3Category1).toBeDefined();
    expect(result.scope3Category1.emissions_tCO2eq).toBe(0);
    expect(result.scope3Category1.calculationMethod).toContain("Average-data");
    expect(result.scope3Category1.emissionFactorSources).toEqual(EMISSION_FACTOR_SOURCES);
  });

  it("converts grams to tonnes correctly", () => {
    // 1,000,000 grams = 1 tonne
    const currentYear = new Date().getFullYear();
    const ts = new Date(currentYear, 6, 1).getTime();
    insertCarbonTrace(db, makeTrace({ totalCo2Grams: 1_000_000, timestamp: ts }));

    const result = exportGhgProtocol(db, String(currentYear));
    expect(result.scope3Category1.emissions_tCO2eq).toBe(1);
  });

  it("calculates uncertainty from confidence", () => {
    const currentYear = new Date().getFullYear();
    const ts = new Date(currentYear, 6, 1).getTime();
    insertCarbonTrace(db, makeTrace({ factorConfidence: 0.3, timestamp: ts }));

    const result = exportGhgProtocol(db, String(currentYear));
    expect(result.scope3Category1.uncertainty_percent).toBeGreaterThan(0);
    expect(result.scope3Category1.dataQuality).toBeDefined();
  });

  it("filters by reporting period", () => {
    // Insert trace for Q1 2025
    const q1Timestamp = new Date(2025, 1, 15).getTime();
    insertCarbonTrace(db, makeTrace({ timestamp: q1Timestamp, totalCo2Grams: 100 }));

    // Insert trace for Q2 2025
    const q2Timestamp = new Date(2025, 4, 15).getTime();
    insertCarbonTrace(db, makeTrace({ timestamp: q2Timestamp, totalCo2Grams: 200 }));

    const q1Result = exportGhgProtocol(db, "2025-Q1");
    expect(q1Result.scope3Category1.emissions_tCO2eq).toBeCloseTo(100 / 1_000_000, 10);

    const q2Result = exportGhgProtocol(db, "2025-Q2");
    expect(q2Result.scope3Category1.emissions_tCO2eq).toBeCloseTo(200 / 1_000_000, 10);
  });

  it("maps confidence to data quality descriptor", () => {
    const currentYear = new Date().getFullYear();
    const ts = new Date(currentYear, 6, 1).getTime();
    insertCarbonTrace(db, makeTrace({ factorConfidence: 0.7, timestamp: ts }));
    const highResult = exportGhgProtocol(db, String(currentYear));
    expect(highResult.scope3Category1.dataQuality).toBe("Good");
  });
});

describe("exportCdp", () => {
  it("returns valid CDP Module 7 structure", () => {
    const result = exportCdp(db, 2025);

    expect(result.reportingYear).toBe(2025);
    expect(result.scope3.category1).toBeDefined();
    expect(result.scope3.category1.methodology).toBe("hybrid");
    expect(result.scope3.category1.methodologyDescription).toBe(METHODOLOGY_DESCRIPTION);
    expect(result.intensity).toHaveLength(2);
  });

  it("includes intensity metrics", () => {
    const currentYear = new Date().getFullYear();
    const ts = new Date(currentYear, 6, 1).getTime();
    insertCarbonTrace(db, makeTrace({ inputTokens: 1_000_000, totalCo2Grams: 100, timestamp: ts }));

    const result = exportCdp(db, currentYear);

    const tokenIntensity = result.intensity.find((i) => i.metric.includes("million tokens"));
    expect(tokenIntensity).toBeDefined();
    expect(tokenIntensity?.unit).toContain("gCO2eq");

    const queryIntensity = result.intensity.find((i) => i.metric.includes("API call"));
    expect(queryIntensity).toBeDefined();
  });

  it("maps confidence to data quality", () => {
    const currentYear = new Date().getFullYear();
    const ts = new Date(currentYear, 6, 1).getTime();

    insertCarbonTrace(db, makeTrace({ factorConfidence: 0.7, timestamp: ts }));
    const highResult = exportCdp(db, currentYear);
    expect(highResult.scope3.category1.dataQuality).toBe("calculated");

    // Clear and add low confidence trace
    db.exec("DELETE FROM carbon_traces");
    insertCarbonTrace(db, makeTrace({ factorConfidence: 0.2, timestamp: ts }));
    const lowResult = exportCdp(db, currentYear);
    expect(lowResult.scope3.category1.dataQuality).toBe("estimated");
  });
});

describe("exportTcfd", () => {
  it("returns valid TCFD structure", () => {
    const result = exportTcfd(db, {});

    expect(result.absoluteEmissions).toBeDefined();
    expect(result.carbonIntensity).toBeDefined();
    expect(result.historicalTrend).toBeDefined();
    expect(Array.isArray(result.historicalTrend)).toBe(true);
  });

  it("includes historical trend data", () => {
    const result = exportTcfd(db, {});

    expect(result.historicalTrend.length).toBe(4); // Last 4 quarters
    result.historicalTrend.forEach((bucket) => {
      expect(bucket.period).toMatch(/^\d{4}-Q[1-4]$/);
      expect(typeof bucket.emissions_tCO2eq).toBe("number");
    });
  });

  it("calculates baseline comparison", () => {
    // Insert traces for 2024 and 2025
    const ts2024 = new Date(2024, 6, 1).getTime();
    const ts2025 = new Date(2025, 6, 1).getTime();

    insertCarbonTrace(db, makeTrace({ timestamp: ts2024, totalCo2Grams: 1000 }));
    insertCarbonTrace(db, makeTrace({ timestamp: ts2025, totalCo2Grams: 800 }));

    const result = exportTcfd(db, { period: "2025", baseYear: 2024 });

    expect(result.absoluteEmissions.comparisonToBaseline).toBeDefined();
    expect(result.absoluteEmissions.comparisonToBaseline?.baseYear).toBe(2024);
    expect(result.absoluteEmissions.comparisonToBaseline?.changePercent).toBeLessThan(0);
  });

  it("includes target progress when targets exist", () => {
    const target = makeTarget();
    insertCarbonTarget(db, target);

    const result = exportTcfd(db, {});

    expect(result.targets).toBeDefined();
    expect(result.targets?.length).toBe(1);
  });

  it("excludes targets when none exist", () => {
    const result = exportTcfd(db, {});
    expect(result.targets).toBeUndefined();
  });
});

describe("exportIso14064", () => {
  it("returns valid ISO 14064-1 structure", () => {
    const result = exportIso14064(db, "2025");

    expect(result.reportingPeriod).toBe("2025");
    expect(result.organizationalBoundary).toBe("Operational control");
    expect(result.ghgInventory).toBeDefined();
    expect(result.ghgInventory.category).toContain("Category 4");
  });

  it("includes uncertainty quantification", () => {
    const currentYear = new Date().getFullYear();
    const ts = new Date(currentYear, 6, 1).getTime();
    insertCarbonTrace(db, makeTrace({ totalCo2Grams: 1000, factorConfidence: 0.3, timestamp: ts }));

    const result = exportIso14064(db, String(currentYear));

    expect(result.ghgInventory.uncertainty).toBeDefined();
    expect(result.ghgInventory.uncertainty.lower_tCO2eq).toBeLessThan(
      result.ghgInventory.emissions_tCO2eq,
    );
    expect(result.ghgInventory.uncertainty.upper_tCO2eq).toBeGreaterThan(
      result.ghgInventory.emissions_tCO2eq,
    );
    expect(result.ghgInventory.uncertainty.percent).toBeGreaterThan(0);
  });

  it("includes base year comparison when provided", () => {
    const ts2024 = new Date(2024, 6, 1).getTime();
    const ts2025 = new Date(2025, 6, 1).getTime();

    insertCarbonTrace(db, makeTrace({ timestamp: ts2024, totalCo2Grams: 1000 }));
    insertCarbonTrace(db, makeTrace({ timestamp: ts2025, totalCo2Grams: 500 }));

    const result = exportIso14064(db, "2025", 2024);

    expect(result.baseYearComparison).toBeDefined();
    expect(result.baseYearComparison?.baseYear).toBe(2024);
    expect(result.baseYearComparison?.changePercent).toBeLessThan(0);
  });

  it("maps confidence to data quality description", () => {
    const currentYear = new Date().getFullYear();
    const ts = new Date(currentYear, 6, 1).getTime();

    insertCarbonTrace(db, makeTrace({ factorConfidence: 0.8, timestamp: ts }));
    const highResult = exportIso14064(db, String(currentYear));
    expect(highResult.ghgInventory.dataQuality).toContain("High quality");

    db.exec("DELETE FROM carbon_traces");
    insertCarbonTrace(db, makeTrace({ factorConfidence: 0.2, timestamp: ts }));
    const lowResult = exportIso14064(db, String(currentYear));
    expect(lowResult.ghgInventory.dataQuality).toContain("Very low quality");
  });
});

describe("metadata constants", () => {
  it("METHODOLOGY_DESCRIPTION is non-empty", () => {
    expect(METHODOLOGY_DESCRIPTION.length).toBeGreaterThan(100);
    expect(METHODOLOGY_DESCRIPTION).toContain("Scope 3");
    expect(METHODOLOGY_DESCRIPTION).toContain("Category 1");
  });

  it("EMISSION_FACTOR_SOURCES has expected entries", () => {
    expect(EMISSION_FACTOR_SOURCES.length).toBeGreaterThan(0);
    expect(EMISSION_FACTOR_SOURCES.some((s) => s.includes("Lacoste"))).toBe(true);
    expect(EMISSION_FACTOR_SOURCES.some((s) => s.includes("Patterson"))).toBe(true);
  });
});
