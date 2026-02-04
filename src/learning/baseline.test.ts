import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LearningConfig } from "./types.js";
import {
  shouldRunBaseline,
  shouldRunBaselineSeeded,
  generateBaselineSeed,
  recommendedBaselineRate,
} from "./baseline.js";

const mockRandom = vi.spyOn(Math, "random");

beforeEach(() => {
  mockRandom.mockReset();
});

function makeConfig(overrides?: Partial<LearningConfig>): LearningConfig {
  return {
    enabled: true,
    phase: "active",
    baselineRate: 0.1,
    ...overrides,
  };
}

describe("shouldRunBaseline", () => {
  it("returns true when random < baselineRate", () => {
    mockRandom.mockReturnValue(0.05);
    const config = makeConfig({ baselineRate: 0.1 });
    expect(shouldRunBaseline(config)).toBe(true);
  });

  it("returns false when random >= baselineRate", () => {
    mockRandom.mockReturnValue(0.15);
    const config = makeConfig({ baselineRate: 0.1 });
    expect(shouldRunBaseline(config)).toBe(false);
  });

  it("returns false when random equals baselineRate", () => {
    mockRandom.mockReturnValue(0.1);
    const config = makeConfig({ baselineRate: 0.1 });
    expect(shouldRunBaseline(config)).toBe(false);
  });

  it("uses default baselineRate of 0.1 when not specified", () => {
    mockRandom.mockReturnValue(0.05);
    const config = makeConfig({ baselineRate: undefined });
    expect(shouldRunBaseline(config)).toBe(true);
  });

  it("respects higher baselineRate", () => {
    mockRandom.mockReturnValue(0.15);
    const config = makeConfig({ baselineRate: 0.2 });
    expect(shouldRunBaseline(config)).toBe(true);
  });
});

describe("shouldRunBaselineSeeded", () => {
  it("returns deterministic result for same seed", () => {
    const config = makeConfig({ baselineRate: 0.1 });

    const result1 = shouldRunBaselineSeeded(config, 12345);
    const result2 = shouldRunBaselineSeeded(config, 12345);

    expect(result1).toBe(result2);
  });

  it("returns different results for different seeds", () => {
    const config = makeConfig({ baselineRate: 0.5 }); // 50% rate to increase variance

    // With enough different seeds, we should get both true and false
    const results = new Set<boolean>();
    for (let seed = 0; seed < 1000; seed++) {
      results.add(shouldRunBaselineSeeded(config, seed));
      if (results.size === 2) break; // Early exit once we've seen both
    }

    expect(results.size).toBe(2); // Both true and false should appear
  });

  it("respects baselineRate", () => {
    // With baselineRate=0, should always return false
    const config = makeConfig({ baselineRate: 0 });
    for (let seed = 0; seed < 20; seed++) {
      expect(shouldRunBaselineSeeded(config, seed)).toBe(false);
    }
  });

  it("handles baselineRate=1 (always baseline)", () => {
    const config = makeConfig({ baselineRate: 1 });
    for (let seed = 0; seed < 20; seed++) {
      expect(shouldRunBaselineSeeded(config, seed)).toBe(true);
    }
  });
});

describe("generateBaselineSeed", () => {
  it("generates deterministic seed for same inputs", () => {
    const seed1 = generateBaselineSeed("session-1", 1000);
    const seed2 = generateBaselineSeed("session-1", 1000);
    expect(seed1).toBe(seed2);
  });

  it("generates different seeds for different session keys", () => {
    const seed1 = generateBaselineSeed("session-1", 1000);
    const seed2 = generateBaselineSeed("session-2", 1000);
    expect(seed1).not.toBe(seed2);
  });

  it("generates different seeds for different timestamps", () => {
    const seed1 = generateBaselineSeed("session-1", 1000);
    const seed2 = generateBaselineSeed("session-1", 2000);
    expect(seed1).not.toBe(seed2);
  });

  it("handles undefined session key", () => {
    const seed = generateBaselineSeed(undefined, 1000);
    expect(typeof seed).toBe("number");
    expect(seed).toBeGreaterThanOrEqual(0);
  });

  it("returns non-negative integer", () => {
    for (let i = 0; i < 100; i++) {
      const seed = generateBaselineSeed(`session-${i}`, Date.now() + i);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("recommendedBaselineRate", () => {
  it("returns 0.2 for small inventories (≤10 arms)", () => {
    expect(recommendedBaselineRate(5)).toBe(0.2);
    expect(recommendedBaselineRate(10)).toBe(0.2);
  });

  it("returns 0.1 for medium inventories (11-50 arms)", () => {
    expect(recommendedBaselineRate(11)).toBe(0.1);
    expect(recommendedBaselineRate(30)).toBe(0.1);
    expect(recommendedBaselineRate(50)).toBe(0.1);
  });

  it("returns 0.05 for large inventories (>50 arms)", () => {
    expect(recommendedBaselineRate(51)).toBe(0.05);
    expect(recommendedBaselineRate(100)).toBe(0.05);
    expect(recommendedBaselineRate(500)).toBe(0.05);
  });

  it("handles edge cases", () => {
    expect(recommendedBaselineRate(0)).toBe(0.2);
    expect(recommendedBaselineRate(1)).toBe(0.2);
  });
});
