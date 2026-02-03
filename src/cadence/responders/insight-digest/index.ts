/**
 * Insight Digest responder.
 *
 * Accumulates journal.insight.extracted signals and flushes them as batched
 * digests based on count/time triggers. Respects quiet hours and cooldown
 * periods to avoid surfacing insights too soon after writing.
 *
 * Emits journal.digest.ready signal when a digest is flushed.
 */

import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
import type { SignalBus } from "@peleke.s/cadence";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { OpenClawSignal } from "../../signals.js";
import type { Responder } from "../index.js";
import { createAccumulator, type DigestAccumulator } from "./accumulator.js";
import { createDigestScheduler, type DigestScheduler } from "./scheduler.js";
import type { DigestConfig, DigestFlush, QueuedInsight, DigestClock } from "./types.js";
import { DEFAULT_DIGEST_CONFIG } from "./types.js";

const log = createSubsystemLogger("cadence").child("insight-digest");

export interface InsightDigestResponderOptions {
  /** Partial config overrides */
  config?: Partial<DigestConfig>;

  /** Custom accumulator (for testing) */
  accumulator?: DigestAccumulator;

  /** Custom scheduler (for testing) */
  scheduler?: DigestScheduler;

  /** Custom clock (for testing/extension) */
  clock?: DigestClock;

  /** Callback when flush occurs (in addition to signal emission) */
  onFlush?: (digest: DigestFlush) => Promise<void>;
}

/**
 * Resolve the default store path.
 */
function resolveStorePath(): string {
  const home = os.homedir();
  return path.join(home, ".openclaw", "cadence", "digest-queue.jsonl");
}

/**
 * Create the insight digest responder.
 */
export function createInsightDigestResponder(
  options: InsightDigestResponderOptions = {},
): Responder {
  // Merge config with defaults
  const config: DigestConfig = {
    ...DEFAULT_DIGEST_CONFIG,
    storePath: resolveStorePath(),
    ...options.config,
  };

  // Create components (or use provided ones for testing)
  const accumulator = options.accumulator ?? createAccumulator(config);
  const scheduler = options.scheduler ?? createDigestScheduler(config, options.clock);

  return {
    name: "insight-digest",
    description: "Accumulates extracted insights and delivers periodic digests",

    register(bus: SignalBus<OpenClawSignal>): () => void {
      log.info("Insight digest responder starting", {
        minInsights: config.minInsightsToFlush,
        maxHours: config.maxHoursBetweenFlushes,
        quietHours: `${config.quietHoursStart}-${config.quietHoursEnd}`,
        cooldownHours: config.cooldownHours,
      });

      // Subscribe to insight.extracted signals
      const unsubSignal = bus.on("journal.insight.extracted", async (signal) => {
        const { insights, source } = signal.payload;

        for (const insight of insights) {
          const queued: QueuedInsight = {
            id: insight.id,
            queuedAt: Date.now(),
            sourceSignalId: signal.id,
            sourcePath: source.path,
            topic: insight.topic,
            pillar: insight.pillar ?? undefined,
            hook: insight.hook,
            excerpt: insight.excerpt,
            scores: insight.scores,
            formats: insight.formats,
          };

          await accumulator.enqueue(queued);
        }

        if (insights.length > 0) {
          log.debug(`Queued ${insights.length} insights from ${source.path}`);
        }
      });

      // Schedule periodic flush checks
      const unsubScheduler = scheduler.scheduleCheck(async () => {
        // Skip during quiet hours
        if (scheduler.isQuietHours()) {
          log.debug("Skipping flush check: quiet hours");
          return;
        }

        // Get settled insights (past cooldown)
        const settled = await accumulator.getSettledInsights();
        if (settled.length === 0) {
          return;
        }

        // Check flush conditions
        const { should, trigger } = accumulator.shouldFlush(settled);
        if (!should || !trigger) {
          return;
        }

        // Build digest
        const digest: DigestFlush = {
          flushedAt: Date.now(),
          insights: settled,
          trigger,
        };

        // Call optional callback
        if (options.onFlush) {
          try {
            await options.onFlush(digest);
          } catch (err) {
            log.error(
              `onFlush callback error: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        // Emit signal for downstream consumers
        await bus.emit({
          type: "journal.digest.ready",
          id: crypto.randomUUID(),
          ts: Date.now(),
          payload: {
            flushedAt: digest.flushedAt,
            insights: digest.insights.map((i) => ({
              id: i.id,
              topic: i.topic,
              pillar: i.pillar,
              hook: i.hook,
              excerpt: i.excerpt,
              scores: i.scores,
              formats: i.formats,
              sourcePath: i.sourcePath,
            })),
            trigger: digest.trigger,
          },
        });

        // Record flush and dequeue
        await accumulator.recordFlush();
        await accumulator.dequeue(settled.map((i) => i.id));

        log.info(`Flushed ${settled.length} insights (trigger: ${trigger})`);
      });

      // Return cleanup function
      return () => {
        unsubSignal();
        unsubScheduler();
        log.info("Insight digest responder stopped");
      };
    },
  };
}

// Re-export types and utilities for testing
export { createAccumulator } from "./accumulator.js";
export { createDigestScheduler, createSimpleClock } from "./scheduler.js";
export * from "./types.js";
