/**
 * Carbon footprint calculation from token usage.
 */

import type { CarbonFactor } from "./types.js";
import { DEFAULT_CARBON_FACTORS, FALLBACK_CARBON_FACTOR } from "./config.js";

export type TokenUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
};

export type CarbonCalculation = {
  inputCo2Grams: number;
  outputCo2Grams: number;
  cacheCo2Grams: number;
  totalCo2Grams: number;
  waterMl: number;
  factor: CarbonFactor;
};

/**
 * Find the best matching carbon factor for a provider/model combination.
 * Matches by prefix (e.g., "claude-sonnet-4" matches "claude-sonnet").
 */
export function findCarbonFactor(provider?: string, model?: string): CarbonFactor {
  if (!provider || !model) return FALLBACK_CARBON_FACTOR;

  const normalizedProvider = provider.toLowerCase();
  const normalizedModel = model.toLowerCase();

  // Try exact provider + model prefix match
  for (const factor of DEFAULT_CARBON_FACTORS) {
    if (factor.provider === normalizedProvider && normalizedModel.includes(factor.model)) {
      return factor;
    }
  }

  // Try just provider match (use largest model as conservative estimate)
  const providerFactors = DEFAULT_CARBON_FACTORS.filter((f) => f.provider === normalizedProvider);
  if (providerFactors.length > 0) {
    // Return the one with highest CO2 (most conservative)
    return providerFactors.reduce((a, b) =>
      a.inputCo2Per1MTokens > b.inputCo2Per1MTokens ? a : b,
    );
  }

  return FALLBACK_CARBON_FACTOR;
}

/**
 * Calculate carbon footprint from token usage.
 */
export function calculateCarbon(
  usage: TokenUsage,
  provider?: string,
  model?: string,
): CarbonCalculation {
  const factor = findCarbonFactor(provider, model);

  const inputTokens = usage.input ?? 0;
  const outputTokens = usage.output ?? 0;
  const cacheReadTokens = usage.cacheRead ?? 0;

  // Convert to grams (factors are per 1M tokens)
  const inputCo2Grams = (inputTokens / 1_000_000) * factor.inputCo2Per1MTokens;
  const outputCo2Grams = (outputTokens / 1_000_000) * factor.outputCo2Per1MTokens;
  const cacheCo2Grams = (cacheReadTokens / 1_000_000) * factor.cacheReadCo2Per1MTokens;
  const totalCo2Grams = inputCo2Grams + outputCo2Grams + cacheCo2Grams;

  const totalTokens = inputTokens + outputTokens + cacheReadTokens;
  const waterMl = (totalTokens / 1_000_000) * factor.waterMlPer1MTokens;

  return {
    inputCo2Grams,
    outputCo2Grams,
    cacheCo2Grams,
    totalCo2Grams,
    waterMl,
    factor,
  };
}

/**
 * Calculate relatable equivalents for CO2 amount.
 */
export function calculateEquivalents(co2Grams: number) {
  return {
    // 1 km driving = ~120g CO2
    carKm: co2Grams / 120,
    // 1 phone charge = ~10g CO2
    phoneCharges: Math.round(co2Grams / 10),
    // 1 tree absorbs ~48g CO2 per day
    treeDays: co2Grams / 48,
    // 1 Google search = ~0.2g CO2
    googleSearches: Math.round(co2Grams / 0.2),
  };
}

/**
 * Format confidence level for display.
 */
export function formatConfidence(confidence: number): {
  label: "high" | "medium" | "low" | "very_low";
  description: string;
} {
  if (confidence >= 0.7) {
    return { label: "high", description: "Based on published provider data" };
  }
  if (confidence >= 0.5) {
    return { label: "medium", description: "Based on academic research" };
  }
  if (confidence >= 0.3) {
    return { label: "low", description: "Estimated from similar models" };
  }
  return { label: "very_low", description: "Fallback estimate" };
}
