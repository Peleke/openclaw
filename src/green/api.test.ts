import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureGreenSchema, insertCarbonTrace, insertCarbonTarget } from "./store.js";
import { createGreenApiHandler } from "./api.js";
import type { CarbonTrace, GreenConfig, CarbonTarget } from "./types.js";

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

  return {
    req,
    res,
    getStatus: () => statusCode,
    getBody: () => body,
    getHeaders: () => headers,
  };
}

beforeEach(() => {
  const { DatabaseSync: DB } = require("node:sqlite") as typeof import("node:sqlite");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "green-api-test-"));
  db = new DB(path.join(tmpDir, "test.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  ensureGreenSchema(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("green API handler", () => {
  it("returns false for non-green URLs", async () => {
    const handler = createGreenApiHandler({ getDb: () => db });
    const { req, res } = mockReqRes("GET", "/some/other/path");
    expect(await handler(req, res)).toBe(false);
  });

  it("returns false for partial prefix match", async () => {
    const handler = createGreenApiHandler({ getDb: () => db });
    const { req, res } = mockReqRes("GET", "/__openclaw__/api/greenish/summary");
    expect(await handler(req, res)).toBe(false);
  });

  it("returns 503 when DB unavailable", async () => {
    const handler = createGreenApiHandler({ getDb: () => null });
    const { req, res, getStatus, getBody } = mockReqRes("GET", "/__openclaw__/api/green/summary");
    expect(await handler(req, res)).toBe(true);
    expect(getStatus()).toBe(503);
    expect(JSON.parse(getBody()).error).toContain("not available");
  });

  it("returns 405 for non-GET methods", async () => {
    const handler = createGreenApiHandler({ getDb: () => db });

    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const { req, res, getStatus } = mockReqRes(method, "/__openclaw__/api/green/summary");
      await handler(req, res);
      expect(getStatus()).toBe(405);
    }
  });

  it("returns 404 for unknown routes", async () => {
    const handler = createGreenApiHandler({ getDb: () => db });
    const { req, res, getStatus, getBody } = mockReqRes("GET", "/__openclaw__/api/green/unknown");
    await handler(req, res);
    expect(getStatus()).toBe(404);
    expect(JSON.parse(getBody()).error).toContain("Unknown");
  });

  it("sets CORS headers", async () => {
    const handler = createGreenApiHandler({ getDb: () => db });
    const { req, res, getHeaders } = mockReqRes("GET", "/__openclaw__/api/green/summary");
    await handler(req, res);
    expect(getHeaders()["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("sets JSON content type", async () => {
    const handler = createGreenApiHandler({ getDb: () => db });
    const { req, res, getHeaders } = mockReqRes("GET", "/__openclaw__/api/green/summary");
    await handler(req, res);
    expect(getHeaders()["Content-Type"]).toContain("application/json");
  });

  describe("GET /summary", () => {
    it("returns summary with equivalents for empty DB", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody, getStatus } = mockReqRes("GET", "/__openclaw__/api/green/summary");
      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());

      expect(data.traceCount).toBe(0);
      expect(data.totalCo2Grams).toBe(0);
      expect(data.equivalents).toBeDefined();
      expect(data.providers).toEqual([]);
      expect(data.confidence).toBeDefined();
    });

    it("returns summary with data", async () => {
      insertCarbonTrace(db, makeTrace({ totalCo2Grams: 120 })); // 1 car km

      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/summary");
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.traceCount).toBe(1);
      expect(data.totalCo2Grams).toBe(120);
      expect(data.equivalents.carKm).toBe(1);
    });

    it("includes provider breakdown", async () => {
      insertCarbonTrace(db, makeTrace({ provider: "anthropic", totalCo2Grams: 100 }));
      insertCarbonTrace(db, makeTrace({ provider: "openai", totalCo2Grams: 50 }));

      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/summary");
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.providers).toHaveLength(2);
      expect(data.providers.find((p: any) => p.provider === "anthropic")).toBeDefined();
      expect(data.providers.find((p: any) => p.provider === "openai")).toBeDefined();
    });

    it("includes confidence info", async () => {
      insertCarbonTrace(db, makeTrace({ factorConfidence: 0.35 }));

      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/summary");
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.confidence.label).toBe("low");
      expect(data.confidence.description).toBeTruthy();
    });
  });

  describe("GET /config", () => {
    it("returns default config when getConfig not provided", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody, getStatus } = mockReqRes("GET", "/__openclaw__/api/green/config");
      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());

      expect(data.enabled).toBe(true);
      expect(data.defaultGridCarbon).toBe(400);
      expect(data.showInStatus).toBe(true);
      expect(data.dailyAlertThreshold).toBeNull();
    });

    it("returns actual config when getConfig provided", async () => {
      const config: GreenConfig = { enabled: false, defaultGridCarbon: 250 };
      const handler = createGreenApiHandler({ getDb: () => db, getConfig: () => config });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/config");
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.enabled).toBe(false);
      expect(data.defaultGridCarbon).toBe(250);
    });

    it("returns null config when getConfig returns null", async () => {
      const handler = createGreenApiHandler({ getDb: () => db, getConfig: () => null });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/config");
      await handler(req, res);
      const data = JSON.parse(getBody());

      // Should return resolved defaults
      expect(data.enabled).toBe(true);
      expect(data.defaultGridCarbon).toBe(400);
    });
  });

  describe("GET /factors", () => {
    it("returns factors and fallback", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody, getStatus } = mockReqRes("GET", "/__openclaw__/api/green/factors");
      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());

      expect(data.factors).toBeDefined();
      expect(Array.isArray(data.factors)).toBe(true);
      expect(data.factors.length).toBeGreaterThan(0);
      expect(data.fallback).toBeDefined();
      expect(data.fallback.source).toBe("fallback");
    });

    it("includes anthropic factors", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/factors");
      await handler(req, res);
      const data = JSON.parse(getBody());

      const anthropicFactors = data.factors.filter((f: any) => f.provider === "anthropic");
      expect(anthropicFactors.length).toBeGreaterThan(0);
    });

    it("includes openai factors", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/factors");
      await handler(req, res);
      const data = JSON.parse(getBody());

      const openaiFactors = data.factors.filter((f: any) => f.provider === "openai");
      expect(openaiFactors.length).toBeGreaterThan(0);
    });
  });

  describe("GET /traces", () => {
    it("returns empty traces for empty DB", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody, getStatus } = mockReqRes("GET", "/__openclaw__/api/green/traces");
      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());

      expect(data.total).toBe(0);
      expect(data.traces).toEqual([]);
    });

    it("returns traces with pagination", async () => {
      for (let i = 0; i < 5; i++) {
        insertCarbonTrace(db, makeTrace({ traceId: `t${i}`, timestamp: 1000 + i }));
      }

      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes(
        "GET",
        "/__openclaw__/api/green/traces?limit=2&offset=1",
      );
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.total).toBe(5);
      expect(data.traces).toHaveLength(2);
    });

    it("uses default limit", async () => {
      for (let i = 0; i < 5; i++) {
        insertCarbonTrace(db, makeTrace());
      }

      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/traces");
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.traces).toHaveLength(5);
    });

    it("caps limit at 1000", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/traces?limit=5000");
      await handler(req, res);
      // Should not throw, just cap to 1000
      expect(JSON.parse(getBody())).toBeDefined();
    });

    it("handles negative offset as 0", async () => {
      insertCarbonTrace(db, makeTrace());

      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/traces?offset=-5");
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.total).toBe(1);
      expect(data.traces).toHaveLength(1);
    });
  });

  describe("GET /timeseries", () => {
    it("returns empty buckets for empty DB", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody, getStatus } = mockReqRes(
        "GET",
        "/__openclaw__/api/green/timeseries",
      );
      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());

      expect(data.buckets).toEqual([]);
    });

    it("returns bucketed data with default window", async () => {
      insertCarbonTrace(db, makeTrace({ timestamp: 0, totalCo2Grams: 10 }));
      insertCarbonTrace(db, makeTrace({ timestamp: 86400000, totalCo2Grams: 20 }));

      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/timeseries");
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.buckets).toBeDefined();
      expect(Array.isArray(data.buckets)).toBe(true);
    });

    it("supports 1h window", async () => {
      insertCarbonTrace(db, makeTrace({ timestamp: 0, totalCo2Grams: 10 }));

      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes(
        "GET",
        "/__openclaw__/api/green/timeseries?window=1h",
      );
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.buckets).toBeDefined();
    });

    it("supports 7d window", async () => {
      insertCarbonTrace(db, makeTrace({ timestamp: 0, totalCo2Grams: 10 }));

      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes(
        "GET",
        "/__openclaw__/api/green/timeseries?window=7d",
      );
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.buckets).toBeDefined();
    });

    it("falls back to 1d for unknown window", async () => {
      insertCarbonTrace(db, makeTrace({ timestamp: 0, totalCo2Grams: 10 }));

      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody, getStatus } = mockReqRes(
        "GET",
        "/__openclaw__/api/green/timeseries?window=unknown",
      );
      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());
      expect(data.buckets).toBeDefined();
    });
  });

  describe("URL handling", () => {
    it("handles trailing slashes", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getStatus } = mockReqRes("GET", "/__openclaw__/api/green/summary/");
      await handler(req, res);
      expect(getStatus()).toBe(200);
    });

    it("handles multiple trailing slashes", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getStatus } = mockReqRes("GET", "/__openclaw__/api/green/summary///");
      await handler(req, res);
      expect(getStatus()).toBe(200);
    });
  });

  describe("GET /intensity", () => {
    it("returns intensity metrics for empty DB", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody, getStatus } = mockReqRes(
        "GET",
        "/__openclaw__/api/green/intensity",
      );
      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());

      expect(data.totalTokens).toBe(0);
      expect(data.totalTraces).toBe(0);
      expect(data.intensityPerMillionTokens).toBe(0);
      expect(data.intensityPerQuery).toBe(0);
      expect(data.uncertainty).toBeDefined();
    });

    it("returns intensity metrics with data", async () => {
      insertCarbonTrace(db, makeTrace({ inputTokens: 1_000_000, totalCo2Grams: 100 }));

      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/intensity");
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.totalTraces).toBe(1);
      expect(data.intensityPerMillionTokens).toBeGreaterThan(0);
      expect(data.uncertainty.lower).toBeLessThan(1);
      expect(data.uncertainty.upper).toBeGreaterThan(1);
    });
  });

  describe("GET /targets", () => {
    it("returns empty targets for empty DB", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody, getStatus } = mockReqRes("GET", "/__openclaw__/api/green/targets");
      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());

      expect(data.targets).toEqual([]);
      expect(data.progress).toEqual([]);
    });

    it("returns targets with progress", async () => {
      const target = makeTarget();
      insertCarbonTarget(db, target);

      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/green/targets");
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.targets).toHaveLength(1);
      expect(data.targets[0].name).toBe(target.name);
      expect(data.progress).toHaveLength(1);
    });
  });

  describe("GET /export/ghg-protocol", () => {
    it("returns GHG Protocol export", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody, getStatus } = mockReqRes(
        "GET",
        "/__openclaw__/api/green/export/ghg-protocol?period=2025-Q1",
      );
      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());

      expect(data.reportingPeriod).toBe("2025-Q1");
      expect(data.organizationalBoundary).toBeDefined();
      expect(data.scope3Category1).toBeDefined();
    });

    it("uses current year as default period", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody } = mockReqRes(
        "GET",
        "/__openclaw__/api/green/export/ghg-protocol",
      );
      await handler(req, res);
      const data = JSON.parse(getBody());

      expect(data.reportingPeriod).toBe(String(new Date().getFullYear()));
    });
  });

  describe("GET /export/cdp", () => {
    it("returns CDP export", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody, getStatus } = mockReqRes(
        "GET",
        "/__openclaw__/api/green/export/cdp?year=2025",
      );
      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());

      expect(data.reportingYear).toBe(2025);
      expect(data.scope3).toBeDefined();
      expect(data.scope3.category1).toBeDefined();
      expect(data.intensity).toBeDefined();
    });
  });

  describe("GET /export/tcfd", () => {
    it("returns TCFD export", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody, getStatus } = mockReqRes(
        "GET",
        "/__openclaw__/api/green/export/tcfd?period=2025&baseYear=2024",
      );
      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());

      expect(data.absoluteEmissions).toBeDefined();
      expect(data.carbonIntensity).toBeDefined();
      expect(data.historicalTrend).toBeDefined();
    });

    it("works without optional parameters", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getStatus } = mockReqRes("GET", "/__openclaw__/api/green/export/tcfd");
      await handler(req, res);

      expect(getStatus()).toBe(200);
    });
  });

  describe("GET /export/iso14064", () => {
    it("returns ISO 14064 export", async () => {
      const handler = createGreenApiHandler({ getDb: () => db });
      const { req, res, getBody, getStatus } = mockReqRes(
        "GET",
        "/__openclaw__/api/green/export/iso14064?period=2025&baseYear=2024",
      );
      await handler(req, res);

      expect(getStatus()).toBe(200);
      const data = JSON.parse(getBody());

      expect(data.reportingPeriod).toBe("2025");
      expect(data.organizationalBoundary).toBeDefined();
      expect(data.ghgInventory).toBeDefined();
      expect(data.ghgInventory.uncertainty).toBeDefined();
    });
  });
});
