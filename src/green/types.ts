/**
 * Core types for the OpenClaw green (environmental impact) layer.
 */

// -- Carbon Factor Types --

export type CarbonFactorSource = "measured" | "research" | "estimated" | "fallback";

export type CarbonFactor = {
  provider: string;
  model: string;
  /** grams CO₂eq per 1M input tokens */
  inputCo2Per1MTokens: number;
  /** grams CO₂eq per 1M output tokens */
  outputCo2Per1MTokens: number;
  /** grams CO₂eq per 1M cache read tokens */
  cacheReadCo2Per1MTokens: number;
  /** milliliters water per 1M tokens */
  waterMlPer1MTokens: number;
  /** 0.0-1.0 confidence in this estimate */
  confidence: number;
  source: CarbonFactorSource;
  lastUpdated: number;
};

// -- Carbon Trace Types --

export type CarbonTrace = {
  traceId: string;
  runId: string;
  sessionId: string;
  sessionKey?: string;
  timestamp: number;
  provider?: string;
  model?: string;
  channel?: string;

  // Token usage
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;

  // Computed carbon (grams)
  inputCo2Grams: number;
  outputCo2Grams: number;
  cacheCo2Grams: number;
  totalCo2Grams: number;

  // Computed water (ml)
  waterMl: number;

  // Metadata
  factorConfidence: number;
  factorSource: CarbonFactorSource;
  gridCarbonUsed: number;

  durationMs?: number;
  aborted: boolean;
  error?: string;
};

// -- Summary Types --

export type CarbonSummary = {
  traceCount: number;
  totalCo2Grams: number;
  totalWaterMl: number;
  avgCo2PerTrace: number;
  avgConfidence: number;
  minTimestamp: number | null;
  maxTimestamp: number | null;
};

export type CarbonEquivalents = {
  carKm: number;
  phoneCharges: number;
  treeDays: number;
  googleSearches: number;
};

export type ProviderBreakdown = {
  provider: string;
  traceCount: number;
  totalCo2Grams: number;
  percentage: number;
};

// -- Config Type --

export type GreenConfig = {
  /** Enable environmental tracking. Default: true */
  enabled?: boolean;
  /** Default grid carbon intensity (gCO₂/kWh). Default: 400 */
  defaultGridCarbon?: number;
  /** Show in CLI status output. Default: true */
  showInStatus?: boolean;
  /** Daily alert threshold in grams. Default: null */
  dailyAlertThreshold?: number | null;
};

// -- Time Series --

export type CarbonTimeseriesBucket = {
  t: number;
  co2Grams: number;
  traceCount: number;
};
