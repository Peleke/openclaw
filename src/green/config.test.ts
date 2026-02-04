import { describe, it, expect } from "vitest";
import {
  DEFAULT_GREEN_CONFIG,
  DEFAULT_CARBON_FACTORS,
  FALLBACK_CARBON_FACTOR,
  resolveGreenConfig,
} from "./config.js";

describe("green config", () => {
  describe("DEFAULT_GREEN_CONFIG", () => {
    it("has enabled true by default", () => {
      expect(DEFAULT_GREEN_CONFIG.enabled).toBe(true);
    });

    it("has defaultGridCarbon set to 400", () => {
      expect(DEFAULT_GREEN_CONFIG.defaultGridCarbon).toBe(400);
    });

    it("has showInStatus true by default", () => {
      expect(DEFAULT_GREEN_CONFIG.showInStatus).toBe(true);
    });

    it("has null dailyAlertThreshold by default", () => {
      expect(DEFAULT_GREEN_CONFIG.dailyAlertThreshold).toBeNull();
    });

    it("is a complete Required<GreenConfig>", () => {
      expect(DEFAULT_GREEN_CONFIG).toHaveProperty("enabled");
      expect(DEFAULT_GREEN_CONFIG).toHaveProperty("defaultGridCarbon");
      expect(DEFAULT_GREEN_CONFIG).toHaveProperty("showInStatus");
      expect(DEFAULT_GREEN_CONFIG).toHaveProperty("dailyAlertThreshold");
    });
  });

  describe("resolveGreenConfig", () => {
    it("returns defaults for undefined config", () => {
      const resolved = resolveGreenConfig(undefined);
      expect(resolved.enabled).toBe(true);
      expect(resolved.defaultGridCarbon).toBe(400);
      expect(resolved.showInStatus).toBe(true);
      expect(resolved.dailyAlertThreshold).toBeNull();
    });

    it("returns defaults for empty config", () => {
      const resolved = resolveGreenConfig({});
      expect(resolved.enabled).toBe(true);
      expect(resolved.defaultGridCarbon).toBe(400);
    });

    it("overrides enabled when provided", () => {
      const resolved = resolveGreenConfig({ enabled: false });
      expect(resolved.enabled).toBe(false);
      expect(resolved.defaultGridCarbon).toBe(400); // Still default
    });

    it("overrides defaultGridCarbon when provided", () => {
      const resolved = resolveGreenConfig({ defaultGridCarbon: 250 });
      expect(resolved.enabled).toBe(true); // Still default
      expect(resolved.defaultGridCarbon).toBe(250);
    });

    it("overrides showInStatus when provided", () => {
      const resolved = resolveGreenConfig({ showInStatus: false });
      expect(resolved.showInStatus).toBe(false);
    });

    it("overrides dailyAlertThreshold when provided", () => {
      const resolved = resolveGreenConfig({ dailyAlertThreshold: 500 });
      expect(resolved.dailyAlertThreshold).toBe(500);
    });

    it("handles full override", () => {
      const resolved = resolveGreenConfig({
        enabled: false,
        defaultGridCarbon: 200,
        showInStatus: false,
        dailyAlertThreshold: 1000,
      });
      expect(resolved.enabled).toBe(false);
      expect(resolved.defaultGridCarbon).toBe(200);
      expect(resolved.showInStatus).toBe(false);
      expect(resolved.dailyAlertThreshold).toBe(1000);
    });

    it("preserves explicit null threshold", () => {
      const resolved = resolveGreenConfig({ dailyAlertThreshold: null });
      expect(resolved.dailyAlertThreshold).toBeNull();
    });
  });

  describe("DEFAULT_CARBON_FACTORS", () => {
    it("has factors for anthropic", () => {
      const anthropic = DEFAULT_CARBON_FACTORS.filter((f) => f.provider === "anthropic");
      expect(anthropic.length).toBeGreaterThan(0);
    });

    it("has factors for openai", () => {
      const openai = DEFAULT_CARBON_FACTORS.filter((f) => f.provider === "openai");
      expect(openai.length).toBeGreaterThan(0);
    });

    it("includes claude-haiku", () => {
      const haiku = DEFAULT_CARBON_FACTORS.find(
        (f) => f.provider === "anthropic" && f.model === "claude-haiku",
      );
      expect(haiku).toBeDefined();
      expect(haiku!.inputCo2Per1MTokens).toBe(30);
      expect(haiku!.outputCo2Per1MTokens).toBe(90);
    });

    it("includes claude-sonnet", () => {
      const sonnet = DEFAULT_CARBON_FACTORS.find(
        (f) => f.provider === "anthropic" && f.model === "claude-sonnet",
      );
      expect(sonnet).toBeDefined();
      expect(sonnet!.inputCo2Per1MTokens).toBe(150);
      expect(sonnet!.outputCo2Per1MTokens).toBe(450);
    });

    it("includes claude-opus", () => {
      const opus = DEFAULT_CARBON_FACTORS.find(
        (f) => f.provider === "anthropic" && f.model === "claude-opus",
      );
      expect(opus).toBeDefined();
      expect(opus!.inputCo2Per1MTokens).toBe(400);
      expect(opus!.outputCo2Per1MTokens).toBe(1200);
    });

    it("includes gpt-4o-mini", () => {
      const mini = DEFAULT_CARBON_FACTORS.find(
        (f) => f.provider === "openai" && f.model === "gpt-4o-mini",
      );
      expect(mini).toBeDefined();
      expect(mini!.inputCo2Per1MTokens).toBe(40);
    });

    it("includes gpt-4o", () => {
      const gpt4o = DEFAULT_CARBON_FACTORS.find(
        (f) => f.provider === "openai" && f.model === "gpt-4o",
      );
      expect(gpt4o).toBeDefined();
      expect(gpt4o!.inputCo2Per1MTokens).toBe(200);
    });

    it("includes gpt-4", () => {
      const gpt4 = DEFAULT_CARBON_FACTORS.find(
        (f) => f.provider === "openai" && f.model === "gpt-4",
      );
      expect(gpt4).toBeDefined();
      expect(gpt4!.inputCo2Per1MTokens).toBe(300);
    });

    it("all factors have valid confidence (0-1)", () => {
      for (const f of DEFAULT_CARBON_FACTORS) {
        expect(f.confidence).toBeGreaterThanOrEqual(0);
        expect(f.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("all factors have positive CO2 values", () => {
      for (const f of DEFAULT_CARBON_FACTORS) {
        expect(f.inputCo2Per1MTokens).toBeGreaterThan(0);
        expect(f.outputCo2Per1MTokens).toBeGreaterThan(0);
        expect(f.cacheReadCo2Per1MTokens).toBeGreaterThan(0);
      }
    });

    it("all factors have positive water values", () => {
      for (const f of DEFAULT_CARBON_FACTORS) {
        expect(f.waterMlPer1MTokens).toBeGreaterThan(0);
      }
    });

    it("all factors have source set to estimated", () => {
      for (const f of DEFAULT_CARBON_FACTORS) {
        expect(f.source).toBe("estimated");
      }
    });

    it("all factors have valid lastUpdated timestamp", () => {
      for (const f of DEFAULT_CARBON_FACTORS) {
        expect(f.lastUpdated).toBeGreaterThan(0);
      }
    });

    it("output CO2 is higher than input CO2 for all factors", () => {
      for (const f of DEFAULT_CARBON_FACTORS) {
        expect(f.outputCo2Per1MTokens).toBeGreaterThan(f.inputCo2Per1MTokens);
      }
    });

    it("cache read CO2 is lower than input CO2 for all factors", () => {
      for (const f of DEFAULT_CARBON_FACTORS) {
        expect(f.cacheReadCo2Per1MTokens).toBeLessThan(f.inputCo2Per1MTokens);
      }
    });
  });

  describe("FALLBACK_CARBON_FACTOR", () => {
    it("has low confidence", () => {
      expect(FALLBACK_CARBON_FACTOR.confidence).toBeLessThan(0.2);
    });

    it("has source fallback", () => {
      expect(FALLBACK_CARBON_FACTOR.source).toBe("fallback");
    });

    it("has provider unknown", () => {
      expect(FALLBACK_CARBON_FACTOR.provider).toBe("unknown");
    });

    it("has model unknown", () => {
      expect(FALLBACK_CARBON_FACTOR.model).toBe("unknown");
    });

    it("has conservative CO2 estimates (middle of range)", () => {
      expect(FALLBACK_CARBON_FACTOR.inputCo2Per1MTokens).toBe(200);
      expect(FALLBACK_CARBON_FACTOR.outputCo2Per1MTokens).toBe(600);
    });

    it("has conservative water estimate", () => {
      expect(FALLBACK_CARBON_FACTOR.waterMlPer1MTokens).toBe(4000);
    });

    it("has valid cache read CO2", () => {
      expect(FALLBACK_CARBON_FACTOR.cacheReadCo2Per1MTokens).toBe(20);
    });
  });
});
