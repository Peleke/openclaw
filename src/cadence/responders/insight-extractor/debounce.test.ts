/**
 * Debounce utilities tests — exhaustive coverage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebouncer, createBatcher } from "./debounce.js";

describe("Debouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Basic Scheduling", () => {
    it("fires callback after delay", async () => {
      const debouncer = createDebouncer<string>({ delayMs: 1000 });
      const callback = vi.fn();

      debouncer.schedule("key", "value", callback);

      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(999);
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledWith("value");
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("handles multiple independent keys", async () => {
      const debouncer = createDebouncer<string>({ delayMs: 1000 });
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      debouncer.schedule("key1", "value1", callback1);
      vi.advanceTimersByTime(500);

      debouncer.schedule("key2", "value2", callback2);
      vi.advanceTimersByTime(500);

      // key1 should fire at 1000ms
      expect(callback1).toHaveBeenCalledWith("value1");
      expect(callback2).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);
      // key2 should fire at 1500ms
      expect(callback2).toHaveBeenCalledWith("value2");
    });

    it("resets timer on repeated calls with same key", async () => {
      const debouncer = createDebouncer<number>({ delayMs: 1000 });
      const callback = vi.fn();

      debouncer.schedule("key", 1, callback);
      vi.advanceTimersByTime(800);

      debouncer.schedule("key", 2, callback);
      vi.advanceTimersByTime(800);

      // Should not have fired yet (reset at 800ms, now at 1600ms from start)
      expect(callback).not.toHaveBeenCalled();

      debouncer.schedule("key", 3, callback);
      vi.advanceTimersByTime(1000);

      // Should fire with latest value
      expect(callback).toHaveBeenCalledWith(3);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("Cancellation", () => {
    it("cancels pending callback for key", async () => {
      const debouncer = createDebouncer<string>({ delayMs: 1000 });
      const callback = vi.fn();

      debouncer.schedule("key", "value", callback);
      vi.advanceTimersByTime(500);

      debouncer.cancel("key");
      vi.advanceTimersByTime(1000);

      expect(callback).not.toHaveBeenCalled();
    });

    it("cancel is idempotent for non-existent key", () => {
      const debouncer = createDebouncer<string>({ delayMs: 1000 });

      // Should not throw
      expect(() => debouncer.cancel("nonexistent")).not.toThrow();
    });

    it("clears all pending callbacks", async () => {
      const debouncer = createDebouncer<string>({ delayMs: 1000 });
      const callbacks = [vi.fn(), vi.fn(), vi.fn()];

      debouncer.schedule("a", "1", callbacks[0]);
      debouncer.schedule("b", "2", callbacks[1]);
      debouncer.schedule("c", "3", callbacks[2]);

      debouncer.clear();
      vi.advanceTimersByTime(2000);

      callbacks.forEach((cb) => expect(cb).not.toHaveBeenCalled());
    });
  });

  describe("Pending Count", () => {
    it("tracks pending count correctly", () => {
      const debouncer = createDebouncer<string>({ delayMs: 1000 });
      const callback = vi.fn();

      expect(debouncer.pendingCount()).toBe(0);

      debouncer.schedule("a", "1", callback);
      expect(debouncer.pendingCount()).toBe(1);

      debouncer.schedule("b", "2", callback);
      expect(debouncer.pendingCount()).toBe(2);

      // Same key doesn't increase count
      debouncer.schedule("a", "3", callback);
      expect(debouncer.pendingCount()).toBe(2);

      vi.advanceTimersByTime(1000);
      expect(debouncer.pendingCount()).toBe(0);
    });

    it("decrements on cancel", () => {
      const debouncer = createDebouncer<string>({ delayMs: 1000 });
      const callback = vi.fn();

      debouncer.schedule("a", "1", callback);
      debouncer.schedule("b", "2", callback);
      expect(debouncer.pendingCount()).toBe(2);

      debouncer.cancel("a");
      expect(debouncer.pendingCount()).toBe(1);
    });
  });

  describe("Edge Cases", () => {
    it("handles zero delay", async () => {
      const debouncer = createDebouncer<string>({ delayMs: 0 });
      const callback = vi.fn();

      debouncer.schedule("key", "value", callback);

      // Even with 0ms delay, callback is async
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(0);
      expect(callback).toHaveBeenCalledWith("value");
    });

    it("handles very long delays", async () => {
      const debouncer = createDebouncer<string>({ delayMs: 60000 });
      const callback = vi.fn();

      debouncer.schedule("key", "value", callback);

      vi.advanceTimersByTime(59999);
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalled();
    });

    it("handles rapid fire scheduling", async () => {
      const debouncer = createDebouncer<number>({ delayMs: 100 });
      const callback = vi.fn();

      // Simulate rapid typing
      for (let i = 0; i < 100; i++) {
        debouncer.schedule("key", i, callback);
        vi.advanceTimersByTime(10);
      }

      // At 1000ms, still 100ms to go from last schedule
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(99);
    });

    it("handles async callbacks", async () => {
      vi.useRealTimers();

      const debouncer = createDebouncer<string>({ delayMs: 10 });
      const results: string[] = [];

      const asyncCallback = async (value: string) => {
        await new Promise((r) => setTimeout(r, 5));
        results.push(value);
      };

      debouncer.schedule("key", "value", asyncCallback);

      await new Promise((r) => setTimeout(r, 20));
      expect(results).toEqual(["value"]);
    });
  });
});

describe("Batcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Basic Batching", () => {
    it("delivers first batch immediately (lastDelivery starts at 0)", async () => {
      // Note: First batch delivers immediately because timeSinceLast is large
      const batcher = createBatcher<string>({ minDelayMs: 1000, maxBatchSize: 10 });
      const onBatch = vi.fn();

      batcher.add("item1", onBatch);

      // First delivery is immediate (delay is 0 when lastDelivery is 0)
      vi.advanceTimersByTime(0);
      expect(onBatch).toHaveBeenCalledWith(["item1"]);
    });

    it("batches items added before first delivery", async () => {
      const batcher = createBatcher<string>({ minDelayMs: 1000, maxBatchSize: 10 });
      const onBatch = vi.fn();

      // Add multiple items synchronously (before timer advances)
      batcher.add("item1", onBatch);
      batcher.add("item2", onBatch);
      batcher.add("item3", onBatch);

      // First delivery takes all queued items
      vi.advanceTimersByTime(0);
      expect(onBatch).toHaveBeenCalledWith(["item1", "item2", "item3"]);
    });

    it("respects max batch size", async () => {
      const batcher = createBatcher<number>({ minDelayMs: 100, maxBatchSize: 3 });
      const onBatch = vi.fn();

      // Add 7 items synchronously
      for (let i = 1; i <= 7; i++) {
        batcher.add(i, onBatch);
      }

      // First batch of 3
      vi.advanceTimersByTime(0);
      expect(onBatch).toHaveBeenNthCalledWith(1, [1, 2, 3]);

      // Second batch after minDelay
      vi.advanceTimersByTime(100);
      expect(onBatch).toHaveBeenNthCalledWith(2, [4, 5, 6]);

      // Third batch
      vi.advanceTimersByTime(100);
      expect(onBatch).toHaveBeenNthCalledWith(3, [7]);
    });
  });

  describe("Throttling", () => {
    it("enforces minimum delay for subsequent deliveries", async () => {
      const batcher = createBatcher<string>({ minDelayMs: 1000, maxBatchSize: 1 });
      const onBatch = vi.fn();

      // First item delivers immediately
      batcher.add("item1", onBatch);
      vi.advanceTimersByTime(0);
      expect(onBatch).toHaveBeenCalledTimes(1);

      // Second item must wait for minDelay
      batcher.add("item2", onBatch);
      vi.advanceTimersByTime(500);
      expect(onBatch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(500);
      expect(onBatch).toHaveBeenCalledTimes(2);
    });

    it("delivers immediately if enough time has passed since last delivery", async () => {
      const batcher = createBatcher<string>({ minDelayMs: 1000, maxBatchSize: 10 });
      const onBatch = vi.fn();

      batcher.add("item1", onBatch);
      vi.advanceTimersByTime(0);
      expect(onBatch).toHaveBeenCalledTimes(1);

      // Wait longer than minDelay
      vi.advanceTimersByTime(2000);

      batcher.add("item2", onBatch);
      vi.advanceTimersByTime(0); // Immediate since minDelay passed
      expect(onBatch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Queue Management", () => {
    it("tracks queue length", () => {
      const batcher = createBatcher<string>({ minDelayMs: 1000, maxBatchSize: 10 });
      const onBatch = vi.fn();

      expect(batcher.queueLength()).toBe(0);

      batcher.add("item1", onBatch);
      batcher.add("item2", onBatch);
      batcher.add("item3", onBatch);

      expect(batcher.queueLength()).toBe(3);

      vi.advanceTimersByTime(1000);
      expect(batcher.queueLength()).toBe(0);
    });

    it("clears queue and cancels pending delivery", () => {
      const batcher = createBatcher<string>({ minDelayMs: 1000, maxBatchSize: 10 });
      const onBatch = vi.fn();

      batcher.add("item1", onBatch);
      batcher.add("item2", onBatch);

      batcher.clear();
      expect(batcher.queueLength()).toBe(0);

      vi.advanceTimersByTime(2000);
      expect(onBatch).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("handles empty batch gracefully", async () => {
      const batcher = createBatcher<string>({ minDelayMs: 100, maxBatchSize: 10 });
      const onBatch = vi.fn();

      // Add then clear
      batcher.add("item", onBatch);
      batcher.clear();

      vi.advanceTimersByTime(200);
      expect(onBatch).not.toHaveBeenCalled();
    });

    it("handles zero min delay", async () => {
      const batcher = createBatcher<string>({ minDelayMs: 0, maxBatchSize: 10 });
      const onBatch = vi.fn();

      batcher.add("item1", onBatch);
      batcher.add("item2", onBatch);

      vi.advanceTimersByTime(0);
      expect(onBatch).toHaveBeenCalledWith(["item1", "item2"]);
    });

    it("handles batch size of 1", async () => {
      const batcher = createBatcher<number>({ minDelayMs: 100, maxBatchSize: 1 });
      const onBatch = vi.fn();

      batcher.add(1, onBatch);
      batcher.add(2, onBatch);
      batcher.add(3, onBatch);

      vi.advanceTimersByTime(100);
      expect(onBatch).toHaveBeenCalledWith([1]);

      vi.advanceTimersByTime(100);
      expect(onBatch).toHaveBeenCalledWith([2]);

      vi.advanceTimersByTime(100);
      expect(onBatch).toHaveBeenCalledWith([3]);
    });

    it("handles large batch sizes", async () => {
      const batcher = createBatcher<number>({ minDelayMs: 100, maxBatchSize: 1000 });
      const onBatch = vi.fn();

      for (let i = 0; i < 500; i++) {
        batcher.add(i, onBatch);
      }

      vi.advanceTimersByTime(100);
      expect(onBatch).toHaveBeenCalledTimes(1);
      expect(onBatch.mock.calls[0][0]).toHaveLength(500);
    });
  });
});
