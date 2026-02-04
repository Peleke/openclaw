/**
 * Default configuration and carbon factors.
 */

import type { CarbonFactor, GreenConfig } from "./types.js";

export const DEFAULT_GREEN_CONFIG: Required<GreenConfig> = {
  enabled: true,
  defaultGridCarbon: 400,
  showInStatus: true,
  dailyAlertThreshold: null,
};

export function resolveGreenConfig(config?: GreenConfig): Required<GreenConfig> {
  return {
    enabled: config?.enabled ?? DEFAULT_GREEN_CONFIG.enabled,
    defaultGridCarbon: config?.defaultGridCarbon ?? DEFAULT_GREEN_CONFIG.defaultGridCarbon,
    showInStatus: config?.showInStatus ?? DEFAULT_GREEN_CONFIG.showInStatus,
    dailyAlertThreshold: config?.dailyAlertThreshold ?? DEFAULT_GREEN_CONFIG.dailyAlertThreshold,
  };
}

/**
 * Default carbon factors based on academic research.
 * Sources: Luccioni et al. (2024), Patterson et al. (2022), Li et al. (2023)
 *
 * NOTE: These are CONSERVATIVE estimates. Actual values may be lower.
 * Confidence scores reflect data availability, not accuracy.
 */
export const DEFAULT_CARBON_FACTORS: CarbonFactor[] = [
  // Anthropic Claude models
  {
    provider: "anthropic",
    model: "claude-haiku",
    inputCo2Per1MTokens: 30,
    outputCo2Per1MTokens: 90,
    cacheReadCo2Per1MTokens: 3,
    waterMlPer1MTokens: 600,
    confidence: 0.35,
    source: "estimated",
    lastUpdated: Date.now(),
  },
  {
    provider: "anthropic",
    model: "claude-sonnet",
    inputCo2Per1MTokens: 150,
    outputCo2Per1MTokens: 450,
    cacheReadCo2Per1MTokens: 15,
    waterMlPer1MTokens: 3000,
    confidence: 0.3,
    source: "estimated",
    lastUpdated: Date.now(),
  },
  {
    provider: "anthropic",
    model: "claude-opus",
    inputCo2Per1MTokens: 400,
    outputCo2Per1MTokens: 1200,
    cacheReadCo2Per1MTokens: 40,
    waterMlPer1MTokens: 8000,
    confidence: 0.25,
    source: "estimated",
    lastUpdated: Date.now(),
  },
  // OpenAI models
  {
    provider: "openai",
    model: "gpt-4o-mini",
    inputCo2Per1MTokens: 40,
    outputCo2Per1MTokens: 120,
    cacheReadCo2Per1MTokens: 4,
    waterMlPer1MTokens: 800,
    confidence: 0.35,
    source: "estimated",
    lastUpdated: Date.now(),
  },
  {
    provider: "openai",
    model: "gpt-4o",
    inputCo2Per1MTokens: 200,
    outputCo2Per1MTokens: 600,
    cacheReadCo2Per1MTokens: 20,
    waterMlPer1MTokens: 4000,
    confidence: 0.3,
    source: "estimated",
    lastUpdated: Date.now(),
  },
  {
    provider: "openai",
    model: "gpt-4",
    inputCo2Per1MTokens: 300,
    outputCo2Per1MTokens: 900,
    cacheReadCo2Per1MTokens: 30,
    waterMlPer1MTokens: 6000,
    confidence: 0.25,
    source: "estimated",
    lastUpdated: Date.now(),
  },
];

/** Fallback factor for unknown models */
export const FALLBACK_CARBON_FACTOR: CarbonFactor = {
  provider: "unknown",
  model: "unknown",
  inputCo2Per1MTokens: 200,
  outputCo2Per1MTokens: 600,
  cacheReadCo2Per1MTokens: 20,
  waterMlPer1MTokens: 4000,
  confidence: 0.15,
  source: "fallback",
  lastUpdated: Date.now(),
};
