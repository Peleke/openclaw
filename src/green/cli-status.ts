/**
 * CLI status report for green layer observability.
 */

import type { DatabaseSync } from "node:sqlite";
import type { GreenConfig } from "./types.js";
import { getCarbonSummary, getProviderBreakdown } from "./store.js";
import { calculateEquivalents, formatConfidence } from "./carbon-calculator.js";
import { renderTable, type TableColumn } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import { resolveGreenConfig } from "./config.js";

export type FormatGreenStatusOpts = {
  db: DatabaseSync;
  config?: GreenConfig | null;
};

export function formatGreenStatus(dbOrOpts: DatabaseSync | FormatGreenStatusOpts): string {
  const opts: FormatGreenStatusOpts = "db" in dbOrOpts ? dbOrOpts : { db: dbOrOpts };
  const { db, config } = opts;

  const resolved = resolveGreenConfig(config ?? undefined);
  const summary = getCarbonSummary(db);
  const lines: string[] = [];

  // Header
  const statusLabel = resolved.enabled ? "TRACKING" : "DISABLED";
  const statusColor = resolved.enabled ? theme.success : theme.muted;
  lines.push(theme.heading("Environmental Impact") + "  " + statusColor(`[${statusLabel}]`));
  lines.push("");

  // Config info
  const configParts = [`Grid: ${resolved.defaultGridCarbon} gCO\u2082/kWh`];
  lines.push(theme.muted("  " + configParts.join("  |  ")));
  lines.push("");

  if (summary.traceCount === 0) {
    lines.push(
      theme.muted("No carbon traces recorded yet. Run some agent messages to start tracking."),
    );
    return lines.join("\n");
  }

  // Summary stats
  const confidence = formatConfidence(summary.avgConfidence);
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
    `  Confidence: ${theme.muted(`${(summary.avgConfidence * 100).toFixed(0)}% (${confidence.label})`)}`,
  );
  lines.push("");

  // Equivalents
  const equiv = calculateEquivalents(summary.totalCo2Grams);
  lines.push(
    theme.muted(
      `  \u2248 Driving ${equiv.carKm.toFixed(1)} km  |  \u2248 ${equiv.phoneCharges} phone charges  |  \u2248 ${equiv.treeDays.toFixed(1)} tree-days`,
    ),
  );
  lines.push("");

  // Provider breakdown
  const providers = getProviderBreakdown(db);
  if (providers.length > 0) {
    lines.push(theme.heading("Provider Breakdown"));

    const cols: TableColumn[] = [
      { key: "provider", header: "Provider", flex: true },
      { key: "traces", header: "Traces", align: "right", minWidth: 8 },
      { key: "co2", header: "CO\u2082", align: "right", minWidth: 10 },
      { key: "pct", header: "%", align: "right", minWidth: 6 },
    ];

    const rows = providers.map((p) => ({
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

  return lines.join("\n");
}
