/**
 * Shared Cadence pipeline builder.
 *
 * Single source of truth for which responders and sources make up the
 * P1 Content Pipeline. Both the gateway (server-cadence.ts) and the
 * dogfood script (scripts/cadence.ts) call this instead of maintaining
 * independent registration lists.
 */

import { LinWheel } from "@linwheel/sdk";
import type { LLMProvider } from "./llm/types.js";
import type { CadenceP1Config } from "./config.js";
import { getScheduledJobs } from "./config.js";
import type { Responder } from "./responders/index.js";
import type { Source } from "@peleke.s/cadence";
import type { OpenClawSignal } from "./signals.js";
import { createInsightExtractorResponder } from "./responders/insight-extractor/index.js";
import { createInsightDigestResponder } from "./responders/insight-digest/index.js";
import { createTelegramNotifierResponder } from "./responders/telegram-notifier.js";
import { createLinWheelPublisherResponder } from "./responders/linwheel-publisher/index.js";
import { createGitHubWatcherResponder } from "./responders/github-watcher/index.js";
import { createRunlistResponder } from "./responders/runlist/index.js";
import { createCronBridge } from "./sources/cron-bridge.js";

export interface PipelineBuilderOptions {
  /** Loaded cadence config */
  config: CadenceP1Config;
  /** LLM provider (already initialized by caller) */
  llmProvider: LLMProvider;
  /** Extra cron trigger job IDs for digest responder (e.g., "manual-trigger") */
  extraCronTriggerJobIds?: string[];
}

export interface CadencePipelineResult {
  responders: Responder[];
  sources: Source<OpenClawSignal>[];
}

/**
 * Create a LinWheel SDK client from environment variables.
 * Returns null if LINWHEEL_API_KEY is not set or empty.
 */
export function createLinWheelClientFromEnv(): LinWheel | null {
  const apiKey = process.env.LINWHEEL_API_KEY?.trim();
  if (!apiKey) return null;

  return new LinWheel({
    apiKey,
    ...(process.env.LINWHEEL_SIGNING_SECRET?.trim()
      ? { signingSecret: process.env.LINWHEEL_SIGNING_SECRET.trim() }
      : {}),
    ...(process.env.LINWHEEL_BASE_URL?.trim()
      ? { baseUrl: process.env.LINWHEEL_BASE_URL.trim() }
      : {}),
  });
}

/**
 * Build the P1 Content Pipeline — responders + sources.
 *
 * Both the gateway and dogfood script call this to get a consistent
 * set of responders and sources based on config. Caller-specific
 * concerns (ObsidianWatcher, FileLogResponder, bus creation) remain
 * in the caller.
 */
export function buildCadencePipeline(options: PipelineBuilderOptions): CadencePipelineResult {
  const { config, llmProvider, extraCronTriggerJobIds = [] } = options;
  const responders: Responder[] = [];
  const sources: Source<OpenClawSignal>[] = [];

  // 1. Insight Extractor — always created
  responders.push(
    createInsightExtractorResponder({
      config: {
        pillars: config.pillars.map((p) => ({
          id: p.id,
          name: p.name,
          keywords: p.keywords ?? [],
        })),
        magicString: config.extraction.publishTag,
      },
      llm: llmProvider,
    }),
  );

  // 2. Insight Digest — always created
  const cronTriggerJobIds: string[] = [...extraCronTriggerJobIds];
  if (config.schedule.enabled) {
    if (config.schedule.nightlyDigest) cronTriggerJobIds.push("nightly-digest");
    if (config.schedule.morningStandup) cronTriggerJobIds.push("morning-standup");
  }

  responders.push(
    createInsightDigestResponder({
      config: {
        minInsightsToFlush: config.digest.minToFlush,
        maxHoursBetweenFlushes: config.digest.maxHoursBetween,
        cooldownHours: config.digest.cooldownHours,
        quietHoursStart: config.digest.quietHoursStart,
        quietHoursEnd: config.digest.quietHoursEnd,
      },
      cronTriggerJobIds,
    }),
  );

  // 3. Telegram Notifier — conditional on delivery config
  if (config.delivery.channel === "telegram" && config.delivery.telegramChatId) {
    responders.push(
      createTelegramNotifierResponder({
        telegramChatId: config.delivery.telegramChatId,
        deliverDigests: true,
        notifyOnFileChange: false,
      }),
    );
  }

  // 4. LinWheel Publisher — conditional on LINWHEEL_API_KEY env var
  const linwheelClient = createLinWheelClientFromEnv();
  if (linwheelClient) {
    responders.push(createLinWheelPublisherResponder({ client: linwheelClient }));
  }

  // 5. GitHub Watcher — conditional on config
  if (config.githubWatcher?.enabled) {
    responders.push(
      createGitHubWatcherResponder({
        llm: llmProvider,
        vaultPath: config.vaultPath,
        config: {
          owner: config.githubWatcher.owner ?? "Peleke",
          scanTime: config.githubWatcher.scanTime ?? "21:00",
          outputDir: config.githubWatcher.outputDir ?? "Buildlog",
          maxBuildlogEntries: config.githubWatcher.maxBuildlogEntries ?? 3,
          excludeRepos: config.githubWatcher.excludeRepos ?? [],
        },
      }),
    );
  }

  // 6. Runlist Responder — conditional on config + telegram
  if (config.runlist?.enabled && config.delivery.telegramChatId) {
    responders.push(
      createRunlistResponder({
        vaultPath: config.vaultPath,
        telegramChatId: config.delivery.telegramChatId,
        runlistDir: config.runlist.runlistDir,
      }),
    );
  }

  // 7. Cron Bridge — if any scheduled jobs exist
  const jobs = getScheduledJobs(config);
  if (jobs.length > 0) {
    sources.push(createCronBridge({ jobs }));
  }

  return { responders, sources };
}
