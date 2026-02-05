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

// -- GHG Protocol Calculation Method --
export type GhgCalculationMethod = "supplier-specific" | "hybrid" | "average-data" | "spend-based";

// -- GHG Protocol Data Quality Score (1-5, lower is better) --
export type GhgDataQualityScore = 1 | 2 | 3 | 4 | 5;

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

  // GHG Protocol compliance (Scope 3, Category 1: Purchased Goods and Services)
  scope: 3;
  category: 1;
  calculationMethod: GhgCalculationMethod;
  dataQualityScore: GhgDataQualityScore;

  // Regional grid carbon (for location-based reporting)
  region?: string; // e.g., "us-west-2", "eu-west-1"
  regionGridCarbon?: number; // Actual regional gCO₂/kWh if available

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

  // TCFD intensity metrics
  totalTokens: number;
  intensityPerMillionTokens: number; // gCO₂eq per 1M tokens
  intensityPerQuery: number; // gCO₂eq per API call

  // ISO 14064 uncertainty bounds (multipliers)
  uncertaintyLower: number; // Lower bound multiplier (e.g., 0.5)
  uncertaintyUpper: number; // Upper bound multiplier (e.g., 1.5)
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

// -- SBTi Target Tracking --

export type SbtiPathway = "1.5C" | "well-below-2C" | "2C";

export type CarbonTarget = {
  targetId: string;
  name: string;
  baseYear: number;
  baseYearEmissionsGrams: number;
  targetYear: number;
  targetReductionPercent: number; // e.g., 42 for 42% reduction
  pathway: SbtiPathway;
  createdAt: number;
};

export type TargetProgress = {
  target: CarbonTarget;
  currentYearEmissionsGrams: number;
  progressPercent: number;
  onTrack: boolean;
  projectedEndYear: number | null; // When will target be met at current rate?
};

// -- Regulatory Export Types --

export type GhgProtocolExport = {
  reportingPeriod: string; // "2025-Q1"
  organizationalBoundary: string;
  scope3Category1: {
    emissions_tCO2eq: number;
    calculationMethod: string;
    dataQuality: string;
    uncertainty_percent: number;
    emissionFactorSources: string[];
  };
};

export type CdpExport = {
  reportingYear: number;
  scope3: {
    category1: {
      emissions_tCO2eq: number;
      methodology: string;
      methodologyDescription: string;
      dataQuality: "measured" | "calculated" | "estimated";
      percentageCalculatedUsingPrimaryData: number;
      emissionFactorSources: string[];
    };
  };
  intensity: Array<{
    metric: string;
    value: number;
    unit: string;
  }>;
};

export type TcfdExport = {
  absoluteEmissions: {
    scope3Cat1_tCO2eq: number;
    reportingPeriod: string;
    comparisonToBaseline?: { baseYear: number; changePercent: number };
  };
  carbonIntensity: {
    perMillionTokens_gCO2eq: number;
    perApiCall_gCO2eq: number;
  };
  targets?: TargetProgress[];
  historicalTrend: Array<{ period: string; emissions_tCO2eq: number }>;
};
