/**
 * CLI subcommands for learning layer observability.
 * Registered lazily via register.subclis.ts.
 */

import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";

async function openDb() {
  const { openLearningDb } = await import("../learning/store.js");
  const config = loadConfig();
  const agentId = resolveDefaultAgentId(config);
  const agentDir = resolveAgentWorkspaceDir(config, agentId);
  return openLearningDb(agentDir);
}

export function registerLearningCli(program: Command) {
  const learning = program.command("learning").description("Learning layer observability");

  learning
    .command("status")
    .description("Show learning layer summary and top/bottom arms")
    .action(async () => {
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
    .description("Generate and serve the learning dashboard")
    .option("--port <port>", "Gateway port", "18789")
    .action(async (opts) => {
      const { generateLearningDashboardHtml } = await import("../learning/dashboard-html.js");
      const config = loadConfig();
      const port = opts.port;
      const apiBase = `http://localhost:${port}/__openclaw__/api/learning`;
      const html = generateLearningDashboardHtml({ apiBase });

      const canvasDir = path.join(os.homedir(), ".openclaw", "canvas", "learning");
      fs.mkdirSync(canvasDir, { recursive: true });
      const htmlPath = path.join(canvasDir, "index.html");
      fs.writeFileSync(htmlPath, html, "utf-8");

      console.log(`Dashboard written to ${htmlPath}`);
      console.log(`Open: http://localhost:${port}/__openclaw__/canvas/learning/`);
    });
}
