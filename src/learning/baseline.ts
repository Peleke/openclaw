/**
 * Baseline sampling utilities for counterfactual evaluation.
 *
 * A fraction of runs (baselineRate) should use the full prompt without
 * Thompson Sampling selection. This enables:
 * 1. Counterfactual evaluation (what would have happened with full prompt?)
 * 2. Continuous data collection for all arms
 * 3. Detection of concept drift
 */

import type { LearningConfig } from "./types.js";

/**
 * Check if this run should be a baseline run (full prompt, no selection).
 *
 * Uses true randomness - different result on each call.
 */
export function shouldRunBaseline(config: LearningConfig): boolean {
  const rate = config.baselineRate ?? 0.1;
  return Math.random() < rate;
}

/**
 * Check if this run should be a baseline run using a seed.
 *
 * Deterministic based on seed - same seed always gives same result.
 * Useful for reproducible testing.
 */
export function shouldRunBaselineSeeded(config: LearningConfig, seed: number): boolean {
  const rate = config.baselineRate ?? 0.1;
  return seededRandom(seed) < rate;
}

/**
 * Simple seeded random number generator.
 * Uses linear congruential generator (LCG) for deterministic output.
 */
function seededRandom(seed: number): number {
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;
  return ((seed * a + c) % m) / m;
}

/**
 * Generate a baseline seed from run context.
 * Combines session key and timestamp for reproducibility.
 */
export function generateBaselineSeed(sessionKey: string | undefined, timestamp: number): number {
  let hash = 0;
  const str = `${sessionKey ?? "default"}:${timestamp}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Calculate recommended baseline rate based on arm count.
 *
 * Higher baseline rate when there are few arms (need more data per arm).
 * Lower baseline rate when there are many arms (selection more valuable).
 */
export function recommendedBaselineRate(armCount: number): number {
  if (armCount <= 10) return 0.2; // 20% for small inventories
  if (armCount <= 50) return 0.1; // 10% for medium inventories
  return 0.05; // 5% for large inventories
}
