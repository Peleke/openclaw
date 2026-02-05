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
    .option("--host <host>", "Gateway host override")
    .option("--port <port>", "Gateway port override")
    .action(async (opts: { host?: string; port?: string }) => {
      const { fetchGatewayJson } = await import("../infra/gateway-http.js");
      const apiOpts = { host: opts.host, port: opts.port };

      // Try gateway API first (live data)
      const [summary, config, targets] = await Promise.all([
        fetchGatewayJson("/__openclaw__/api/green", "/summary", apiOpts),
        fetchGatewayJson("/__openclaw__/api/green", "/config", apiOpts),
        fetchGatewayJson("/__openclaw__/api/green", "/targets", apiOpts),
      ]);

      if (summary && config && targets) {
        const { formatGreenStatusFromApi } = await import("../green/cli-status.js");
        console.log(
          formatGreenStatusFromApi({ summary, config, targets } as Parameters<
            typeof formatGreenStatusFromApi
          >[0]),
        );
        return;
      }

      // Fallback: local DB
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
    .description("Export carbon data in regulatory formats")
    .option("--format <format>", "Export format: json, ghg-protocol, cdp, tcfd, iso14064", "json")
    .option(
      "--period <period>",
      "Reporting period (e.g., 2025, 2025-Q1)",
      String(new Date().getFullYear()),
    )
    .option("--baseline <year>", "Baseline year for comparison")
    .option("--limit <n>", "Maximum traces for JSON export", "1000")
    .action(async (opts) => {
      const db = await openDb();
      try {
        let output: string;

        switch (opts.format) {
          case "ghg-protocol": {
            const { exportGhgProtocol } = await import("../green/exports.js");
            output = JSON.stringify(exportGhgProtocol(db, opts.period), null, 2);
            break;
          }
          case "cdp": {
            const { exportCdp } = await import("../green/exports.js");
            const year = parseInt(opts.period.split("-")[0], 10);
            output = JSON.stringify(exportCdp(db, year), null, 2);
            break;
          }
          case "tcfd": {
            const { exportTcfd } = await import("../green/exports.js");
            output = JSON.stringify(
              exportTcfd(db, {
                period: opts.period,
                baseYear: opts.baseline ? parseInt(opts.baseline, 10) : undefined,
              }),
              null,
              2,
            );
            break;
          }
          case "iso14064": {
            const { exportIso14064 } = await import("../green/exports.js");
            output = JSON.stringify(
              exportIso14064(
                db,
                opts.period,
                opts.baseline ? parseInt(opts.baseline, 10) : undefined,
              ),
              null,
              2,
            );
            break;
          }
          default: {
            // Existing JSON export
            const { listCarbonTraces, getCarbonSummary } = await import("../green/store.js");
            const limit = Math.min(parseInt(opts.limit, 10), 10000);
            const { traces, total } = listCarbonTraces(db, { limit });
            const summary = getCarbonSummary(db);
            output = JSON.stringify({ summary, traces, total }, null, 2);
          }
        }
        process.stdout.write(output + "\n");
      } finally {
        db.close();
      }
    });

  green
    .command("factors")
    .description("Show carbon factor estimates")
    .option("--provider <name>", "Filter by provider name")
    .action(async (opts: { provider?: string }) => {
      const { DEFAULT_CARBON_FACTORS, FALLBACK_CARBON_FACTOR } = await import("../green/config.js");
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

      const filtered = opts.provider
        ? DEFAULT_CARBON_FACTORS.filter(
            (f) => f.provider.toLowerCase() === opts.provider!.toLowerCase(),
          )
        : DEFAULT_CARBON_FACTORS;

      if (filtered.length === 0) {
        console.log(theme.muted(`No factors found for provider: ${opts.provider}`));
        return;
      }

      const rows = filtered.map((f) => ({
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

  green
    .command("intensity")
    .description("Show carbon intensity metrics (TCFD)")
    .action(async () => {
      const { getCarbonSummary } = await import("../green/store.js");
      const { confidenceToUncertainty, formatDataQuality, confidenceToDataQuality } =
        await import("../green/carbon-calculator.js");
      const { theme } = await import("../terminal/theme.js");

      const db = await openDb();
      try {
        const summary = getCarbonSummary(db);
        const uncertainty = confidenceToUncertainty(summary.avgConfidence);
        const dataQuality = confidenceToDataQuality(summary.avgConfidence);
        const dq = formatDataQuality(dataQuality);

        console.log(theme.heading("Carbon Intensity Metrics (TCFD)"));
        console.log("");
        console.log(
          `  Per million tokens: ${theme.accent(summary.intensityPerMillionTokens.toFixed(2))} gCO\u2082eq`,
        );
        console.log(
          `  Per API call:       ${theme.accent(summary.intensityPerQuery.toFixed(4))} gCO\u2082eq`,
        );
        console.log("");
        console.log(`  Total tokens:       ${theme.muted(summary.totalTokens.toLocaleString())}`);
        console.log(`  Total traces:       ${theme.muted(String(summary.traceCount))}`);
        console.log("");
        console.log(theme.heading("Data Quality (GHG Protocol)"));
        console.log(`  Score:              ${theme.accent(String(dataQuality))} / 5 (${dq.label})`);
        console.log(`  Description:        ${theme.muted(dq.description)}`);
        console.log("");
        console.log(theme.heading("Uncertainty Bounds (ISO 14064)"));
        console.log(
          `  Range:              ${theme.muted(`${(uncertainty.lower * 100).toFixed(0)}% - ${(uncertainty.upper * 100).toFixed(0)}%`)}`,
        );
        console.log(
          `  Confidence:         ${theme.muted(`${(summary.avgConfidence * 100).toFixed(0)}%`)}`,
        );
      } finally {
        db.close();
      }
    });

  green
    .command("targets")
    .description("Manage emission reduction targets (SBTi)")
    .action(async () => {
      const { listCarbonTargets, getTargetProgress } = await import("../green/store.js");
      const { theme } = await import("../terminal/theme.js");
      const { renderTable } = await import("../terminal/table.js");

      const db = await openDb();
      try {
        const targets = listCarbonTargets(db);
        if (targets.length === 0) {
          console.log(
            theme.muted("No targets set. Use 'openclaw green targets:add' to create one."),
          );
          return;
        }

        const cols = [
          { key: "name", header: "Target", flex: true },
          { key: "pathway", header: "Pathway", align: "right" as const },
          { key: "reduction", header: "Reduction", align: "right" as const },
          { key: "progress", header: "Progress", align: "right" as const },
          { key: "status", header: "Status", align: "right" as const },
        ];

        const rows = targets.map((t) => {
          const progress = getTargetProgress(db, t.targetId);
          return {
            name: `${t.name} (${t.baseYear}\u2192${t.targetYear})`,
            pathway: t.pathway,
            reduction: `${t.targetReductionPercent}%`,
            progress: progress ? `${progress.progressPercent.toFixed(1)}%` : "N/A",
            status: progress?.onTrack ? "\u2713 On track" : "\u26A0 Behind",
          };
        });

        console.log(theme.heading("Emission Reduction Targets (SBTi)"));
        console.log(renderTable({ columns: cols, rows }));
      } finally {
        db.close();
      }
    });

  green
    .command("targets:add")
    .description("Add emission reduction target")
    .requiredOption("--name <name>", "Target name")
    .requiredOption("--base-year <year>", "Base year")
    .requiredOption("--target-year <year>", "Target year")
    .requiredOption("--reduction <percent>", "Reduction percentage")
    .option("--pathway <pathway>", "SBTi pathway: 1.5C, well-below-2C, 2C", "1.5C")
    .action(async (opts) => {
      const { insertCarbonTarget, getEmissionsForYear } = await import("../green/store.js");
      const { theme } = await import("../terminal/theme.js");

      const db = await openDb();
      try {
        const baseYear = parseInt(opts.baseYear, 10);
        const targetYear = parseInt(opts.targetYear, 10);
        const reduction = parseFloat(opts.reduction);

        if (targetYear <= baseYear) {
          console.error(theme.error("Target year must be after base year"));
          process.exit(1);
        }

        if (reduction <= 0 || reduction > 100) {
          console.error(theme.error("Reduction must be between 0 and 100"));
          process.exit(1);
        }

        const baseEmissions = getEmissionsForYear(db, baseYear);

        insertCarbonTarget(db, {
          targetId: crypto.randomUUID(),
          name: opts.name,
          baseYear,
          baseYearEmissionsGrams: baseEmissions,
          targetYear,
          targetReductionPercent: reduction,
          pathway: opts.pathway as "1.5C" | "well-below-2C" | "2C",
          createdAt: Date.now(),
        });

        console.log(
          theme.success(
            `Created target "${opts.name}" with ${reduction}% reduction by ${targetYear}`,
          ),
        );
        if (baseEmissions === 0) {
          console.log(
            theme.warn(
              `Note: No emissions recorded for base year ${baseYear}. Progress will be calculated when data is available.`,
            ),
          );
        } else {
          console.log(
            theme.muted(`Base year emissions: ${(baseEmissions / 1000).toFixed(2)} kg CO\u2082eq`),
          );
        }
      } finally {
        db.close();
      }
    });

  green
    .command("targets:remove")
    .description("Remove emission reduction target")
    .requiredOption("--id <id>", "Target ID to remove")
    .action(async (opts) => {
      const { deleteCarbonTarget } = await import("../green/store.js");
      const { theme } = await import("../terminal/theme.js");

      const db = await openDb();
      try {
        const deleted = deleteCarbonTarget(db, opts.id);
        if (deleted) {
          console.log(theme.success(`Deleted target ${opts.id}`));
        } else {
          console.log(theme.warn(`Target ${opts.id} not found`));
        }
      } finally {
        db.close();
      }
    });

  green
    .command("dashboard")
    .description("Open the green dashboard (served by gateway)")
    .option("--host <host>", "Gateway host override")
    .option("--port <port>", "Gateway port override")
    .action(async (opts: { host?: string; port?: string }) => {
      const { resolveGatewayUrl } = await import("../infra/gateway-url.js");
      const url = resolveGatewayUrl({ host: opts.host, port: opts.port });
      console.log(`Dashboard: ${url}/__openclaw__/api/green/dashboard`);
    });
}
