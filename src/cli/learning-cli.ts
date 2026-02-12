/**
 * CLI subcommands for learning layer observability.
 * Registered lazily via register.subclis.ts.
 *
 * Sources data from qortex via gateway API, with direct qortex MCP fallback.
 */

import type { Command } from "commander";

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

      // Fallback: direct qortex MCP connection
      const { formatLearningStatusFromQortex } = await import("../learning/cli-status.js");
      const result = await formatLearningStatusFromQortex();
      console.log(result);
    });

  learning
    .command("export")
    .description("Export learning data to JSON")
    .option("--format <format>", "Output format (json)", "json")
    .action(async (opts) => {
      const { exportLearningDataFromQortex } = await import("../learning/cli-export.js");
      const output = await exportLearningDataFromQortex({
        format: opts.format === "csv" ? "csv" : "json",
      });
      process.stdout.write(output + "\n");
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
