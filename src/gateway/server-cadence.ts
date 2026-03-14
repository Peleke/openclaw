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
  buildCadencePipeline,
  createOpenClawLLMAdapter,
  registerResponders,
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
 * Set up the P1 Content Pipeline (insight extraction and delivery).
 *
 * Delegates to the shared buildCadencePipeline() for responder/source
 * creation. Gateway-specific concerns (LLM init error handling, logging)
 * remain here.
 *
 * Returns null if P1 is not configured or disabled.
 */
async function setupP1ContentPipeline(log: SubsystemLogger) {
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

  // Build pipeline using the shared builder
  const result = buildCadencePipeline({
    config: p1Config,
    llmProvider,
  });

  log.info(
    `cadence: P1 pipeline built (${result.responders.length} responders, ${result.sources.length} sources)`,
  );

  return result;
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

  // Warn about potential duplicate cadence process. The canonical runner
  // is scripts/cadence.ts (openclaw-cadence.service in the sandbox VM).
  // Running cadence in both the gateway AND the dogfood script causes
  // duplicate cron triggers and duplicate LinWheel drafts.
  log.warn(
    "cadence: gateway cadence is enabled via openclaw.json. " +
      "Ensure the openclaw-cadence.service (scripts/cadence.ts) is stopped " +
      "to avoid duplicate cron triggers and signal processing.",
  );

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
