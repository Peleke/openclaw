/**
 * CLI status report for learning layer observability.
 * Supports both local DB reads and pre-fetched API data.
 */

import type { DatabaseSync } from "node:sqlite";
import type { LearningConfig } from "./types.js";
import { getTraceSummary, loadPosteriors, getBaselineComparison } from "./store.js";
import type { TraceSummary, BaselineComparison } from "./store.js";
import { renderTable, type TableColumn } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";

// -- Types for API-sourced data --

export type LearningStatusApiData = {
  summary: TraceSummary & {
    baseline: BaselineComparison;
  };
  config: {
    enabled?: boolean;
    phase: string;
    strategy?: string;
    tokenBudget?: number;
    baselineRate?: number;
    minPulls?: number;
    seedArmIds?: string[];
  };
  posteriors: Array<{
    armId: string;
    alpha: number;
    beta: number;
    pulls: number;
    lastUpdated: number;
    mean: number;
  }>;
};

// -- Internal rendering data shape --

type PosteriorRow = {
  armId: string;
  alpha: number;
  beta: number;
  pulls: number;
  lastUpdated: number;
  mean: number;
};

type LearningRenderData = {
  phase: string;
  configParts: string[];
  summary: TraceSummary;
  baseline: BaselineComparison;
  posteriors: PosteriorRow[];
};

// -- Shared renderer --

function renderLearningStatus(data: LearningRenderData): string {
  const { summary, baseline } = data;
  const lines: string[] = [];

  // Summary header with mode badge
  const phaseColor = data.phase === "active" ? theme.success : theme.muted;
  lines.push(
    theme.heading("Learning Layer Status") + "  " + phaseColor(`[${data.phase.toUpperCase()}]`),
  );
  lines.push("");

  // Config info
  if (data.configParts.length > 0) {
    lines.push(theme.muted("  " + data.configParts.join("  |  ")));
    lines.push("");
  }

  if (summary.traceCount === 0) {
    lines.push(
      theme.muted("No traces recorded yet. Run some agent messages to start collecting data."),
    );
    return lines.join("\n");
  }

  const dateRange =
    summary.minTimestamp && summary.maxTimestamp
      ? `${new Date(summary.minTimestamp).toLocaleDateString()} \u2013 ${new Date(summary.maxTimestamp).toLocaleDateString()}`
      : "\u2013";

  lines.push(
    `  Traces: ${theme.accent(String(summary.traceCount))}    Arms: ${theme.accent(String(summary.armCount))}    Tokens: ${theme.accent(summary.totalTokens.toLocaleString())}    Range: ${theme.muted(dateRange)}`,
  );
  lines.push("");

  // Baseline comparison
  const totalRuns = baseline.baselineRuns + baseline.selectedRuns;
  if (totalRuns > 0) {
    const baselinePct = ((baseline.baselineRuns / totalRuns) * 100).toFixed(1);
    const selectedPct = ((baseline.selectedRuns / totalRuns) * 100).toFixed(1);

    lines.push(theme.heading("Run Distribution"));
    lines.push(
      `  Baseline: ${theme.muted(String(baseline.baselineRuns))} (${baselinePct}%)    Selected: ${theme.accent(String(baseline.selectedRuns))} (${selectedPct}%)`,
    );

    if (baseline.tokenSavingsPercent != null) {
      const savingsColor = baseline.tokenSavingsPercent > 0 ? theme.success : theme.error;
      const sign = baseline.tokenSavingsPercent > 0 ? "+" : "";
      lines.push(
        `  Token Savings: ${savingsColor(sign + baseline.tokenSavingsPercent.toFixed(1) + "%")}` +
          theme.muted(
            ` (baseline avg: ${baseline.baselineAvgTokens?.toFixed(0) ?? "\u2013"}, selected avg: ${baseline.selectedAvgTokens?.toFixed(0) ?? "\u2013"})`,
          ),
      );
    }
    lines.push("");
  }

  // Posteriors table
  const sorted = data.posteriors;
  if (sorted.length === 0) {
    lines.push(theme.muted("No arm posteriors yet."));
    return lines.join("\n");
  }

  const cols: TableColumn[] = [
    { key: "armId", header: "Arm", flex: true },
    { key: "mean", header: "Mean", align: "right", minWidth: 8 },
    { key: "pulls", header: "Pulls", align: "right", minWidth: 7 },
    { key: "lastUpdated", header: "Last Updated", align: "right", minWidth: 12 },
  ];

  const formatRow = (p: PosteriorRow) => ({
    armId: p.armId,
    mean: p.mean.toFixed(3),
    pulls: String(p.pulls),
    lastUpdated: new Date(p.lastUpdated).toLocaleDateString(),
  });

  // Top 5
  const top = sorted.slice(0, 5);
  if (top.length > 0) {
    lines.push(theme.heading("Top Arms (highest posterior mean)"));
    lines.push(renderTable({ columns: cols, rows: top.map(formatRow) }));
  }

  // Bottom 5
  const bottom = sorted.slice(-5).reverse();
  if (bottom.length > 0 && sorted.length > 5) {
    lines.push(theme.heading("Bottom Arms (candidates for exclusion)"));
    lines.push(renderTable({ columns: cols, rows: bottom.map(formatRow) }));
  }

  return lines.join("\n");
}

// -- Public: DB-based (existing) --

export type FormatLearningStatusOpts = {
  db: DatabaseSync;
  config?: LearningConfig | null;
};

export function formatLearningStatus(dbOrOpts: DatabaseSync | FormatLearningStatusOpts): string {
  // Support both old signature (db only) and new signature (opts object)
  const opts: FormatLearningStatusOpts = "db" in dbOrOpts ? dbOrOpts : { db: dbOrOpts };
  const { db, config } = opts;

  const summary = getTraceSummary(db);
  const baseline = getBaselineComparison(db);
  const phase = config?.phase ?? "passive";

  const configParts: string[] = [];
  if (config) {
    if (config.tokenBudget) configParts.push(`Budget: ${config.tokenBudget.toLocaleString()}`);
    if (config.baselineRate != null)
      configParts.push(`Baseline: ${(config.baselineRate * 100).toFixed(0)}%`);
    if (config.minPulls) configParts.push(`Min pulls: ${config.minPulls}`);
  }

  const posteriorMap = loadPosteriors(db);
  const posteriors = Array.from(posteriorMap.values())
    .map((p) => ({ ...p, mean: p.alpha / (p.alpha + p.beta) }))
    .sort((a, b) => b.mean - a.mean);

  return renderLearningStatus({
    phase,
    configParts,
    summary,
    baseline,
    posteriors,
  });
}

// -- Public: API-data-based (new) --

export function formatLearningStatusFromApi(data: LearningStatusApiData): string {
  const { summary, config, posteriors } = data;

  const configParts: string[] = [];
  if (config.tokenBudget) configParts.push(`Budget: ${config.tokenBudget.toLocaleString()}`);
  if (config.baselineRate != null)
    configParts.push(`Baseline: ${(config.baselineRate * 100).toFixed(0)}%`);
  if (config.minPulls) configParts.push(`Min pulls: ${config.minPulls}`);

  // posteriors come pre-sorted from API (by mean descending)
  return renderLearningStatus({
    phase: config.phase ?? "passive",
    configParts,
    summary,
    baseline: summary.baseline,
    posteriors,
  });
}
