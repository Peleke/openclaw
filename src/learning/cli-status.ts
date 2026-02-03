/**
 * CLI status report for learning layer observability.
 */

import type { DatabaseSync } from "node:sqlite";
import { getTraceSummary, loadPosteriors } from "./store.js";
import { renderTable, type TableColumn } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";

export function formatLearningStatus(db: DatabaseSync): string {
  const summary = getTraceSummary(db);
  const lines: string[] = [];

  // Summary header
  lines.push(theme.heading("Learning Layer Status"));
  lines.push("");

  if (summary.traceCount === 0) {
    lines.push(
      theme.muted("No traces recorded yet. Run some agent messages to start collecting data."),
    );
    return lines.join("\n");
  }

  const dateRange =
    summary.minTimestamp && summary.maxTimestamp
      ? `${new Date(summary.minTimestamp).toLocaleDateString()} – ${new Date(summary.maxTimestamp).toLocaleDateString()}`
      : "–";

  lines.push(
    `  Traces: ${theme.accent(String(summary.traceCount))}    Arms: ${theme.accent(String(summary.armCount))}    Tokens: ${theme.accent(summary.totalTokens.toLocaleString())}    Range: ${theme.muted(dateRange)}`,
  );
  lines.push("");

  // Posteriors table
  const posteriors = loadPosteriors(db);
  if (posteriors.size === 0) {
    lines.push(theme.muted("No arm posteriors yet."));
    return lines.join("\n");
  }

  const sorted = Array.from(posteriors.values())
    .map((p) => ({ ...p, mean: p.alpha / (p.alpha + p.beta) }))
    .sort((a, b) => b.mean - a.mean);

  const cols: TableColumn[] = [
    { key: "armId", header: "Arm", flex: true },
    { key: "mean", header: "Mean", align: "right", minWidth: 8 },
    { key: "pulls", header: "Pulls", align: "right", minWidth: 7 },
    { key: "lastUpdated", header: "Last Updated", align: "right", minWidth: 12 },
  ];

  const formatRow = (p: (typeof sorted)[0]) => ({
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
