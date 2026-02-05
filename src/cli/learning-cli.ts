/**
 * CLI subcommands for learning layer observability.
 * Registered lazily via register.subclis.ts.
 */

import type { Command } from "commander";
import { resolveOpenClawAgentDir } from "../agents/agent-paths.js";

async function openDb() {
  const { openLearningDb } = await import("../learning/store.js");
  const agentDir = resolveOpenClawAgentDir();
  return openLearningDb(agentDir);
}

export function registerLearningCli(program: Command) {
  const learning = program.command("learning").description("Learning layer observability");

  learning
    .command("status")
    .description("Show learning layer summary and top/bottom arms")
    .option("--host <host>", "Gateway host override")
    .option("--port <port>", "Gateway port override")
    .action(async (opts: { host?: string; port?: string }) => {
      const { fetchGatewayJson } = await import("../infra/gateway-http.js");
      const apiOpts = { host: opts.host, port: opts.port };

      // Try gateway API first (live data)
      const [summary, config, posteriors] = await Promise.all([
        fetchGatewayJson("/__openclaw__/api/learning", "/summary", apiOpts),
        fetchGatewayJson("/__openclaw__/api/learning", "/config", apiOpts),
        fetchGatewayJson("/__openclaw__/api/learning", "/posteriors", apiOpts),
      ]);

      if (summary && config && posteriors) {
        const { formatLearningStatusFromApi } = await import("../learning/cli-status.js");
        console.log(
          formatLearningStatusFromApi({ summary, config, posteriors } as Parameters<
            typeof formatLearningStatusFromApi
          >[0]),
        );
        return;
      }

      // Fallback: local DB
      const { formatLearningStatus } = await import("../learning/cli-status.js");
      const db = await openDb();
      try {
        console.log(formatLearningStatus(db));
      } finally {
        db.close();
      }
    });

  learning
    .command("export")
    .description("Export learning data to JSON or CSV")
    .option("--format <format>", "Output format (json or csv)", "json")
    .option("--traces", "Include traces", true)
    .option("--no-traces", "Exclude traces")
    .option("--posteriors", "Include posteriors", true)
    .option("--no-posteriors", "Exclude posteriors")
    .action(async (opts) => {
      const { exportLearningData } = await import("../learning/cli-export.js");
      const format = opts.format === "csv" ? "csv" : "json";
      const db = await openDb();
      try {
        const output = exportLearningData(db, {
          format,
          traces: opts.traces,
          posteriors: opts.posteriors,
        });
        process.stdout.write(output + "\n");
      } finally {
        db.close();
      }
    });

  learning
    .command("dashboard")
    .description("Open the learning dashboard (served by gateway)")
    .option("--host <host>", "Gateway host override")
    .option("--port <port>", "Gateway port override")
    .action(async (opts: { host?: string; port?: string }) => {
      const { resolveGatewayUrl } = await import("../infra/gateway-url.js");
      const url = resolveGatewayUrl({ host: opts.host, port: opts.port });
      console.log(`Dashboard: ${url}/__openclaw__/api/learning/dashboard`);
    });
}
