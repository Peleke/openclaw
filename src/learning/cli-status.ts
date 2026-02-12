/**
 * CLI status report for learning layer observability.
 * Sources data from qortex via gateway API or direct MCP connection.
 */

import { renderTable, type TableColumn } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";

// -- Summary/baseline shapes (used by renderer + API types) --

export type TraceSummary = {
  traceCount: number;
  armCount: number;
  totalTokens: number;
  minTimestamp: number | null;
  maxTimestamp: number | null;
};

export type BaselineComparison = {
  baselineRuns: number;
  selectedRuns: number;
  baselineAvgTokens: number | null;
  selectedAvgTokens: number | null;
  tokenSavingsPercent: number | null;
  baselineAvgDuration: number | null;
  selectedAvgDuration: number | null;
};

// -- Types for API-sourced data --

export type LearningStatusApiData = {
  summary: TraceSummary & {
    baseline: BaselineComparison;
  };
  config: {
    enabled?: boolean;
    phase: string;
    tokenBudget?: number;
    baselineRate?: number;
    minPulls?: number;
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
      theme.muted(
        "No observations recorded yet. Run some agent messages to start collecting data.",
      ),
    );
    return lines.join("\n");
  }

  const dateRange =
    summary.minTimestamp && summary.maxTimestamp
      ? `${new Date(summary.minTimestamp).toLocaleDateString()} \u2013 ${new Date(summary.maxTimestamp).toLocaleDateString()}`
      : "\u2013";

  lines.push(
    `  Observations: ${theme.accent(String(summary.traceCount))}    Arms: ${theme.accent(String(summary.armCount))}    Tokens: ${theme.accent(summary.totalTokens.toLocaleString())}    Range: ${theme.muted(dateRange)}`,
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
    lastUpdated: p.lastUpdated ? new Date(p.lastUpdated).toLocaleDateString() : "\u2013",
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

// -- Public: API-data-based --

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

// -- Public: Direct qortex MCP connection (CLI fallback when gateway unreachable) --

export async function formatLearningStatusFromQortex(): Promise<string> {
  const { QortexMcpConnection, parseCommandString } = await import("../qortex/connection.js");
  const { QortexLearningClient } = await import("./qortex-client.js");
  const { loadConfig } = await import("../config/io.js");

  const cfg = loadConfig();
  const learningCfg = cfg?.learning;
  const qortexCmd = learningCfg?.qortex?.command ?? "uvx qortex mcp-serve";

  const conn = new QortexMcpConnection(parseCommandString(qortexCmd));
  try {
    await conn.init();
    const client = new QortexLearningClient(conn, learningCfg?.learnerName);

    const [metrics, posteriorsResult] = await Promise.all([client.metrics(), client.posteriors()]);

    if (!metrics) {
      return theme.error("Failed to connect to qortex learning backend.");
    }

    const posteriors = posteriorsResult
      ? Object.entries(posteriorsResult.posteriors)
          .map(([armId, state]) => ({
            armId,
            alpha: state.alpha,
            beta: state.beta,
            pulls: state.pulls,
            mean: state.mean,
            lastUpdated: new Date(state.last_updated).getTime() || 0,
          }))
          .sort((a, b) => b.mean - a.mean)
      : [];

    const configParts: string[] = [];
    if (learningCfg?.tokenBudget)
      configParts.push(`Budget: ${learningCfg.tokenBudget.toLocaleString()}`);
    if (learningCfg?.baselineRate != null)
      configParts.push(`Baseline: ${(learningCfg.baselineRate * 100).toFixed(0)}%`);
    if (learningCfg?.minPulls) configParts.push(`Min pulls: ${learningCfg.minPulls}`);

    return renderLearningStatus({
      phase: learningCfg?.phase ?? "passive",
      configParts,
      summary: {
        traceCount: metrics.total_pulls,
        armCount: metrics.arm_count,
        totalTokens: 0,
        minTimestamp: null,
        maxTimestamp: null,
      },
      baseline: {
        baselineRuns: 0,
        selectedRuns: metrics.total_pulls,
        baselineAvgTokens: null,
        selectedAvgTokens: null,
        tokenSavingsPercent: null,
        baselineAvgDuration: null,
        selectedAvgDuration: null,
      },
      posteriors,
    });
  } finally {
    await conn.close();
  }
}
