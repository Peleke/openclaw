/**
 * CLI export for learning layer data (JSON/CSV to stdout).
 * Sources data from qortex via direct MCP connection.
 */

import type { QortexArmState, QortexMetricsResult } from "./qortex-client.js";

export type ExportOptions = {
  format: "json" | "csv";
};

/** Flat posterior row for export. */
type PosteriorRow = { armId: string } & QortexArmState;

/**
 * Export learning data by connecting directly to qortex MCP.
 * Used by `openclaw learning export`.
 */
export async function exportLearningDataFromQortex(opts: ExportOptions): Promise<string> {
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

    // Convert posteriors map to flat array
    const posteriors: PosteriorRow[] = posteriorsResult
      ? Object.entries(posteriorsResult.posteriors).map(([armId, state]) => ({
          armId,
          ...state,
        }))
      : [];

    if (opts.format === "csv") {
      return exportCsv(posteriors);
    }
    return exportJson(posteriors, metrics);
  } finally {
    await conn.close();
  }
}

function exportJson(posteriors: PosteriorRow[], metrics: QortexMetricsResult | null): string {
  return JSON.stringify(
    {
      metrics: metrics ?? {
        total_pulls: 0,
        total_reward: 0,
        accuracy: 0,
        arm_count: 0,
        explore_ratio: 0,
      },
      posteriors: posteriors.map((p) => ({
        armId: p.armId,
        alpha: p.alpha,
        beta: p.beta,
        mean: p.mean,
        pulls: p.pulls,
        lastUpdated: p.last_updated,
      })),
    },
    null,
    2,
  );
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportCsv(posteriors: PosteriorRow[]): string {
  const header = "armId,alpha,beta,mean,pulls,lastUpdated";
  const rows = posteriors.map((p) =>
    [
      csvEscape(p.armId),
      p.alpha.toFixed(4),
      p.beta.toFixed(4),
      p.mean.toFixed(4),
      String(p.pulls),
      String(p.last_updated),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}
