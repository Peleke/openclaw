/**
 * Green layer controller for gateway UI.
 * Fetches carbon tracking data from the green API endpoints.
 */

export type GreenConfig = {
  enabled: boolean;
  defaultGridCarbon: number;
  region?: string;
};

export type GreenSummary = {
  totalCo2Grams: number;
  totalWaterMl: number;
  traceCount: number;
  totalTokens: number;
  intensityPerMillionTokens: number;
  intensityPerQuery: number;
  avgConfidence: number;
  uncertaintyLower: number;
  uncertaintyUpper: number;
  minTimestamp: number | null;
  maxTimestamp: number | null;
  byProvider?: Record<
    string,
    {
      co2Grams: number;
      traceCount: number;
    }
  >;
};

export type GreenTarget = {
  targetId: string;
  name: string;
  baseYear: number;
  baseYearEmissionsGrams: number;
  targetYear: number;
  targetReductionPercent: number;
  pathway: "1.5C" | "well-below-2C" | "2C";
  createdAt: number;
};

export type GreenTargetProgress = {
  target: GreenTarget;
  currentYearEmissionsGrams: number;
  progressPercent: number;
  onTrack: boolean;
  projectedEndYear: number | null;
};

export type GreenState = {
  loading: boolean;
  config: GreenConfig | null;
  summary: GreenSummary | null;
  targets: GreenTarget[];
  targetProgress: GreenTargetProgress[];
  lastError: string | null;
  apiBase: string;
};

export function createGreenState(apiBase: string): GreenState {
  return {
    loading: false,
    config: null,
    summary: null,
    targets: [],
    targetProgress: [],
    lastError: null,
    apiBase,
  };
}

export async function loadGreenData(state: GreenState): Promise<void> {
  if (state.loading) return;
  state.loading = true;
  state.lastError = null;

  try {
    const [summaryRes, targetsRes, intensityRes] = await Promise.all([
      fetch(`${state.apiBase}/summary`).then((r) => r.json()),
      fetch(`${state.apiBase}/targets`).then((r) => r.json()),
      fetch(`${state.apiBase}/intensity`).then((r) => r.json()),
    ]);
    state.summary = {
      ...summaryRes,
      intensityPerMillionTokens: intensityRes.intensityPerMillionTokens,
      intensityPerQuery: intensityRes.intensityPerQuery,
      totalTokens: intensityRes.totalTokens,
      uncertaintyLower: intensityRes.uncertainty?.lower ?? 0.5,
      uncertaintyUpper: intensityRes.uncertainty?.upper ?? 1.5,
    };
    state.targets = targetsRes.targets ?? [];
    state.targetProgress = targetsRes.progress ?? [];
    state.config = {
      enabled: true,
      defaultGridCarbon: summaryRes.byProvider ? 400 : 400,
    };
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.loading = false;
  }
}

export function formatCo2(grams: number): string {
  if (grams >= 1_000_000) {
    return `${(grams / 1_000_000).toFixed(2)} t`;
  }
  if (grams >= 1000) {
    return `${(grams / 1000).toFixed(2)} kg`;
  }
  return `${grams.toFixed(2)} g`;
}

export function formatWater(ml: number): string {
  if (ml >= 1000) {
    return `${(ml / 1000).toFixed(1)} L`;
  }
  return `${ml.toFixed(0)} ml`;
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.7) return "High";
  if (confidence >= 0.5) return "Medium";
  if (confidence >= 0.3) return "Low";
  return "Very Low";
}

export function dataQualityScore(confidence: number): 1 | 2 | 3 | 4 | 5 {
  if (confidence >= 0.8) return 1;
  if (confidence >= 0.6) return 2;
  if (confidence >= 0.4) return 3;
  if (confidence >= 0.2) return 4;
  return 5;
}
