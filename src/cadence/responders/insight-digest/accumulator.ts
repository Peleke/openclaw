/**
 * Digest accumulator — JSONL storage and flush logic.
 *
 * Follows storage patterns from src/cron/run-log.ts.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { DigestConfig, QueuedInsight, FlushDecision, QueueState } from "./types.js";

const log = createSubsystemLogger("cadence").child("digest-accumulator");

/**
 * JSONL line types for the queue file.
 */
type QueueLine =
  | { type: "insight"; data: QueuedInsight }
  | { type: "dequeue"; ids: string[] }
  | { type: "flush"; at: number }
  | { type: "clear" };

export interface DigestAccumulator {
  /** Add insight to queue */
  enqueue(insight: QueuedInsight): Promise<void>;

  /** Get all queued insights */
  getQueue(): Promise<QueuedInsight[]>;

  /** Get only "settled" insights (older than cooldownHours) */
  getSettledInsights(): Promise<QueuedInsight[]>;

  /** Remove flushed insights from queue */
  dequeue(ids: string[]): Promise<void>;

  /** Check if flush conditions met */
  shouldFlush(settled: QueuedInsight[]): FlushDecision;

  /** Record that a flush occurred */
  recordFlush(): Promise<void>;

  /** Get last flush timestamp */
  getLastFlushAt(): Promise<number>;

  /** Clear entire queue (for testing) */
  clear(): Promise<void>;
}

/**
 * Parse JSONL file into queue state.
 */
async function parseQueueFile(filePath: string): Promise<QueueState> {
  const state: QueueState = {
    lastFlushAt: 0,
    insights: [],
  };

  const insightMap = new Map<string, QueuedInsight>();
  const dequeuedIds = new Set<string>();

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as QueueLine;

        switch (entry.type) {
          case "insight":
            insightMap.set(entry.data.id, entry.data);
            break;
          case "dequeue":
            for (const id of entry.ids) {
              dequeuedIds.add(id);
            }
            break;
          case "flush":
            state.lastFlushAt = entry.at;
            break;
          case "clear":
            insightMap.clear();
            dequeuedIds.clear();
            break;
        }
      } catch {
        // Skip malformed lines (fault tolerance)
        log.debug(`Skipping malformed queue line: ${line.slice(0, 50)}...`);
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn(`Error reading queue file: ${err instanceof Error ? err.message : String(err)}`);
    }
    // File doesn't exist = fresh queue
  }

  // Build final insights list (excluding dequeued)
  for (const [id, insight] of insightMap) {
    if (!dequeuedIds.has(id)) {
      state.insights.push(insight);
    }
  }

  // Sort by queuedAt (FIFO)
  state.insights.sort((a, b) => a.queuedAt - b.queuedAt);

  return state;
}

/**
 * Append a line to the queue file.
 */
async function appendLine(filePath: string, line: QueueLine): Promise<void> {
  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const content = JSON.stringify(line) + "\n";
  await fs.appendFile(filePath, content, "utf-8");
}

/**
 * Create a digest accumulator with JSONL persistence.
 */
export function createAccumulator(config: DigestConfig): DigestAccumulator {
  const filePath = config.storePath;
  const cooldownMs = config.cooldownHours * 60 * 60 * 1000;
  const maxFlushIntervalMs = config.maxHoursBetweenFlushes * 60 * 60 * 1000;

  // Cache for lastFlushAt to avoid reading file repeatedly
  let cachedLastFlushAt: number | null = null;

  return {
    async enqueue(insight: QueuedInsight): Promise<void> {
      await appendLine(filePath, { type: "insight", data: insight });
      log.debug(`Enqueued insight: ${insight.id} (${insight.topic})`);
    },

    async getQueue(): Promise<QueuedInsight[]> {
      const state = await parseQueueFile(filePath);
      cachedLastFlushAt = state.lastFlushAt;
      return state.insights;
    },

    async getSettledInsights(): Promise<QueuedInsight[]> {
      const queue = await this.getQueue();
      const now = Date.now();
      return queue.filter((insight) => now - insight.queuedAt >= cooldownMs);
    },

    async dequeue(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await appendLine(filePath, { type: "dequeue", ids });
      log.debug(`Dequeued ${ids.length} insights`);
    },

    shouldFlush(settled: QueuedInsight[]): FlushDecision {
      // Count-based trigger
      if (settled.length >= config.minInsightsToFlush) {
        return { should: true, trigger: "count" };
      }

      // Time-based trigger (only if we have any settled insights)
      if (settled.length > 0 && cachedLastFlushAt !== null) {
        const now = Date.now();
        const timeSinceLastFlush = now - cachedLastFlushAt;
        if (timeSinceLastFlush >= maxFlushIntervalMs) {
          return { should: true, trigger: "time" };
        }
      }

      // Time trigger for first flush (lastFlushAt = 0)
      if (settled.length > 0 && cachedLastFlushAt === 0) {
        // For first flush, use queuedAt of oldest insight
        const oldest = settled[0];
        const now = Date.now();
        if (now - oldest.queuedAt >= maxFlushIntervalMs) {
          return { should: true, trigger: "time" };
        }
      }

      return { should: false, trigger: null };
    },

    async recordFlush(): Promise<void> {
      const now = Date.now();
      await appendLine(filePath, { type: "flush", at: now });
      cachedLastFlushAt = now;
      log.debug(`Recorded flush at ${new Date(now).toISOString()}`);
    },

    async getLastFlushAt(): Promise<number> {
      if (cachedLastFlushAt !== null) {
        return cachedLastFlushAt;
      }
      const state = await parseQueueFile(filePath);
      cachedLastFlushAt = state.lastFlushAt;
      return state.lastFlushAt;
    },

    async clear(): Promise<void> {
      await appendLine(filePath, { type: "clear" });
      cachedLastFlushAt = 0;
      log.debug("Queue cleared");
    },
  };
}
