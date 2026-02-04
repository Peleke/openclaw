import { describe, it, expect } from "vitest";
import {
  sampleBeta,
  betaMean,
  betaVariance,
  updateBeta,
  getInitialPrior,
  betaCredibleInterval,
  type BetaParams,
} from "./beta.js";

describe("beta distribution utilities", () => {
  describe("sampleBeta", () => {
    it("returns values in [0, 1]", () => {
      const params: BetaParams = { alpha: 2, beta: 5 };
      for (let i = 0; i < 100; i++) {
        const sample = sampleBeta(params);
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      }
    });

    it("samples skew toward higher values for high alpha", () => {
      const params: BetaParams = { alpha: 50, beta: 2 };
      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(sampleBeta(params));
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      // Expected mean is 50/(50+2) ≈ 0.96
      expect(mean).toBeGreaterThan(0.9);
    });

    it("samples skew toward lower values for high beta", () => {
      const params: BetaParams = { alpha: 2, beta: 50 };
      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(sampleBeta(params));
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      // Expected mean is 2/(2+50) ≈ 0.04
      expect(mean).toBeLessThan(0.1);
    });

    it("handles symmetric distribution", () => {
      const params: BetaParams = { alpha: 5, beta: 5 };
      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(sampleBeta(params));
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      // Expected mean is 0.5
      expect(mean).toBeGreaterThan(0.4);
      expect(mean).toBeLessThan(0.6);
    });

    it("handles edge case alpha=1, beta=1 (uniform)", () => {
      const params: BetaParams = { alpha: 1, beta: 1 };
      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(sampleBeta(params));
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      // Uniform distribution has mean 0.5
      expect(mean).toBeGreaterThan(0.4);
      expect(mean).toBeLessThan(0.6);
    });

    it("handles small alpha and beta (< 1)", () => {
      const params: BetaParams = { alpha: 0.5, beta: 0.5 };
      for (let i = 0; i < 100; i++) {
        const sample = sampleBeta(params);
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("betaMean", () => {
    it("calculates correct mean for symmetric distribution", () => {
      expect(betaMean({ alpha: 5, beta: 5 })).toBeCloseTo(0.5);
    });

    it("calculates correct mean for skewed distribution", () => {
      expect(betaMean({ alpha: 3, beta: 1 })).toBeCloseTo(0.75);
      expect(betaMean({ alpha: 1, beta: 3 })).toBeCloseTo(0.25);
    });

    it("handles alpha=1, beta=1 (uniform)", () => {
      expect(betaMean({ alpha: 1, beta: 1 })).toBeCloseTo(0.5);
    });

    it("handles edge case alpha=0, beta=0", () => {
      expect(betaMean({ alpha: 0, beta: 0 })).toBeCloseTo(0.5);
    });
  });

  describe("betaVariance", () => {
    it("returns lower variance for larger alpha+beta (more data)", () => {
      const small = betaVariance({ alpha: 2, beta: 2 });
      const large = betaVariance({ alpha: 20, beta: 20 });
      expect(large).toBeLessThan(small);
    });

    it("calculates correct variance for uniform", () => {
      // Var(Beta(1,1)) = 1/(4*3) = 1/12 ≈ 0.0833
      expect(betaVariance({ alpha: 1, beta: 1 })).toBeCloseTo(1 / 12);
    });

    it("handles edge case alpha=0, beta=0", () => {
      expect(betaVariance({ alpha: 0, beta: 0 })).toBe(0);
    });
  });

  describe("updateBeta", () => {
    it("increments alpha on success (reward=1)", () => {
      const updated = updateBeta({ alpha: 3, beta: 2 }, 1);
      expect(updated.alpha).toBe(4);
      expect(updated.beta).toBe(2);
    });

    it("increments beta on failure (reward=0)", () => {
      const updated = updateBeta({ alpha: 3, beta: 2 }, 0);
      expect(updated.alpha).toBe(3);
      expect(updated.beta).toBe(3);
    });

    it("handles fractional rewards", () => {
      const updated = updateBeta({ alpha: 3, beta: 2 }, 0.5);
      expect(updated.alpha).toBe(3.5);
      expect(updated.beta).toBe(2.5);
    });

    it("is immutable (returns new object)", () => {
      const original = { alpha: 3, beta: 2 };
      const updated = updateBeta(original, 1);
      expect(original.alpha).toBe(3);
      expect(original.beta).toBe(2);
      expect(updated).not.toBe(original);
    });
  });

  describe("getInitialPrior", () => {
    it("returns optimistic prior for curated arms", () => {
      const prior = getInitialPrior("curated");
      expect(prior.alpha).toBe(3);
      expect(prior.beta).toBe(1);
      expect(betaMean(prior)).toBeCloseTo(0.75);
    });

    it("returns neutral prior for learned arms", () => {
      const prior = getInitialPrior("learned");
      expect(prior.alpha).toBe(1);
      expect(prior.beta).toBe(1);
      expect(betaMean(prior)).toBeCloseTo(0.5);
    });
  });

  describe("betaCredibleInterval", () => {
    it("returns interval containing mean", () => {
      const params: BetaParams = { alpha: 10, beta: 10 };
      const interval = betaCredibleInterval(params);
      const mean = betaMean(params);
      expect(interval.lower).toBeLessThan(mean);
      expect(interval.upper).toBeGreaterThan(mean);
    });

    it("interval is narrower with more data", () => {
      const smallData = betaCredibleInterval({ alpha: 2, beta: 2 });
      const largeData = betaCredibleInterval({ alpha: 50, beta: 50 });
      const smallWidth = smallData.upper - smallData.lower;
      const largeWidth = largeData.upper - largeData.lower;
      expect(largeWidth).toBeLessThan(smallWidth);
    });

    it("interval is bounded to [0, 1]", () => {
      const params: BetaParams = { alpha: 0.5, beta: 0.5 };
      const interval = betaCredibleInterval(params);
      expect(interval.lower).toBeGreaterThanOrEqual(0);
      expect(interval.upper).toBeLessThanOrEqual(1);
    });
  });

  describe("property-based tests", () => {
    it("sampleBeta always returns values in [0, 1] for random params", () => {
      for (let i = 0; i < 100; i++) {
        const alpha = Math.random() * 10 + 0.1;
        const beta = Math.random() * 10 + 0.1;
        const sample = sampleBeta({ alpha, beta });
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      }
    });

    it("betaMean always returns values in [0, 1]", () => {
      for (let i = 0; i < 100; i++) {
        const alpha = Math.random() * 100 + 0.1;
        const beta = Math.random() * 100 + 0.1;
        const mean = betaMean({ alpha, beta });
        expect(mean).toBeGreaterThanOrEqual(0);
        expect(mean).toBeLessThanOrEqual(1);
      }
    });

    it("betaVariance is always non-negative", () => {
      for (let i = 0; i < 100; i++) {
        const alpha = Math.random() * 100 + 0.1;
        const beta = Math.random() * 100 + 0.1;
        const variance = betaVariance({ alpha, beta });
        expect(variance).toBeGreaterThanOrEqual(0);
      }
    });

    it("updateBeta preserves sum of parameters", () => {
      for (let i = 0; i < 100; i++) {
        const alpha = Math.random() * 10 + 1;
        const beta = Math.random() * 10 + 1;
        const reward = Math.random();
        const original = { alpha, beta };
        const updated = updateBeta(original, reward);
        const originalSum = original.alpha + original.beta;
        const updatedSum = updated.alpha + updated.beta;
        // Update adds 1 total (reward + (1-reward) = 1)
        expect(updatedSum).toBeCloseTo(originalSum + 1);
      }
    });
  });
});
