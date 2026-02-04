/**
 * Learning layer controller for gateway UI.
 */

import type { GatewayBrowserClient } from "../gateway";

export type LearningConfig = {
  enabled: boolean;
  phase: "passive" | "active";
  strategy: string;
  tokenBudget: number;
  baselineRate: number;
  minPulls: number;
  seedArmIds: string[];
};

export type LearningBaseline = {
  baselineRuns: number;
  selectedRuns: number;
  baselineAvgTokens: number | null;
  selectedAvgTokens: number | null;
  tokenSavingsPercent: number | null;
};

export type LearningSummary = {
  traceCount: number;
  armCount: number;
  minTimestamp: number | null;
  maxTimestamp: number | null;
  totalTokens: number;
  baseline: LearningBaseline;
};

export type LearningPosterior = {
  armId: string;
  alpha: number;
  beta: number;
  mean: number;
  pulls: number;
  isSeed: boolean;
  isUnderexplored: boolean;
  confidence: "low" | "medium" | "high";
};

export type LearningState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  loading: boolean;
  config: LearningConfig | null;
  summary: LearningSummary | null;
  posteriors: LearningPosterior[];
  lastError: string | null;
  dashboardUrl: string;
};

export function createLearningState(dashboardUrl: string): LearningState {
  return {
    client: null,
    connected: false,
    loading: false,
    config: null,
    summary: null,
    posteriors: [],
    lastError: null,
    dashboardUrl,
  };
}

export async function loadLearningData(state: LearningState): Promise<void> {
  if (state.loading) return;
  state.loading = true;
  state.lastError = null;

  try {
    const baseUrl = state.dashboardUrl.replace(/\/dashboard\/?$/, "");
    const [configRes, summaryRes, posteriorsRes] = await Promise.all([
      fetch(`${baseUrl}/config`).then((r) => r.json()),
      fetch(`${baseUrl}/summary`).then((r) => r.json()),
      fetch(`${baseUrl}/posteriors`).then((r) => r.json()),
    ]);
    state.config = configRes;
    state.summary = summaryRes;
    state.posteriors = posteriorsRes.slice(0, 10); // Top 10 for UI
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.loading = false;
  }
}
