import { describe, it, expect } from "vitest";
import type {
  CarbonFactor,
  CarbonFactorSource,
  CarbonTrace,
  CarbonSummary,
  CarbonEquivalents,
  CarbonTimeseriesBucket,
  GreenConfig,
  ProviderBreakdown,
} from "./types.js";

describe("green types", () => {
  describe("CarbonFactorSource", () => {
    it("accepts all valid source values", () => {
      const sources: CarbonFactorSource[] = ["measured", "research", "estimated", "fallback"];
      expect(sources).toHaveLength(4);
    });
  });

  describe("CarbonFactor", () => {
    it("has all required fields", () => {
      const factor: CarbonFactor = {
        provider: "anthropic",
        model: "claude-sonnet",
        inputCo2Per1MTokens: 150,
        outputCo2Per1MTokens: 450,
        cacheReadCo2Per1MTokens: 15,
        waterMlPer1MTokens: 3000,
        confidence: 0.3,
        source: "estimated",
        lastUpdated: Date.now(),
      };
      expect(factor.provider).toBe("anthropic");
      expect(factor.model).toBe("claude-sonnet");
      expect(factor.confidence).toBeGreaterThanOrEqual(0);
      expect(factor.confidence).toBeLessThanOrEqual(1);
    });

    it("allows all valid sources", () => {
      const sources: CarbonFactorSource[] = ["measured", "research", "estimated", "fallback"];
      for (const source of sources) {
        const factor: CarbonFactor = {
          provider: "test",
          model: "test",
          inputCo2Per1MTokens: 100,
          outputCo2Per1MTokens: 300,
          cacheReadCo2Per1MTokens: 10,
          waterMlPer1MTokens: 2000,
          confidence: 0.5,
          source,
          lastUpdated: Date.now(),
        };
        expect(factor.source).toBe(source);
      }
    });
  });

  describe("CarbonTrace", () => {
    it("has all token fields", () => {
      const trace: CarbonTrace = {
        traceId: "test-trace-id",
        runId: "run-123",
        sessionId: "session-456",
        timestamp: Date.now(),
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 200,
        inputCo2Grams: 0.15,
        outputCo2Grams: 0.225,
        cacheCo2Grams: 0.003,
        totalCo2Grams: 0.378,
        waterMl: 5.1,
        factorConfidence: 0.3,
        factorSource: "estimated",
        gridCarbonUsed: 400,
        aborted: false,
      };
      expect(trace.inputTokens).toBe(1000);
      expect(trace.outputTokens).toBe(500);
      expect(trace.cacheReadTokens).toBe(200);
    });

    it("validates CO2 totals add up correctly", () => {
      const trace: CarbonTrace = {
        traceId: "test",
        runId: "run",
        sessionId: "session",
        timestamp: Date.now(),
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        inputCo2Grams: 10,
        outputCo2Grams: 15,
        cacheCo2Grams: 0,
        totalCo2Grams: 25,
        waterMl: 0.45,
        factorConfidence: 0.3,
        factorSource: "estimated",
        gridCarbonUsed: 400,
        aborted: false,
      };
      expect(trace.totalCo2Grams).toBe(
        trace.inputCo2Grams + trace.outputCo2Grams + trace.cacheCo2Grams,
      );
    });

    it("accepts optional fields", () => {
      const minimalTrace: CarbonTrace = {
        traceId: "test",
        runId: "run",
        sessionId: "session",
        timestamp: Date.now(),
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        inputCo2Grams: 0,
        outputCo2Grams: 0,
        cacheCo2Grams: 0,
        totalCo2Grams: 0,
        waterMl: 0,
        factorConfidence: 0.15,
        factorSource: "fallback",
        gridCarbonUsed: 400,
        aborted: false,
      };
      expect(minimalTrace.sessionKey).toBeUndefined();
      expect(minimalTrace.provider).toBeUndefined();
      expect(minimalTrace.model).toBeUndefined();
      expect(minimalTrace.channel).toBeUndefined();
      expect(minimalTrace.durationMs).toBeUndefined();
      expect(minimalTrace.error).toBeUndefined();
    });

    it("accepts error state", () => {
      const errorTrace: CarbonTrace = {
        traceId: "test",
        runId: "run",
        sessionId: "session",
        timestamp: Date.now(),
        inputTokens: 100,
        outputTokens: 0,
        cacheReadTokens: 0,
        inputCo2Grams: 0.01,
        outputCo2Grams: 0,
        cacheCo2Grams: 0,
        totalCo2Grams: 0.01,
        waterMl: 0.3,
        factorConfidence: 0.3,
        factorSource: "estimated",
        gridCarbonUsed: 400,
        aborted: true,
        error: "Test error message",
      };
      expect(errorTrace.aborted).toBe(true);
      expect(errorTrace.error).toBe("Test error message");
    });
  });

  describe("CarbonSummary", () => {
    it("has all required fields", () => {
      const summary: CarbonSummary = {
        traceCount: 100,
        totalCo2Grams: 1500.5,
        totalWaterMl: 45000,
        avgCo2PerTrace: 15.005,
        avgConfidence: 0.28,
        minTimestamp: 1700000000000,
        maxTimestamp: 1700100000000,
      };
      expect(summary.traceCount).toBe(100);
      expect(summary.totalCo2Grams).toBeCloseTo(1500.5, 1);
    });

    it("allows null timestamps for empty DB", () => {
      const emptySummary: CarbonSummary = {
        traceCount: 0,
        totalCo2Grams: 0,
        totalWaterMl: 0,
        avgCo2PerTrace: 0,
        avgConfidence: 0,
        minTimestamp: null,
        maxTimestamp: null,
      };
      expect(emptySummary.minTimestamp).toBeNull();
      expect(emptySummary.maxTimestamp).toBeNull();
    });
  });

  describe("CarbonEquivalents", () => {
    it("has all equivalence metrics", () => {
      const equiv: CarbonEquivalents = {
        carKm: 10.5,
        phoneCharges: 126,
        treeDays: 26.25,
        googleSearches: 6300,
      };
      expect(equiv.carKm).toBe(10.5);
      expect(equiv.phoneCharges).toBe(126);
      expect(equiv.treeDays).toBe(26.25);
      expect(equiv.googleSearches).toBe(6300);
    });
  });

  describe("CarbonTimeseriesBucket", () => {
    it("has timestamp and values", () => {
      const bucket: CarbonTimeseriesBucket = {
        t: 1700000000000,
        co2Grams: 50.5,
        traceCount: 10,
      };
      expect(bucket.t).toBe(1700000000000);
      expect(bucket.co2Grams).toBe(50.5);
      expect(bucket.traceCount).toBe(10);
    });
  });

  describe("GreenConfig", () => {
    it("allows empty config", () => {
      const config: GreenConfig = {};
      expect(config.enabled).toBeUndefined();
      expect(config.defaultGridCarbon).toBeUndefined();
      expect(config.showInStatus).toBeUndefined();
      expect(config.dailyAlertThreshold).toBeUndefined();
    });

    it("allows all fields", () => {
      const fullConfig: GreenConfig = {
        enabled: true,
        defaultGridCarbon: 350,
        showInStatus: true,
        dailyAlertThreshold: 1000,
      };
      expect(fullConfig.enabled).toBe(true);
      expect(fullConfig.defaultGridCarbon).toBe(350);
      expect(fullConfig.showInStatus).toBe(true);
      expect(fullConfig.dailyAlertThreshold).toBe(1000);
    });

    it("allows disabled state", () => {
      const disabledConfig: GreenConfig = {
        enabled: false,
      };
      expect(disabledConfig.enabled).toBe(false);
    });

    it("allows null threshold", () => {
      const config: GreenConfig = {
        enabled: true,
        dailyAlertThreshold: null,
      };
      expect(config.dailyAlertThreshold).toBeNull();
    });
  });

  describe("ProviderBreakdown", () => {
    it("has all fields", () => {
      const breakdown: ProviderBreakdown = {
        provider: "anthropic",
        traceCount: 50,
        totalCo2Grams: 750.25,
        percentage: 65.5,
      };
      expect(breakdown.provider).toBe("anthropic");
      expect(breakdown.traceCount).toBe(50);
      expect(breakdown.totalCo2Grams).toBeCloseTo(750.25, 2);
      expect(breakdown.percentage).toBeCloseTo(65.5, 1);
    });
  });
});
