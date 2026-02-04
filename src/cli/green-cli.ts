/**
 * CLI subcommands for green layer observability.
 * Registered lazily via register.subclis.ts.
 */

import type { Command } from "commander";
import { resolveOpenClawAgentDir } from "../agents/agent-paths.js";

async function openDb() {
  const { openGreenDb } = await import("../green/store.js");
  const agentDir = resolveOpenClawAgentDir();
  return openGreenDb(agentDir);
}

export function registerGreenCli(program: Command) {
  const green = program.command("green").description("Environmental impact tracking");

  green
    .command("status")
    .description("Show environmental impact summary")
    .action(async () => {
      const { formatGreenStatus } = await import("../green/cli-status.js");
      const db = await openDb();
      try {
        console.log(formatGreenStatus(db));
      } finally {
        db.close();
      }
    });

  green
    .command("export")
    .description("Export carbon traces to JSON")
    .option("--limit <n>", "Maximum traces to export", "1000")
    .action(async (opts) => {
      const { listCarbonTraces, getCarbonSummary } = await import("../green/store.js");
      const db = await openDb();
      try {
        const limit = Math.min(parseInt(opts.limit, 10), 10000);
        const { traces, total } = listCarbonTraces(db, { limit });
        const summary = getCarbonSummary(db);
        const output = JSON.stringify({ summary, traces, total }, null, 2);
        process.stdout.write(output + "\n");
      } finally {
        db.close();
      }
    });

  green
    .command("factors")
    .description("Show carbon factor estimates")
    .action(async () => {
      const { DEFAULT_CARBON_FACTORS, FALLBACK_CARBON_FACTOR } = await import("../green/config.js");
      const { formatConfidence } = await import("../green/carbon-calculator.js");
      const { renderTable } = await import("../terminal/table.js");
      const { theme } = await import("../terminal/theme.js");

      console.log(theme.heading("Carbon Factors (gCO\u2082eq per 1M tokens)"));
      console.log("");

      const cols = [
        { key: "provider", header: "Provider", flex: true },
        { key: "model", header: "Model", flex: true },
        { key: "input", header: "Input", align: "right" as const, minWidth: 8 },
        { key: "output", header: "Output", align: "right" as const, minWidth: 8 },
        { key: "conf", header: "Conf", align: "right" as const, minWidth: 6 },
      ];

      const rows = DEFAULT_CARBON_FACTORS.map((f) => ({
        provider: f.provider,
        model: f.model,
        input: String(f.inputCo2Per1MTokens),
        output: String(f.outputCo2Per1MTokens),
        conf: `${(f.confidence * 100).toFixed(0)}%`,
      }));

      console.log(renderTable({ columns: cols, rows }));
      console.log("");
      console.log(
        theme.muted(
          `Fallback: ${FALLBACK_CARBON_FACTOR.inputCo2Per1MTokens}/${FALLBACK_CARBON_FACTOR.outputCo2Per1MTokens} gCO\u2082 (${(FALLBACK_CARBON_FACTOR.confidence * 100).toFixed(0)}% confidence)`,
        ),
      );
    });
}
