/**
 * CLI status report for green layer observability.
 * Supports both local DB reads and pre-fetched API data.
 */

import type { DatabaseSync } from "node:sqlite";
import type {
  GreenConfig,
  CarbonSummary,
  CarbonEquivalents,
  ProviderBreakdown,
  CarbonTarget,
  TargetProgress,
} from "./types.js";
import {
  getCarbonSummary,
  getProviderBreakdown,
  listCarbonTargets,
  getTargetProgress,
} from "./store.js";
import {
  calculateEquivalents,
  formatConfidence,
  confidenceToDataQuality,
  formatDataQuality,
} from "./carbon-calculator.js";
import { renderTable, type TableColumn } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import { resolveGreenConfig } from "./config.js";

// -- Types for API-sourced data --

export type GreenStatusApiData = {
  summary: CarbonSummary & {
    equivalents: CarbonEquivalents;
    providers: ProviderBreakdown[];
    confidence: { label: string; color: string };
  };
  config: {
    enabled: boolean;
    defaultGridCarbon: number;
    showInStatus?: boolean;
    dailyAlertThreshold?: number | null;
  };
  targets: {
    targets: CarbonTarget[];
    progress: TargetProgress[];
  };
};

// -- Internal rendering data shape --

type GreenRenderData = {
  enabled: boolean;
  defaultGridCarbon: number;
  summary: CarbonSummary;
  confidenceLabel: string;
  equivalents: CarbonEquivalents;
  providers: ProviderBreakdown[];
  targets: CarbonTarget[];
  targetProgress: (TargetProgress | null)[];
};

// -- Shared renderer --

function renderGreenStatus(data: GreenRenderData): string {
  const { summary, enabled } = data;
  const lines: string[] = [];

  // Header
  const statusLabel = enabled ? "TRACKING" : "DISABLED";
  const statusColor = enabled ? theme.success : theme.muted;
  lines.push(theme.heading("Environmental Impact") + "  " + statusColor(`[${statusLabel}]`));
  lines.push("");

  // Config info
  const configParts = [`Grid: ${data.defaultGridCarbon} gCO\u2082/kWh`];
  lines.push(theme.muted("  " + configParts.join("  |  ")));
  lines.push("");

  if (summary.traceCount === 0) {
    lines.push(
      theme.muted("No carbon traces recorded yet. Run some agent messages to start tracking."),
    );
    return lines.join("\n");
  }

  // Summary stats
  const dateRange =
    summary.minTimestamp && summary.maxTimestamp
      ? `${new Date(summary.minTimestamp).toLocaleDateString()} \u2013 ${new Date(summary.maxTimestamp).toLocaleDateString()}`
      : "\u2013";

  const co2Display =
    summary.totalCo2Grams >= 1000
      ? `${(summary.totalCo2Grams / 1000).toFixed(2)} kg`
      : `${summary.totalCo2Grams.toFixed(1)} g`;

  const waterDisplay =
    summary.totalWaterMl >= 1000
      ? `${(summary.totalWaterMl / 1000).toFixed(1)} L`
      : `${summary.totalWaterMl.toFixed(0)} ml`;

  lines.push(
    `  Carbon: ${theme.accent(co2Display)} CO\u2082eq    Water: ${theme.accent(waterDisplay)}    Traces: ${theme.accent(String(summary.traceCount))}    Since: ${theme.muted(dateRange)}`,
  );
  lines.push(
    `  Confidence: ${theme.muted(`${(summary.avgConfidence * 100).toFixed(0)}% (${data.confidenceLabel})`)}`,
  );
  lines.push("");

  // Equivalents
  const equiv = data.equivalents;
  lines.push(
    theme.muted(
      `  \u2248 Driving ${equiv.carKm.toFixed(1)} km  |  \u2248 ${equiv.phoneCharges} phone charges  |  \u2248 ${equiv.treeDays.toFixed(1)} tree-days`,
    ),
  );
  lines.push("");

  // Provider breakdown
  if (data.providers.length > 0) {
    lines.push(theme.heading("Provider Breakdown"));

    const cols: TableColumn[] = [
      { key: "provider", header: "Provider", flex: true },
      { key: "traces", header: "Traces", align: "right", minWidth: 8 },
      { key: "co2", header: "CO\u2082", align: "right", minWidth: 10 },
      { key: "pct", header: "%", align: "right", minWidth: 6 },
    ];

    const rows = data.providers.map((p) => ({
      provider: p.provider,
      traces: String(p.traceCount),
      co2:
        p.totalCo2Grams >= 1000
          ? `${(p.totalCo2Grams / 1000).toFixed(2)} kg`
          : `${p.totalCo2Grams.toFixed(1)} g`,
      pct: `${p.percentage.toFixed(0)}%`,
    }));

    lines.push(renderTable({ columns: cols, rows }));
  }

  // TCFD Intensity Metrics
  if (summary.totalTokens > 0) {
    lines.push("");
    lines.push(theme.heading("Intensity Metrics (TCFD)"));
    lines.push(
      `  Per 1M tokens: ${theme.accent(summary.intensityPerMillionTokens.toFixed(2))} gCO\u2082eq    Per query: ${theme.accent(summary.intensityPerQuery.toFixed(4))} gCO\u2082eq`,
    );

    // Data quality indicator
    const dqScore = confidenceToDataQuality(summary.avgConfidence);
    const dq = formatDataQuality(dqScore);
    lines.push(
      `  Data quality: ${theme.muted(`${dqScore}/5 (${dq.label})`)}    Uncertainty: ${theme.muted(`\u00B1${(((summary.uncertaintyUpper - summary.uncertaintyLower) / 2) * 100).toFixed(0)}%`)}`,
    );
  }

  // SBTi Targets
  if (data.targets.length > 0) {
    lines.push("");
    lines.push(theme.heading("Emission Targets (SBTi)"));

    for (let i = 0; i < Math.min(data.targets.length, 3); i++) {
      const target = data.targets[i];
      const progress = data.targetProgress[i];
      const statusIcon = progress?.onTrack ? "\u2713" : "\u26A0";
      const sColor = progress?.onTrack ? theme.success : theme.warn;
      const progressPct = progress?.progressPercent.toFixed(0) ?? "?";
      lines.push(
        `  ${sColor(statusIcon)} ${target.name}: ${progressPct}% toward ${target.targetReductionPercent}% reduction by ${target.targetYear}`,
      );
    }
    if (data.targets.length > 3) {
      lines.push(theme.muted(`  ... and ${data.targets.length - 3} more targets`));
    }
  }

  return lines.join("\n");
}

// -- Public: DB-based (existing) --

export type FormatGreenStatusOpts = {
  db: DatabaseSync;
  config?: GreenConfig | null;
};

export function formatGreenStatus(dbOrOpts: DatabaseSync | FormatGreenStatusOpts): string {
  const opts: FormatGreenStatusOpts = "db" in dbOrOpts ? dbOrOpts : { db: dbOrOpts };
  const { db, config } = opts;

  const resolved = resolveGreenConfig(config ?? undefined);
  const summary = getCarbonSummary(db);
  const providers = getProviderBreakdown(db);
  const targets = listCarbonTargets(db);
  const targetProgress = targets.map((t) => getTargetProgress(db, t.targetId));
  const confidence = formatConfidence(summary.avgConfidence);
  const equivalents = calculateEquivalents(summary.totalCo2Grams);

  return renderGreenStatus({
    enabled: resolved.enabled,
    defaultGridCarbon: resolved.defaultGridCarbon,
    summary,
    confidenceLabel: confidence.label,
    equivalents,
    providers,
    targets,
    targetProgress,
  });
}

// -- Public: API-data-based (new) --

export function formatGreenStatusFromApi(data: GreenStatusApiData): string {
  const { summary, config, targets: targetsData } = data;

  return renderGreenStatus({
    enabled: config.enabled,
    defaultGridCarbon: config.defaultGridCarbon,
    summary,
    confidenceLabel: summary.confidence.label,
    equivalents: summary.equivalents,
    providers: summary.providers,
    targets: targetsData.targets,
    targetProgress: targetsData.progress,
  });
}
