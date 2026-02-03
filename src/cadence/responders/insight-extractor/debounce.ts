/**
 * Debounce utilities for insight extraction.
 *
 * - Debouncer: Per-key debouncing for rapid file changes
 * - Batcher: Rate-limited batching for LLM calls
 */

import { createSubsystemLogger } from "../../../logging/subsystem.js";

const log = createSubsystemLogger("cadence").child("debounce");

export interface DebouncerConfig {
  delayMs: number;
}

export interface Debouncer<T> {
  schedule(key: string, value: T, callback: (value: T) => void): void;
  cancel(key: string): void;
  clear(): void;
  pendingCount(): number;
}

/**
 * Create a debouncer for per-key debouncing.
 * Each key has an independent timer that resets on new values.
 */
export function createDebouncer<T>(config: DebouncerConfig): Debouncer<T> {
  const pending = new Map<
    string,
    { timer: NodeJS.Timeout; value: T; callback: (value: T) => void }
  >();

  return {
    schedule(key: string, value: T, callback: (value: T) => void): void {
      // Cancel existing timer for this key
      const existing = pending.get(key);
      if (existing) {
        clearTimeout(existing.timer);
      }

      // Schedule new timer
      const timer = setTimeout(() => {
        pending.delete(key);
        callback(value);
      }, config.delayMs);

      pending.set(key, { timer, value, callback });
    },

    cancel(key: string): void {
      const existing = pending.get(key);
      if (existing) {
        clearTimeout(existing.timer);
        pending.delete(key);
      }
    },

    clear(): void {
      for (const { timer } of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    },

    pendingCount(): number {
      return pending.size;
    },
  };
}

export interface BatcherConfig {
  minDelayMs: number;
  maxBatchSize: number;
}

export interface Batcher<T> {
  add(item: T, onBatch: (batch: T[]) => void): void;
  queueLength(): number;
  clear(): void;
}

/**
 * Create a batcher for rate-limited batch delivery.
 * Items are queued and delivered in batches respecting:
 * - maxBatchSize: Maximum items per batch
 * - minDelayMs: Minimum time between deliveries
 */
export function createBatcher<T>(config: BatcherConfig): Batcher<T> {
  const queue: T[] = [];
  let deliveryTimeout: NodeJS.Timeout | null = null;
  let lastDelivery = 0;
  let currentOnBatch: ((batch: T[]) => void) | null = null;

  const scheduleDelivery = (): void => {
    if (deliveryTimeout || queue.length === 0 || !currentOnBatch) {
      return;
    }

    const now = Date.now();
    const timeSinceLast = now - lastDelivery;
    const delay = Math.max(0, config.minDelayMs - timeSinceLast);

    deliveryTimeout = setTimeout(() => {
      deliveryTimeout = null;
      lastDelivery = Date.now();

      // Take up to maxBatchSize items
      const batch = queue.splice(0, config.maxBatchSize);

      if (batch.length > 0 && currentOnBatch) {
        log.debug(`Batch delivery: ${batch.length} items`);
        currentOnBatch(batch);
      }

      // Schedule next delivery if more items remain
      scheduleDelivery();
    }, delay);
  };

  return {
    add(item: T, onBatch: (batch: T[]) => void): void {
      queue.push(item);
      currentOnBatch = onBatch;
      scheduleDelivery();
    },

    queueLength(): number {
      return queue.length;
    },

    clear(): void {
      queue.length = 0;
      if (deliveryTimeout) {
        clearTimeout(deliveryTimeout);
        deliveryTimeout = null;
      }
    },
  };
}
