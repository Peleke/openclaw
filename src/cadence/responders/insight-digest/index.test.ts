/**
 * Insight Digest responder integration tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createSignalBus } from "../../signal-bus.js";
import type { OpenClawSignal } from "../../signals.js";
import { createInsightDigestResponder, createAccumulator } from "./index.js";
import type { DigestConfig, DigestClock } from "./types.js";

const baseConfig: DigestConfig = {
  minInsightsToFlush: 3,
  maxHoursBetweenFlushes: 12,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  timezone: "UTC",
  cooldownHours: 0, // No cooldown for testing
  storePath: "",
  checkIntervalMs: 100, // Fast for testing
};

function createMockClock(quiet: boolean = false): DigestClock {
  return {
    isQuietPeriod: vi.fn().mockReturnValue(quiet),
    msUntilNextWindow: vi.fn().mockReturnValue(quiet ? 1000 : 0),
    now: () => Date.now(),
  };
}

function createExtractedSignal(insights: Array<{ id: string; topic: string }>): OpenClawSignal {
  return {
    type: "journal.insight.extracted",
    id: `sig-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
    payload: {
      source: {
        signalType: "obsidian.note.modified",
        signalId: "parent-signal",
        path: "/vault/journal/test.md",
        contentHash: "abc123",
      },
      insights: insights.map((i) => ({
        id: i.id,
        topic: i.topic,
        pillar: "norse",
        hook: `Hook for ${i.topic}`,
        excerpt: `Excerpt for ${i.topic}`,
        scores: { topicClarity: 0.8, publishReady: 0.7, novelty: 0.9 },
        formats: ["thread"],
      })),
      extractedAt: Date.now(),
      extractorVersion: "0.1.0-test",
    },
  };
}

let testDir: string;
let testConfig: DigestConfig;

beforeEach(async () => {
  vi.useFakeTimers();
  testDir = path.join(
    os.tmpdir(),
    `insight-digest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(testDir, { recursive: true });
  testConfig = { ...baseConfig, storePath: path.join(testDir, "queue.jsonl") };
});

afterEach(async () => {
  vi.useRealTimers();
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("Signal Subscription", () => {
  it("subscribes to journal.insight.extracted", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const responder = createInsightDigestResponder({
      config: testConfig,
      clock: createMockClock(),
    });

    const unsub = responder.register(bus);

    const signal = createExtractedSignal([{ id: "1", topic: "Test" }]);
    await bus.emit(signal);

    // Verify insight was queued
    const accumulator = createAccumulator(testConfig);
    const queue = await accumulator.getQueue();
    expect(queue).toHaveLength(1);

    unsub();
  });

  it("enqueues insights from signal", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const responder = createInsightDigestResponder({
      config: testConfig,
      clock: createMockClock(),
    });

    responder.register(bus);

    const signal = createExtractedSignal([
      { id: "1", topic: "Topic One" },
      { id: "2", topic: "Topic Two" },
    ]);
    await bus.emit(signal);

    const accumulator = createAccumulator(testConfig);
    const queue = await accumulator.getQueue();

    expect(queue).toHaveLength(2);
    expect(queue[0].topic).toBe("Topic One");
    expect(queue[1].topic).toBe("Topic Two");
  });

  it("handles signals with multiple insights", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const responder = createInsightDigestResponder({
      config: testConfig,
      clock: createMockClock(),
    });

    responder.register(bus);

    const signal = createExtractedSignal([
      { id: "1", topic: "A" },
      { id: "2", topic: "B" },
      { id: "3", topic: "C" },
      { id: "4", topic: "D" },
      { id: "5", topic: "E" },
    ]);
    await bus.emit(signal);

    const accumulator = createAccumulator(testConfig);
    const queue = await accumulator.getQueue();

    expect(queue).toHaveLength(5);
  });

  it("handles signals with zero insights", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const responder = createInsightDigestResponder({
      config: testConfig,
      clock: createMockClock(),
    });

    responder.register(bus);

    const signal = createExtractedSignal([]);
    await bus.emit(signal);

    const accumulator = createAccumulator(testConfig);
    const queue = await accumulator.getQueue();

    expect(queue).toHaveLength(0);
  });
});

describe("Flush Trigger", () => {
  it("calls onFlush when count threshold met", async () => {
    // Use real timers for this test due to timing issues with fake timers + async file I/O
    vi.useRealTimers();

    const bus = createSignalBus<OpenClawSignal>();
    const onFlush = vi.fn().mockResolvedValue(undefined);

    // Create a fresh temp dir for this test
    const realTestDir = path.join(os.tmpdir(), `flush-test-${Date.now()}`);
    await fs.mkdir(realTestDir, { recursive: true });

    const config: DigestConfig = {
      ...baseConfig,
      storePath: path.join(realTestDir, "queue.jsonl"),
      minInsightsToFlush: 3,
      checkIntervalMs: 50, // Fast for real timer test
    };

    const responder = createInsightDigestResponder({
      config,
      clock: createMockClock(),
      onFlush,
    });

    const unsub = responder.register(bus);

    // Add 3 insights
    await bus.emit(
      createExtractedSignal([
        { id: "1", topic: "A" },
        { id: "2", topic: "B" },
        { id: "3", topic: "C" },
      ]),
    );

    // Wait for scheduler check (real time)
    await new Promise((r) => setTimeout(r, 100));

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0][0].insights).toHaveLength(3);
    expect(onFlush.mock.calls[0][0].trigger).toBe("count");

    unsub();
    await fs.rm(realTestDir, { recursive: true, force: true });
  });

  it("calls onFlush when time threshold met", async () => {
    // Use real timers for this test due to timing issues with fake timers + async file I/O
    vi.useRealTimers();

    // Create a fresh temp dir for this test
    const realTestDir = path.join(os.tmpdir(), `time-flush-test-${Date.now()}`);
    await fs.mkdir(realTestDir, { recursive: true });

    const config: DigestConfig = {
      ...baseConfig,
      storePath: path.join(realTestDir, "queue.jsonl"),
      minInsightsToFlush: 10, // High count threshold
      maxHoursBetweenFlushes: 0.00001, // ~36ms - very short for testing
      checkIntervalMs: 20,
    };

    const bus = createSignalBus<OpenClawSignal>();
    const onFlush = vi.fn().mockResolvedValue(undefined);

    const responder = createInsightDigestResponder({
      config,
      clock: createMockClock(),
      onFlush,
    });

    const unsub = responder.register(bus);

    // Add just 1 insight (under count threshold)
    await bus.emit(createExtractedSignal([{ id: "1", topic: "A" }]));

    // Wait for time trigger (real time)
    await new Promise((r) => setTimeout(r, 100));

    expect(onFlush).toHaveBeenCalled();
    expect(onFlush.mock.calls[0][0].trigger).toBe("time");

    unsub();
    await fs.rm(realTestDir, { recursive: true, force: true });
  });

  it("does NOT call onFlush during quiet hours", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const onFlush = vi.fn();
    const quietClock = createMockClock(true); // Always quiet

    const responder = createInsightDigestResponder({
      config: { ...testConfig, minInsightsToFlush: 2 },
      clock: quietClock,
      onFlush,
    });

    responder.register(bus);

    // Add enough insights to trigger flush
    await bus.emit(
      createExtractedSignal([
        { id: "1", topic: "A" },
        { id: "2", topic: "B" },
        { id: "3", topic: "C" },
      ]),
    );

    // Multiple check cycles
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(testConfig.checkIntervalMs);
    }

    expect(onFlush).not.toHaveBeenCalled();
  });

  it("does NOT call onFlush when insights are fresh (cooldown)", async () => {
    const config = {
      ...testConfig,
      minInsightsToFlush: 2,
      cooldownHours: 1, // 1 hour cooldown
    };

    const bus = createSignalBus<OpenClawSignal>();
    const onFlush = vi.fn();

    const responder = createInsightDigestResponder({
      config,
      clock: createMockClock(),
      onFlush,
    });

    responder.register(bus);

    // Add insights (they're fresh)
    await bus.emit(
      createExtractedSignal([
        { id: "1", topic: "A" },
        { id: "2", topic: "B" },
      ]),
    );

    // Check cycles (but not enough time for cooldown)
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(config.checkIntervalMs);
    }

    expect(onFlush).not.toHaveBeenCalled();
  });

  it("emits journal.digest.ready signal on flush", async () => {
    // Use real timers for this test due to timing issues with fake timers + async file I/O
    vi.useRealTimers();

    // Create a fresh temp dir for this test
    const realTestDir = path.join(os.tmpdir(), `signal-flush-test-${Date.now()}`);
    await fs.mkdir(realTestDir, { recursive: true });

    const config: DigestConfig = {
      ...baseConfig,
      storePath: path.join(realTestDir, "queue.jsonl"),
      minInsightsToFlush: 2,
      checkIntervalMs: 50,
    };

    const bus = createSignalBus<OpenClawSignal>();
    const digestHandler = vi.fn();

    bus.subscribe("journal.digest.ready", digestHandler);

    const responder = createInsightDigestResponder({
      config,
      clock: createMockClock(),
    });

    const unsub = responder.register(bus);

    await bus.emit(
      createExtractedSignal([
        { id: "1", topic: "A" },
        { id: "2", topic: "B" },
      ]),
    );

    // Wait for scheduler check (real time)
    await new Promise((r) => setTimeout(r, 100));

    expect(digestHandler).toHaveBeenCalledTimes(1);
    expect(digestHandler.mock.calls[0][0].payload.insights).toHaveLength(2);

    unsub();
    await fs.rm(realTestDir, { recursive: true, force: true });
  });

  it("dequeues flushed insights", async () => {
    // Use real timers for this test due to timing issues with fake timers + async file I/O
    vi.useRealTimers();

    // Create a fresh temp dir for this test
    const realTestDir = path.join(os.tmpdir(), `dequeue-test-${Date.now()}`);
    await fs.mkdir(realTestDir, { recursive: true });

    const config: DigestConfig = {
      ...baseConfig,
      storePath: path.join(realTestDir, "queue.jsonl"),
      minInsightsToFlush: 2,
      checkIntervalMs: 50,
    };

    const bus = createSignalBus<OpenClawSignal>();

    const responder = createInsightDigestResponder({
      config,
      clock: createMockClock(),
    });

    const unsub = responder.register(bus);

    await bus.emit(
      createExtractedSignal([
        { id: "1", topic: "A" },
        { id: "2", topic: "B" },
      ]),
    );

    // Wait for scheduler check (real time)
    await new Promise((r) => setTimeout(r, 100));

    // Queue should be empty after flush
    const accumulator = createAccumulator(config);
    const queue = await accumulator.getQueue();
    expect(queue).toHaveLength(0);

    unsub();
    await fs.rm(realTestDir, { recursive: true, force: true });
  });
});

describe("Integration", () => {
  it("full flow: enqueue → settle → flush → dequeue", async () => {
    // Use real timers for this test due to timing issues with fake timers + async file I/O
    vi.useRealTimers();

    // Create a fresh temp dir for this test
    const realTestDir = path.join(os.tmpdir(), `full-flow-test-${Date.now()}`);
    await fs.mkdir(realTestDir, { recursive: true });

    const config: DigestConfig = {
      ...baseConfig,
      storePath: path.join(realTestDir, "queue.jsonl"),
      minInsightsToFlush: 2,
      cooldownHours: 0, // No cooldown for testing
      checkIntervalMs: 50,
    };

    const bus = createSignalBus<OpenClawSignal>();
    const onFlush = vi.fn().mockResolvedValue(undefined);

    const responder = createInsightDigestResponder({
      config,
      clock: createMockClock(),
      onFlush,
    });

    const unsub = responder.register(bus);

    // 1. Enqueue insights
    await bus.emit(
      createExtractedSignal([
        { id: "1", topic: "A" },
        { id: "2", topic: "B" },
      ]),
    );

    // Verify enqueued
    let accumulator = createAccumulator(config);
    let queue = await accumulator.getQueue();
    expect(queue).toHaveLength(2);

    // 2. Wait for scheduler check (real time)
    await new Promise((r) => setTimeout(r, 100));

    // 3. Verify flushed
    expect(onFlush).toHaveBeenCalledTimes(1);

    // 4. Verify dequeued
    accumulator = createAccumulator(config);
    queue = await accumulator.getQueue();
    expect(queue).toHaveLength(0);

    unsub();
    await fs.rm(realTestDir, { recursive: true, force: true });
  });

  it("respects minInsightsToFlush config", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const onFlush = vi.fn();

    const responder = createInsightDigestResponder({
      config: { ...testConfig, minInsightsToFlush: 5 },
      clock: createMockClock(),
      onFlush,
    });

    responder.register(bus);

    // Add 4 (under threshold)
    await bus.emit(
      createExtractedSignal([
        { id: "1", topic: "A" },
        { id: "2", topic: "B" },
        { id: "3", topic: "C" },
        { id: "4", topic: "D" },
      ]),
    );

    await vi.advanceTimersByTimeAsync(testConfig.checkIntervalMs);

    expect(onFlush).not.toHaveBeenCalled();

    // Add 5th
    await bus.emit(createExtractedSignal([{ id: "5", topic: "E" }]));

    await vi.advanceTimersByTimeAsync(testConfig.checkIntervalMs);

    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});

describe("Cleanup", () => {
  it("unsubscriber stops signal subscription", async () => {
    const bus = createSignalBus<OpenClawSignal>();

    const responder = createInsightDigestResponder({
      config: testConfig,
      clock: createMockClock(),
    });

    const unsub = responder.register(bus);

    // Emit before unsubscribe
    await bus.emit(createExtractedSignal([{ id: "1", topic: "A" }]));

    let accumulator = createAccumulator(testConfig);
    let queue = await accumulator.getQueue();
    expect(queue).toHaveLength(1);

    // Unsubscribe
    unsub();

    // Emit after unsubscribe
    await bus.emit(createExtractedSignal([{ id: "2", topic: "B" }]));

    accumulator = createAccumulator(testConfig);
    queue = await accumulator.getQueue();
    expect(queue).toHaveLength(1); // Still just 1
  });

  it("unsubscriber stops scheduler", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const onFlush = vi.fn();

    const responder = createInsightDigestResponder({
      config: { ...testConfig, minInsightsToFlush: 1 },
      clock: createMockClock(),
      onFlush,
    });

    const unsub = responder.register(bus);

    // Unsubscribe before any checks
    unsub();

    // Emit signal (won't be processed)
    await bus.emit(createExtractedSignal([{ id: "1", topic: "A" }]));

    // Advance past many check intervals
    await vi.advanceTimersByTimeAsync(testConfig.checkIntervalMs * 10);

    // No flush should have occurred
    expect(onFlush).not.toHaveBeenCalled();
  });
});

describe("Error Handling", () => {
  it("continues on enqueue error", async () => {
    // This tests that errors in the signal handler don't crash the responder
    const bus = createSignalBus<OpenClawSignal>();

    // Use an invalid store path that will fail on first write
    const badConfig = {
      ...testConfig,
      storePath: "/invalid/path/that/cannot/be/created/queue.jsonl",
    };

    const responder = createInsightDigestResponder({
      config: badConfig,
      clock: createMockClock(),
    });

    const unsub = responder.register(bus);

    // This should not throw (error is caught internally by the bus)
    await expect(bus.emit(createExtractedSignal([{ id: "1", topic: "A" }]))).resolves.not.toThrow();

    unsub();
  });

  it("continues on flush callback error", async () => {
    // Use real timers for this test due to timing issues with fake timers + async file I/O
    vi.useRealTimers();

    // Create a fresh temp dir for this test
    const realTestDir = path.join(os.tmpdir(), `error-test-${Date.now()}`);
    await fs.mkdir(realTestDir, { recursive: true });

    const config: DigestConfig = {
      ...baseConfig,
      storePath: path.join(realTestDir, "queue.jsonl"),
      minInsightsToFlush: 1,
      checkIntervalMs: 50,
    };

    const bus = createSignalBus<OpenClawSignal>();
    const onFlush = vi.fn().mockRejectedValue(new Error("Callback failed"));

    const responder = createInsightDigestResponder({
      config,
      clock: createMockClock(),
      onFlush,
    });

    const unsub = responder.register(bus);

    await bus.emit(createExtractedSignal([{ id: "1", topic: "A" }]));

    // Should not throw (real time)
    await new Promise((r) => setTimeout(r, 100));

    expect(onFlush).toHaveBeenCalled();
    unsub();
    await fs.rm(realTestDir, { recursive: true, force: true });
  });
});
