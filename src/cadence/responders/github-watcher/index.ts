/**
 * GitHub Watcher responder.
 *
 * Subscribes to cadence.cron.fired signals (filtered by jobId),
 * scans all repos for the configured owner, collects PRs and
 * buildlog entries, synthesizes via LLM, and writes a ::linkedin
 * tagged note to the vault for downstream processing.
 */

import crypto from "node:crypto";
import path from "node:path";
import type { SignalBus } from "@peleke.s/cadence";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { LLMProvider } from "../../llm/types.js";
import type { OpenClawSignal } from "../../signals.js";
import type { CadenceP1Config } from "../../config.js";
import type { Responder } from "../index.js";
import {
  DEFAULT_GITHUB_WATCHER_CONFIG,
  type GitHubWatcherConfig,
  type GitHubClient,
  type FileWriter,
  type WatcherClock,
  type RepoScanResult,
} from "./types.js";
import { createGhCliClient, createFsFileWriter } from "./github-client.js";
import {
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  parseSynthesisResponse,
} from "./prompts.js";

const log = createSubsystemLogger("cadence").child("github-watcher");

export interface GitHubWatcherOptions {
  /** LLM provider for synthesis */
  llm: LLMProvider;

  /** GitHub API client (defaults to gh CLI wrapper) */
  ghClient?: GitHubClient;

  /** File writer (defaults to filesystem) */
  writer?: FileWriter;

  /** Clock for testability (defaults to real date) */
  clock?: WatcherClock;

  /** Partial config overrides */
  config?: Partial<GitHubWatcherConfig>;

  /** Vault path for output (from cadence config) */
  vaultPath: string;

  /** Content pillars for synthesis context */
  pillars?: CadenceP1Config["pillars"];

  /** Cron job IDs that trigger this responder (default: ["github-watcher"]) */
  cronTriggerJobIds?: string[];
}

/**
 * Default clock using real dates.
 */
function createRealClock(): WatcherClock {
  return {
    today() {
      return new Date().toISOString().split("T")[0];
    },
  };
}

/**
 * Scan a single repo for activity.
 */
async function scanRepo(
  ghClient: GitHubClient,
  repo: { name: string; fullName: string },
  date: string,
  maxBuildlogEntries: number,
): Promise<RepoScanResult> {
  const result: RepoScanResult = {
    name: repo.name,
    fullName: repo.fullName,
    mergedPRs: [],
    openPRs: [],
    buildlogEntries: [],
  };

  // Merged PRs for today
  const mergedPRs = await ghClient.getMergedPRsForDate(repo.fullName, date);
  result.mergedPRs = mergedPRs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    url: pr.url,
  }));

  // Open PRs
  const openPRs = await ghClient.getOpenPRs(repo.fullName);
  result.openPRs = openPRs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    url: pr.url,
  }));

  // Buildlog entries
  const hasBuildlog = await ghClient.hasBuildlogDir(repo.fullName);
  if (hasBuildlog) {
    result.buildlogEntries = await ghClient.getRecentBuildlogEntries(
      repo.fullName,
      maxBuildlogEntries,
    );
  }

  return result;
}

/**
 * Create the GitHub watcher responder.
 */
export function createGitHubWatcherResponder(options: GitHubWatcherOptions): Responder {
  const config: GitHubWatcherConfig = {
    ...DEFAULT_GITHUB_WATCHER_CONFIG,
    ...options.config,
  };
  const ghClient = options.ghClient ?? createGhCliClient();
  const writer = options.writer ?? createFsFileWriter();
  const clock = options.clock ?? createRealClock();
  const cronTriggerJobIds = options.cronTriggerJobIds ?? ["github-watcher"];

  return {
    name: "github-watcher",
    description: "Scans GitHub repos nightly, synthesizes activity into ::linkedin vault notes",

    register(bus: SignalBus<OpenClawSignal>): () => void {
      log.info("GitHub watcher responder starting", {
        owner: config.owner,
        scanTime: config.scanTime,
        excludeRepos: config.excludeRepos,
        cronTriggerJobIds,
      });

      const unsubCron = bus.on("cadence.cron.fired", async (signal) => {
        const { jobId } = signal.payload;

        if (!cronTriggerJobIds.includes(jobId)) {
          return;
        }

        const scanDate = clock.today();
        const outputFilename = `${scanDate}-github-synthesis.md`;
        const outputPath = path.join(options.vaultPath, config.outputDir, outputFilename);

        log.info(`GitHub watcher triggered for ${scanDate}`);

        // Dedup: skip if today's synthesis already exists
        if (await writer.exists(outputPath)) {
          log.info(`Synthesis already exists for ${scanDate}, skipping`);
          return;
        }

        try {
          // 1. List repos
          const allRepos = await ghClient.listRepos(config.owner);
          const repos = allRepos.filter((r) => !config.excludeRepos.includes(r.name));

          log.info(`Scanning ${repos.length} repos for ${config.owner}`);

          // 2. Scan each repo (sequential to respect rate limits)
          const scanResults: RepoScanResult[] = [];
          const errors: Array<{ repo: string; error: string }> = [];

          for (const repo of repos) {
            try {
              const result = await scanRepo(ghClient, repo, scanDate, config.maxBuildlogEntries);
              scanResults.push(result);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              errors.push({ repo: repo.fullName, error: msg });
              log.warn(`Failed to scan ${repo.fullName}: ${msg}`);
            }
          }

          // 3. Emit scan completed signal
          const reposWithActivity = scanResults.filter(
            (r) => r.mergedPRs.length > 0 || r.openPRs.length > 0,
          );
          const reposWithBuildlog = scanResults.filter((r) => r.buildlogEntries.length > 0);

          await bus.emit({
            type: "github.scan.completed",
            id: crypto.randomUUID(),
            ts: Date.now(),
            payload: {
              scanDate,
              reposScanned: repos.length,
              reposWithActivity: reposWithActivity.length,
              reposWithBuildlog: reposWithBuildlog.length,
              repos: scanResults,
              errors,
            },
          });

          // 4. Skip synthesis if no activity
          const activeRepos = scanResults.filter(
            (r) => r.mergedPRs.length > 0 || r.openPRs.length > 0 || r.buildlogEntries.length > 0,
          );

          if (activeRepos.length === 0) {
            log.info(`No activity found for ${scanDate}, skipping synthesis`);
            return;
          }

          // 5. LLM synthesis
          const systemPrompt = buildSynthesisSystemPrompt();
          const userPrompt = buildSynthesisUserPrompt(activeRepos, scanDate);

          const response = await options.llm.chat([
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ]);

          const synthesis = parseSynthesisResponse(response.text);
          if (!synthesis) {
            log.warn("LLM returned insufficient synthesis, skipping write");
            await bus.emit({
              type: "github.synthesis.written",
              id: crypto.randomUUID(),
              ts: Date.now(),
              payload: {
                outputPath,
                scanDate,
                reposIncluded: activeRepos.length,
                totalPRs: activeRepos.reduce(
                  (n, r) => n + r.mergedPRs.length + r.openPRs.length,
                  0,
                ),
                linkedinReady: false,
                error: "LLM synthesis too short",
              },
            });
            return;
          }

          // 6. Write to vault with ::linkedin tag
          const totalPRs = activeRepos.reduce(
            (n, r) => n + r.mergedPRs.length + r.openPRs.length,
            0,
          );
          const content = `::linkedin\n\n${synthesis}`;
          await writer.write(outputPath, content);

          log.info(
            `Synthesis written: ${outputPath} (${activeRepos.length} repos, ${totalPRs} PRs)`,
          );

          // 7. Emit synthesis written signal
          await bus.emit({
            type: "github.synthesis.written",
            id: crypto.randomUUID(),
            ts: Date.now(),
            payload: {
              outputPath,
              scanDate,
              reposIncluded: activeRepos.length,
              totalPRs,
              linkedinReady: true,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(`GitHub watcher failed for ${scanDate}: ${msg}`);

          await bus.emit({
            type: "github.synthesis.written",
            id: crypto.randomUUID(),
            ts: Date.now(),
            payload: {
              outputPath,
              scanDate,
              reposIncluded: 0,
              totalPRs: 0,
              linkedinReady: false,
              error: msg,
            },
          });
        }
      });

      return () => {
        unsubCron();
        log.info("GitHub watcher responder stopped");
      };
    },
  };
}
