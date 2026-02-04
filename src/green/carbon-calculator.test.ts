import { describe, it, expect } from "vitest";
import {
  findCarbonFactor,
  calculateCarbon,
  calculateEquivalents,
  formatConfidence,
} from "./carbon-calculator.js";
import { FALLBACK_CARBON_FACTOR } from "./config.js";

describe("carbon-calculator", () => {
  describe("findCarbonFactor", () => {
    it("returns fallback for undefined provider", () => {
      const factor = findCarbonFactor(undefined, "gpt-4");
      expect(factor).toBe(FALLBACK_CARBON_FACTOR);
    });

    it("returns fallback for undefined model", () => {
      const factor = findCarbonFactor("openai", undefined);
      expect(factor).toBe(FALLBACK_CARBON_FACTOR);
    });

    it("returns fallback for both undefined", () => {
      const factor = findCarbonFactor(undefined, undefined);
      expect(factor).toBe(FALLBACK_CARBON_FACTOR);
    });

    it("matches anthropic claude-sonnet exactly", () => {
      const factor = findCarbonFactor("anthropic", "claude-sonnet-4-20250514");
      expect(factor.provider).toBe("anthropic");
      expect(factor.model).toBe("claude-sonnet");
      expect(factor.inputCo2Per1MTokens).toBe(150);
      expect(factor.outputCo2Per1MTokens).toBe(450);
    });

    it("matches anthropic claude-haiku exactly", () => {
      const factor = findCarbonFactor("anthropic", "claude-haiku-3.5");
      expect(factor.provider).toBe("anthropic");
      expect(factor.model).toBe("claude-haiku");
      expect(factor.inputCo2Per1MTokens).toBe(30);
    });

    it("matches anthropic claude-opus exactly", () => {
      const factor = findCarbonFactor("anthropic", "claude-opus-4-20250514");
      expect(factor.provider).toBe("anthropic");
      expect(factor.model).toBe("claude-opus");
      expect(factor.inputCo2Per1MTokens).toBe(400);
    });

    it("matches openai gpt-4o", () => {
      const factor = findCarbonFactor("openai", "gpt-4o-2024-11-20");
      expect(factor.provider).toBe("openai");
      expect(factor.model).toBe("gpt-4o");
      expect(factor.inputCo2Per1MTokens).toBe(200);
    });

    it("matches openai gpt-4o-mini", () => {
      const factor = findCarbonFactor("openai", "gpt-4o-mini-2024-07-18");
      expect(factor.provider).toBe("openai");
      expect(factor.model).toBe("gpt-4o-mini");
      expect(factor.inputCo2Per1MTokens).toBe(40);
    });

    it("matches openai gpt-4", () => {
      const factor = findCarbonFactor("openai", "gpt-4-turbo");
      expect(factor.provider).toBe("openai");
      expect(factor.model).toBe("gpt-4");
      expect(factor.inputCo2Per1MTokens).toBe(300);
    });

    it("matches case-insensitively for provider", () => {
      const factor = findCarbonFactor("ANTHROPIC", "claude-sonnet-4");
      expect(factor.provider).toBe("anthropic");
    });

    it("matches case-insensitively for model", () => {
      const factor = findCarbonFactor("anthropic", "Claude-Opus-4");
      expect(factor.provider).toBe("anthropic");
      expect(factor.model).toBe("claude-opus");
    });

    it("returns conservative estimate for unknown model in known provider", () => {
      // Should return the highest CO2 factor for the provider
      const factor = findCarbonFactor("anthropic", "claude-unknown-9000");
      expect(factor.provider).toBe("anthropic");
      // claude-opus has the highest CO2 for anthropic
      expect(factor.inputCo2Per1MTokens).toBe(400);
    });

    it("returns conservative estimate for unknown openai model", () => {
      const factor = findCarbonFactor("openai", "o1-preview");
      expect(factor.provider).toBe("openai");
      // gpt-4 has the highest CO2 for openai
      expect(factor.inputCo2Per1MTokens).toBe(300);
    });

    it("returns fallback for unknown provider", () => {
      const factor = findCarbonFactor("unknownprovider", "somemodel");
      expect(factor).toBe(FALLBACK_CARBON_FACTOR);
    });

    it("returns fallback for google provider (not yet supported)", () => {
      const factor = findCarbonFactor("google", "gemini-pro");
      expect(factor).toBe(FALLBACK_CARBON_FACTOR);
    });

    it("returns fallback for mistral provider (not yet supported)", () => {
      const factor = findCarbonFactor("mistral", "mistral-large");
      expect(factor).toBe(FALLBACK_CARBON_FACTOR);
    });
  });

  describe("calculateCarbon", () => {
    it("calculates carbon for empty usage", () => {
      const result = calculateCarbon({}, "anthropic", "claude-sonnet");
      expect(result.inputCo2Grams).toBe(0);
      expect(result.outputCo2Grams).toBe(0);
      expect(result.cacheCo2Grams).toBe(0);
      expect(result.totalCo2Grams).toBe(0);
      expect(result.waterMl).toBe(0);
    });

    it("calculates carbon for input tokens only", () => {
      const result = calculateCarbon({ input: 1_000_000 }, "anthropic", "claude-sonnet");
      expect(result.inputCo2Grams).toBe(150); // 150g per 1M tokens
      expect(result.outputCo2Grams).toBe(0);
      expect(result.cacheCo2Grams).toBe(0);
      expect(result.totalCo2Grams).toBe(150);
    });

    it("calculates carbon for output tokens only", () => {
      const result = calculateCarbon({ output: 1_000_000 }, "anthropic", "claude-sonnet");
      expect(result.inputCo2Grams).toBe(0);
      expect(result.outputCo2Grams).toBe(450); // 450g per 1M tokens
      expect(result.cacheCo2Grams).toBe(0);
      expect(result.totalCo2Grams).toBe(450);
    });

    it("calculates carbon for cache read tokens only", () => {
      const result = calculateCarbon({ cacheRead: 1_000_000 }, "anthropic", "claude-sonnet");
      expect(result.inputCo2Grams).toBe(0);
      expect(result.outputCo2Grams).toBe(0);
      expect(result.cacheCo2Grams).toBe(15); // 15g per 1M tokens
      expect(result.totalCo2Grams).toBe(15);
    });

    it("calculates carbon for mixed usage", () => {
      const result = calculateCarbon(
        { input: 500_000, output: 100_000, cacheRead: 200_000 },
        "anthropic",
        "claude-sonnet",
      );
      expect(result.inputCo2Grams).toBeCloseTo(75, 1); // 150 * 0.5
      expect(result.outputCo2Grams).toBeCloseTo(45, 1); // 450 * 0.1
      expect(result.cacheCo2Grams).toBeCloseTo(3, 1); // 15 * 0.2
      expect(result.totalCo2Grams).toBeCloseTo(123, 1);
    });

    it("calculates water usage based on total tokens", () => {
      const result = calculateCarbon({ input: 1_000_000 }, "anthropic", "claude-sonnet");
      expect(result.waterMl).toBe(3000); // 3000ml per 1M tokens
    });

    it("calculates water usage for mixed tokens", () => {
      const result = calculateCarbon(
        { input: 500_000, output: 300_000, cacheRead: 200_000 },
        "anthropic",
        "claude-sonnet",
      );
      // Total = 1M tokens, so water = 3000ml
      expect(result.waterMl).toBe(3000);
    });

    it("returns factor with result", () => {
      const result = calculateCarbon({ input: 100 }, "anthropic", "claude-opus");
      expect(result.factor.provider).toBe("anthropic");
      expect(result.factor.model).toBe("claude-opus");
      expect(result.factor.confidence).toBe(0.25);
    });

    it("uses fallback factor for unknown provider", () => {
      const result = calculateCarbon({ input: 1_000_000 }, "unknown", "model");
      expect(result.inputCo2Grams).toBe(200); // Fallback: 200g per 1M
      expect(result.factor).toBe(FALLBACK_CARBON_FACTOR);
    });

    it("calculates correctly for small token counts", () => {
      const result = calculateCarbon({ input: 1000, output: 500 }, "anthropic", "claude-sonnet");
      // 1000/1_000_000 * 150 = 0.15g
      expect(result.inputCo2Grams).toBeCloseTo(0.15, 5);
      // 500/1_000_000 * 450 = 0.225g
      expect(result.outputCo2Grams).toBeCloseTo(0.225, 5);
    });

    it("calculates correctly for very large token counts", () => {
      const result = calculateCarbon(
        { input: 100_000_000, output: 50_000_000 },
        "anthropic",
        "claude-sonnet",
      );
      expect(result.inputCo2Grams).toBe(15000); // 150 * 100
      expect(result.outputCo2Grams).toBe(22500); // 450 * 50
      expect(result.totalCo2Grams).toBe(37500);
    });

    it("handles zero tokens gracefully", () => {
      const result = calculateCarbon(
        { input: 0, output: 0, cacheRead: 0 },
        "anthropic",
        "claude-sonnet",
      );
      expect(result.totalCo2Grams).toBe(0);
      expect(result.waterMl).toBe(0);
    });
  });

  describe("calculateEquivalents", () => {
    it("calculates car km (120g per km)", () => {
      const equiv = calculateEquivalents(1200);
      expect(equiv.carKm).toBe(10);
    });

    it("calculates phone charges (10g each)", () => {
      const equiv = calculateEquivalents(100);
      expect(equiv.phoneCharges).toBe(10);
    });

    it("calculates tree days (48g per day)", () => {
      const equiv = calculateEquivalents(96);
      expect(equiv.treeDays).toBe(2);
    });

    it("calculates google searches (0.2g each)", () => {
      const equiv = calculateEquivalents(2);
      expect(equiv.googleSearches).toBe(10);
    });

    it("handles zero grams", () => {
      const equiv = calculateEquivalents(0);
      expect(equiv.carKm).toBe(0);
      expect(equiv.phoneCharges).toBe(0);
      expect(equiv.treeDays).toBe(0);
      expect(equiv.googleSearches).toBe(0);
    });

    it("handles fractional results for car km", () => {
      const equiv = calculateEquivalents(60);
      expect(equiv.carKm).toBe(0.5);
    });

    it("handles fractional results for tree days", () => {
      const equiv = calculateEquivalents(24);
      expect(equiv.treeDays).toBe(0.5);
    });

    it("rounds phone charges to nearest integer", () => {
      const equiv = calculateEquivalents(15);
      expect(equiv.phoneCharges).toBe(2); // 15/10 = 1.5 -> rounds to 2
    });

    it("rounds google searches to nearest integer", () => {
      const equiv = calculateEquivalents(0.3);
      // 0.3/0.2 = 1.5 -> Math.round(1.5) could be 1 or 2 depending on JS implementation
      // In JS, Math.round(1.5) = 2
      expect(equiv.googleSearches).toBe(Math.round(0.3 / 0.2));
    });

    it("handles large values", () => {
      const equiv = calculateEquivalents(1_000_000);
      expect(equiv.carKm).toBeCloseTo(8333.33, 1);
      expect(equiv.phoneCharges).toBe(100000);
      expect(equiv.treeDays).toBeCloseTo(20833.33, 1);
      expect(equiv.googleSearches).toBe(5000000);
    });
  });

  describe("formatConfidence", () => {
    it("returns high for >= 0.7", () => {
      expect(formatConfidence(0.7).label).toBe("high");
      expect(formatConfidence(0.8).label).toBe("high");
      expect(formatConfidence(0.9).label).toBe("high");
      expect(formatConfidence(1.0).label).toBe("high");
    });

    it("returns medium for 0.5-0.69", () => {
      expect(formatConfidence(0.5).label).toBe("medium");
      expect(formatConfidence(0.6).label).toBe("medium");
      expect(formatConfidence(0.69).label).toBe("medium");
    });

    it("returns low for 0.3-0.49", () => {
      expect(formatConfidence(0.3).label).toBe("low");
      expect(formatConfidence(0.4).label).toBe("low");
      expect(formatConfidence(0.49).label).toBe("low");
    });

    it("returns very_low for < 0.3", () => {
      expect(formatConfidence(0.0).label).toBe("very_low");
      expect(formatConfidence(0.1).label).toBe("very_low");
      expect(formatConfidence(0.2).label).toBe("very_low");
      expect(formatConfidence(0.29).label).toBe("very_low");
    });

    it("includes description for high", () => {
      const result = formatConfidence(0.8);
      expect(result.description).toBe("Based on published provider data");
    });

    it("includes description for medium", () => {
      const result = formatConfidence(0.6);
      expect(result.description).toBe("Based on academic research");
    });

    it("includes description for low", () => {
      const result = formatConfidence(0.35);
      expect(result.description).toBe("Estimated from similar models");
    });

    it("includes description for very_low", () => {
      const result = formatConfidence(0.15);
      expect(result.description).toBe("Fallback estimate");
    });

    it("handles edge case at 0.7 boundary", () => {
      expect(formatConfidence(0.7).label).toBe("high");
      expect(formatConfidence(0.699).label).toBe("medium");
    });

    it("handles edge case at 0.5 boundary", () => {
      expect(formatConfidence(0.5).label).toBe("medium");
      expect(formatConfidence(0.499).label).toBe("low");
    });

    it("handles edge case at 0.3 boundary", () => {
      expect(formatConfidence(0.3).label).toBe("low");
      expect(formatConfidence(0.299).label).toBe("very_low");
    });
  });
});
