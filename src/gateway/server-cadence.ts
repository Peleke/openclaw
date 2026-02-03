/**
 * Gateway Cadence integration.
 *
 * Initializes the signal bus and starts ambient agency sources
 * based on configuration. Also sets up the P1 Content Pipeline
 * (insight extraction and delivery) when enabled.
 */

import type { SubsystemLogger } from "../logging/subsystem.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  initOpenClawBus,
  getOpenClawBus,
  destroyOpenClawBus,
  createObsidianWatcherSource,
  type OpenClawBus,
  // P1 Content Pipeline
  loadCadenceConfig,
  getScheduledJobs,
  createCronBridge,
  createInsightExtractorResponder,
  createInsightDigestResponder,
  createTelegramNotifierResponder,
  createOpenClawLLMAdapter,
  registerResponders,
  type Responder,
  type Source,
  type OpenClawSignal,
} from "../cadence/index.js";

export interface CadenceGatewayState {
  bus: OpenClawBus;
  stop: () => Promise<void>;
}

export interface StartCadenceOptions {
  cfg: OpenClawConfig;
  log: SubsystemLogger;
}

/**
 * P1 Content Pipeline result.
 */
interface P1PipelineResult {
  sources: Source<OpenClawSignal>[];
  responders: Responder[];
}

/**
 * Set up the P1 Content Pipeline (insight extraction and delivery).
 *
 * Reads config from ~/.openclaw/cadence.json and creates:
 * - InsightExtractor responder (LLM-powered extraction)
 * - InsightDigest responder (batching and scheduling)
 * - TelegramNotifier responder (delivery)
 * - CronBridge source (scheduled triggers)
 *
 * Returns null if P1 is not configured or disabled.
 */
async function setupP1ContentPipeline(log: SubsystemLogger): Promise<P1PipelineResult | null> {
  const p1Config = await loadCadenceConfig();

  // Skip if not enabled or no vault configured
  if (!p1Config.enabled) {
    log.debug("cadence: P1 pipeline disabled in config");
    return null;
  }

  if (!p1Config.vaultPath) {
    log.warn("cadence: P1 enabled but no vaultPath configured");
    return null;
  }

  const sources: Source<OpenClawSignal>[] = [];
  const responders: Responder[] = [];

  // LLM Provider (uses OpenClaw's auth system)
  let llmProvider;
  try {
    llmProvider = createOpenClawLLMAdapter({
      defaultProvider: p1Config.llm.provider,
      defaultModel: p1Config.llm.model,
    });
    log.debug(`cadence: P1 LLM provider ready (${p1Config.llm.provider}/${p1Config.llm.model})`);
  } catch (err) {
    log.error(
      `cadence: Failed to create LLM provider: ${err instanceof Error ? err.message : String(err)}`,
    );
    log.warn("cadence: P1 insight extraction will be disabled");
    return null;
  }

  // Insight Extractor
  responders.push(
    createInsightExtractorResponder({
      config: {
        // Ensure keywords is always an array (config allows optional)
        pillars: p1Config.pillars.map((p) => ({
          id: p.id,
          name: p.name,
          keywords: p.keywords ?? [],
        })),
        magicString: p1Config.extraction.publishTag,
      },
      llm: llmProvider,
    }),
  );

  // Build cron trigger job IDs for digest responder
  const cronTriggerJobIds: string[] = [];
  if (p1Config.schedule.enabled) {
    if (p1Config.schedule.nightlyDigest) cronTriggerJobIds.push("nightly-digest");
    if (p1Config.schedule.morningStandup) cronTriggerJobIds.push("morning-standup");
  }

  // Insight Digest
  responders.push(
    createInsightDigestResponder({
      config: {
        minInsightsToFlush: p1Config.digest.minToFlush,
        maxHoursBetweenFlushes: p1Config.digest.maxHoursBetween,
        cooldownHours: p1Config.digest.cooldownHours,
        quietHoursStart: p1Config.digest.quietHoursStart,
        quietHoursEnd: p1Config.digest.quietHoursEnd,
      },
      cronTriggerJobIds,
    }),
  );

  // Telegram Notifier (if configured)
  if (p1Config.delivery.channel === "telegram" && p1Config.delivery.telegramChatId) {
    responders.push(
      createTelegramNotifierResponder({
        telegramChatId: p1Config.delivery.telegramChatId,
        deliverDigests: true,
        notifyOnFileChange: false, // Digest mode only
      }),
    );
    log.debug(
      `cadence: P1 Telegram delivery configured (chat: ${p1Config.delivery.telegramChatId})`,
    );
  } else if (p1Config.delivery.channel === "log") {
    log.debug("cadence: P1 delivery channel is 'log' - digests will only be logged");
  } else {
    log.warn(`cadence: P1 delivery channel '${p1Config.delivery.channel}' not fully configured`);
  }

  // Cron Bridge (for scheduled digests)
  const jobs = getScheduledJobs(p1Config);
  if (jobs.length > 0) {
    sources.push(createCronBridge({ jobs }));
    log.debug(
      `cadence: P1 scheduled ${jobs.length} cron job(s): ${jobs.map((j) => j.id).join(", ")}`,
    );
  }

  return { sources, responders };
}

/**
 * Start the Cadence signal bus if enabled in config.
 */
export async function startGatewayCadence(
  opts: StartCadenceOptions,
): Promise<CadenceGatewayState | null> {
  const { cfg, log } = opts;

  const cadenceConfig = cfg.cadence;
  if (!cadenceConfig?.enabled) {
    log.debug("cadence: disabled in config");
    return null;
  }

  log.info("cadence: initializing signal bus");

  const debug = process.env.CADENCE_DEBUG === "1";
  const openClawBus = initOpenClawBus({
    debug,
    onError: (err, signal) => {
      log.error(`cadence: handler error for ${signal.type}: ${String(err)}`);
    },
  });

  // Add Obsidian watcher if vault path is configured
  if (cadenceConfig.vaultPath) {
    log.info(`cadence: adding obsidian watcher for ${cadenceConfig.vaultPath}`);
    const obsidianSource = createObsidianWatcherSource({
      vaultPath: cadenceConfig.vaultPath,
      emitTasks: true,
    });
    openClawBus.addSource(obsidianSource);
  }

  // Set up P1 Content Pipeline (insight extraction and delivery)
  const p1 = await setupP1ContentPipeline(log);
  if (p1) {
    // Add P1 sources (cron bridge)
    for (const source of p1.sources) {
      openClawBus.addSource(source);
    }

    // Register P1 responders
    registerResponders(openClawBus.bus, p1.responders);

    log.info(
      `cadence: P1 pipeline ready (${p1.responders.length} responders, ${p1.sources.length} sources)`,
    );
  }

  // Start all sources
  await openClawBus.start();
  log.info("cadence: signal bus started");

  // Register default handlers for observability
  openClawBus.bus.onAny(async (signal) => {
    if (debug) {
      log.debug(`cadence: signal ${signal.type} id=${signal.id}`);
    }
  });

  return {
    bus: openClawBus,
    stop: async () => {
      log.info("cadence: stopping signal bus");
      await openClawBus.stop();
      destroyOpenClawBus();
      log.info("cadence: signal bus stopped");
    },
  };
}

/**
 * Get the running Cadence bus (throws if not initialized).
 */
export function getGatewayCadenceBus(): OpenClawBus {
  return getOpenClawBus();
}
