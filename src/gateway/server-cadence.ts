/**
 * Gateway Cadence integration.
 *
 * Initializes the signal bus and starts ambient agency sources
 * based on configuration.
 */

import type { SubsystemLogger } from "../logging/subsystem.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  initOpenClawBus,
  getOpenClawBus,
  destroyOpenClawBus,
  createObsidianWatcherSource,
  type OpenClawBus,
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
