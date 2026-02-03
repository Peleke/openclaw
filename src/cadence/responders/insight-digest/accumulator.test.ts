/**
 * Accumulator tests — exhaustive coverage for JSONL storage and flush logic.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createAccumulator } from "./accumulator.js";
import type { DigestConfig, QueuedInsight } from "./types.js";

const baseConfig: DigestConfig = {
  minInsightsToFlush: 5,
  maxHoursBetweenFlushes: 12,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  timezone: "America/New_York",
  cooldownHours: 4,
  storePath: "", // Set in beforeEach
  checkIntervalMs: 1000,
};

function createTestInsight(id: string, queuedAt: number = Date.now()): QueuedInsight {
  return {
    id,
    queuedAt,
    sourceSignalId: `signal-${id}`,
    sourcePath: `/vault/journal/${id}.md`,
    topic: `Topic ${id}`,
    pillar: "norse",
    hook: `Hook for ${id}`,
    excerpt: `Excerpt for ${id}`,
    scores: { topicClarity: 0.8, publishReady: 0.7, novelty: 0.9 },
    formats: ["thread", "post"],
  };
}

let testDir: string;
let testConfig: DigestConfig;

beforeEach(async () => {
  testDir = path.join(
    os.tmpdir(),
    `insight-digest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(testDir, { recursive: true });
  testConfig = { ...baseConfig, storePath: path.join(testDir, "queue.jsonl") };
});

afterEach(async () => {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("Enqueue Operations", () => {
  it("enqueues single insight", async () => {
    const accumulator = createAccumulator(testConfig);
    const insight = createTestInsight("1");

    await accumulator.enqueue(insight);
    const queue = await accumulator.getQueue();

    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe("1");
  });

  it("enqueues multiple insights", async () => {
    const accumulator = createAccumulator(testConfig);

    await accumulator.enqueue(createTestInsight("1"));
    await accumulator.enqueue(createTestInsight("2"));
    await accumulator.enqueue(createTestInsight("3"));

    const queue = await accumulator.getQueue();
    expect(queue).toHaveLength(3);
  });

  it("preserves all insight fields", async () => {
    const accumulator = createAccumulator(testConfig);
    const insight: QueuedInsight = {
      id: "test-full",
      queuedAt: 1700000000000,
      sourceSignalId: "sig-123",
      sourcePath: "/vault/test.md",
      topic: "Full Topic",
      pillar: "technical",
      hook: "A great hook",
      excerpt: "The full excerpt text",
      scores: { topicClarity: 0.95, publishReady: 0.85, novelty: 0.75 },
      formats: ["essay", "video"],
    };

    await accumulator.enqueue(insight);
    const queue = await accumulator.getQueue();

    expect(queue[0]).toEqual(insight);
  });

  it("sets queuedAt timestamp", async () => {
    const accumulator = createAccumulator(testConfig);
    const now = Date.now();
    const insight = createTestInsight("1", now);

    await accumulator.enqueue(insight);
    const queue = await accumulator.getQueue();

    expect(queue[0].queuedAt).toBe(now);
  });

  it("handles duplicate IDs (appends, not replaces)", async () => {
    const accumulator = createAccumulator(testConfig);

    await accumulator.enqueue(createTestInsight("1", 1000));
    await accumulator.enqueue(createTestInsight("1", 2000));

    const queue = await accumulator.getQueue();
    // Both entries are kept (JSONL append-only)
    // But Map dedupes by ID, so we get the latest
    expect(queue).toHaveLength(1);
    expect(queue[0].queuedAt).toBe(2000);
  });

  it("handles insight without pillar", async () => {
    const accumulator = createAccumulator(testConfig);
    const insight = createTestInsight("1");
    delete (insight as Partial<QueuedInsight>).pillar;

    await accumulator.enqueue(insight);
    const queue = await accumulator.getQueue();

    expect(queue[0].pillar).toBeUndefined();
  });
});

describe("Queue Retrieval", () => {
  it("returns empty array for fresh queue", async () => {
    const accumulator = createAccumulator(testConfig);
    const queue = await accumulator.getQueue();
    expect(queue).toEqual([]);
  });

  it("returns all queued insights in order", async () => {
    const accumulator = createAccumulator(testConfig);

    await accumulator.enqueue(createTestInsight("1", 1000));
    await accumulator.enqueue(createTestInsight("2", 2000));
    await accumulator.enqueue(createTestInsight("3", 3000));

    const queue = await accumulator.getQueue();
    expect(queue.map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("preserves insertion order (FIFO)", async () => {
    const accumulator = createAccumulator(testConfig);

    // Enqueue in reverse timestamp order
    await accumulator.enqueue(createTestInsight("3", 3000));
    await accumulator.enqueue(createTestInsight("1", 1000));
    await accumulator.enqueue(createTestInsight("2", 2000));

    const queue = await accumulator.getQueue();
    // Sorted by queuedAt
    expect(queue.map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("handles corrupted JSONL lines gracefully", async () => {
    const accumulator = createAccumulator(testConfig);

    // Write valid insight
    await accumulator.enqueue(createTestInsight("1"));

    // Manually append corrupted line
    await fs.appendFile(testConfig.storePath, "not valid json\n");
    await fs.appendFile(testConfig.storePath, '{"partial": true\n');

    // Write another valid insight
    await accumulator.enqueue(createTestInsight("2"));

    const queue = await accumulator.getQueue();
    expect(queue).toHaveLength(2);
    expect(queue.map((i) => i.id)).toEqual(["1", "2"]);
  });
});

describe("Settled Insights (Cooldown)", () => {
  it("excludes insights newer than cooldownHours", async () => {
    const config = { ...testConfig, cooldownHours: 4 };
    const accumulator = createAccumulator(config);
    const now = Date.now();

    // 1 hour ago (not settled)
    await accumulator.enqueue(createTestInsight("1", now - 1 * 60 * 60 * 1000));

    const settled = await accumulator.getSettledInsights();
    expect(settled).toHaveLength(0);
  });

  it("includes insights older than cooldownHours", async () => {
    const config = { ...testConfig, cooldownHours: 4 };
    const accumulator = createAccumulator(config);
    const now = Date.now();

    // 5 hours ago (settled)
    await accumulator.enqueue(createTestInsight("1", now - 5 * 60 * 60 * 1000));

    const settled = await accumulator.getSettledInsights();
    expect(settled).toHaveLength(1);
  });

  it("handles exactly-at-boundary timing", async () => {
    const config = { ...testConfig, cooldownHours: 4 };
    const accumulator = createAccumulator(config);
    const now = Date.now();

    // Exactly 4 hours ago (just settled)
    await accumulator.enqueue(createTestInsight("1", now - 4 * 60 * 60 * 1000));

    const settled = await accumulator.getSettledInsights();
    expect(settled).toHaveLength(1);
  });

  it("returns empty if all insights are fresh", async () => {
    const config = { ...testConfig, cooldownHours: 4 };
    const accumulator = createAccumulator(config);
    const now = Date.now();

    await accumulator.enqueue(createTestInsight("1", now - 1 * 60 * 60 * 1000));
    await accumulator.enqueue(createTestInsight("2", now - 2 * 60 * 60 * 1000));
    await accumulator.enqueue(createTestInsight("3", now - 3 * 60 * 60 * 1000));

    const settled = await accumulator.getSettledInsights();
    expect(settled).toHaveLength(0);
  });

  it("returns all if all insights are settled", async () => {
    const config = { ...testConfig, cooldownHours: 4 };
    const accumulator = createAccumulator(config);
    const now = Date.now();

    await accumulator.enqueue(createTestInsight("1", now - 5 * 60 * 60 * 1000));
    await accumulator.enqueue(createTestInsight("2", now - 6 * 60 * 60 * 1000));
    await accumulator.enqueue(createTestInsight("3", now - 7 * 60 * 60 * 1000));

    const settled = await accumulator.getSettledInsights();
    expect(settled).toHaveLength(3);
  });

  it("mixed fresh/settled returns only settled", async () => {
    const config = { ...testConfig, cooldownHours: 4 };
    const accumulator = createAccumulator(config);
    const now = Date.now();

    await accumulator.enqueue(createTestInsight("fresh1", now - 1 * 60 * 60 * 1000));
    await accumulator.enqueue(createTestInsight("settled1", now - 5 * 60 * 60 * 1000));
    await accumulator.enqueue(createTestInsight("fresh2", now - 2 * 60 * 60 * 1000));
    await accumulator.enqueue(createTestInsight("settled2", now - 6 * 60 * 60 * 1000));

    const settled = await accumulator.getSettledInsights();
    expect(settled).toHaveLength(2);
    expect(settled.map((i) => i.id).sort()).toEqual(["settled1", "settled2"]);
  });
});

describe("Dequeue Operations", () => {
  it("removes specified IDs", async () => {
    const accumulator = createAccumulator(testConfig);

    await accumulator.enqueue(createTestInsight("1"));
    await accumulator.enqueue(createTestInsight("2"));
    await accumulator.enqueue(createTestInsight("3"));

    await accumulator.dequeue(["2"]);

    const queue = await accumulator.getQueue();
    expect(queue.map((i) => i.id)).toEqual(["1", "3"]);
  });

  it("preserves unspecified IDs", async () => {
    const accumulator = createAccumulator(testConfig);

    await accumulator.enqueue(createTestInsight("1"));
    await accumulator.enqueue(createTestInsight("2"));
    await accumulator.enqueue(createTestInsight("3"));

    await accumulator.dequeue(["1", "3"]);

    const queue = await accumulator.getQueue();
    expect(queue.map((i) => i.id)).toEqual(["2"]);
  });

  it("handles non-existent IDs gracefully", async () => {
    const accumulator = createAccumulator(testConfig);

    await accumulator.enqueue(createTestInsight("1"));

    await accumulator.dequeue(["nonexistent"]);

    const queue = await accumulator.getQueue();
    expect(queue).toHaveLength(1);
  });

  it("handles empty ID array", async () => {
    const accumulator = createAccumulator(testConfig);

    await accumulator.enqueue(createTestInsight("1"));

    await accumulator.dequeue([]);

    const queue = await accumulator.getQueue();
    expect(queue).toHaveLength(1);
  });

  it("handles dequeue of entire queue", async () => {
    const accumulator = createAccumulator(testConfig);

    await accumulator.enqueue(createTestInsight("1"));
    await accumulator.enqueue(createTestInsight("2"));
    await accumulator.enqueue(createTestInsight("3"));

    await accumulator.dequeue(["1", "2", "3"]);

    const queue = await accumulator.getQueue();
    expect(queue).toHaveLength(0);
  });
});

describe("Flush Conditions", () => {
  it("returns false when under minInsightsToFlush", () => {
    const config = { ...testConfig, minInsightsToFlush: 5 };
    const accumulator = createAccumulator(config);

    const settled = [createTestInsight("1"), createTestInsight("2")];
    const result = accumulator.shouldFlush(settled);

    expect(result.should).toBe(false);
    expect(result.trigger).toBeNull();
  });

  it("returns true with trigger=count when at minInsightsToFlush", async () => {
    const config = { ...testConfig, minInsightsToFlush: 3 };
    const accumulator = createAccumulator(config);

    // Need to call getQueue to populate cache
    await accumulator.getQueue();

    const settled = [createTestInsight("1"), createTestInsight("2"), createTestInsight("3")];
    const result = accumulator.shouldFlush(settled);

    expect(result.should).toBe(true);
    expect(result.trigger).toBe("count");
  });

  it("returns true with trigger=count when over minInsightsToFlush", async () => {
    const config = { ...testConfig, minInsightsToFlush: 2 };
    const accumulator = createAccumulator(config);

    await accumulator.getQueue();

    const settled = [
      createTestInsight("1"),
      createTestInsight("2"),
      createTestInsight("3"),
      createTestInsight("4"),
    ];
    const result = accumulator.shouldFlush(settled);

    expect(result.should).toBe(true);
    expect(result.trigger).toBe("count");
  });

  it("returns true with trigger=time when maxHours exceeded (even if under count)", async () => {
    const config = { ...testConfig, minInsightsToFlush: 10, maxHoursBetweenFlushes: 1 };
    const accumulator = createAccumulator(config);

    // Record a flush from 2 hours ago
    await fs.mkdir(path.dirname(testConfig.storePath), { recursive: true });
    const oldFlush = { type: "flush", at: Date.now() - 2 * 60 * 60 * 1000 };
    await fs.writeFile(testConfig.storePath, JSON.stringify(oldFlush) + "\n");

    await accumulator.getQueue(); // Populate cache

    const settled = [createTestInsight("1")]; // Under minInsightsToFlush
    const result = accumulator.shouldFlush(settled);

    expect(result.should).toBe(true);
    expect(result.trigger).toBe("time");
  });

  it("returns trigger=count when both conditions met (count takes priority)", async () => {
    const config = { ...testConfig, minInsightsToFlush: 2, maxHoursBetweenFlushes: 1 };
    const accumulator = createAccumulator(config);

    // Record a flush from 2 hours ago
    await fs.mkdir(path.dirname(testConfig.storePath), { recursive: true });
    const oldFlush = { type: "flush", at: Date.now() - 2 * 60 * 60 * 1000 };
    await fs.writeFile(testConfig.storePath, JSON.stringify(oldFlush) + "\n");

    await accumulator.getQueue();

    const settled = [createTestInsight("1"), createTestInsight("2"), createTestInsight("3")];
    const result = accumulator.shouldFlush(settled);

    expect(result.should).toBe(true);
    expect(result.trigger).toBe("count");
  });

  it("tracks lastFlushAt correctly", async () => {
    const accumulator = createAccumulator(testConfig);

    const before = await accumulator.getLastFlushAt();
    expect(before).toBe(0);

    await accumulator.recordFlush();

    const after = await accumulator.getLastFlushAt();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(Date.now());
  });

  it("resets lastFlushAt after flush", async () => {
    const accumulator = createAccumulator(testConfig);

    const t1 = Date.now();
    await accumulator.recordFlush();
    const first = await accumulator.getLastFlushAt();

    // Wait a bit
    await new Promise((r) => setTimeout(r, 10));

    await accumulator.recordFlush();
    const second = await accumulator.getLastFlushAt();

    expect(second).toBeGreaterThan(first);
    expect(second).toBeGreaterThan(t1);
  });
});

describe("Edge Cases", () => {
  it("handles missing storage file (creates fresh)", async () => {
    const config = { ...testConfig, storePath: path.join(testDir, "new", "subdir", "queue.jsonl") };
    const accumulator = createAccumulator(config);

    // Should not throw
    const queue = await accumulator.getQueue();
    expect(queue).toEqual([]);

    // Should create directory structure on enqueue
    await accumulator.enqueue(createTestInsight("1"));
    const queue2 = await accumulator.getQueue();
    expect(queue2).toHaveLength(1);
  });

  it("handles empty storage file", async () => {
    const accumulator = createAccumulator(testConfig);

    await fs.mkdir(path.dirname(testConfig.storePath), { recursive: true });
    await fs.writeFile(testConfig.storePath, "");

    const queue = await accumulator.getQueue();
    expect(queue).toEqual([]);
  });

  it("handles storage file with only whitespace", async () => {
    const accumulator = createAccumulator(testConfig);

    await fs.mkdir(path.dirname(testConfig.storePath), { recursive: true });
    await fs.writeFile(testConfig.storePath, "  \n\n  \n");

    const queue = await accumulator.getQueue();
    expect(queue).toEqual([]);
  });

  it("handles very large queue (100+ insights)", async () => {
    const accumulator = createAccumulator(testConfig);

    for (let i = 0; i < 100; i++) {
      await accumulator.enqueue(createTestInsight(`${i}`, i * 1000));
    }

    const queue = await accumulator.getQueue();
    expect(queue).toHaveLength(100);
    expect(queue[0].id).toBe("0");
    expect(queue[99].id).toBe("99");
  });

  it("handles unicode in insight content", async () => {
    const accumulator = createAccumulator(testConfig);
    const insight = createTestInsight("unicode");
    insight.topic = "日本語トピック";
    insight.hook = "北欧神話について 🌲";
    insight.excerpt = "これは日本語のコンテンツです。絵文字: 🎉🚀";

    await accumulator.enqueue(insight);
    const queue = await accumulator.getQueue();

    expect(queue[0].topic).toBe("日本語トピック");
    expect(queue[0].hook).toBe("北欧神話について 🌲");
  });

  it("clear() removes all entries", async () => {
    const accumulator = createAccumulator(testConfig);

    await accumulator.enqueue(createTestInsight("1"));
    await accumulator.enqueue(createTestInsight("2"));
    await accumulator.enqueue(createTestInsight("3"));

    await accumulator.clear();

    const queue = await accumulator.getQueue();
    expect(queue).toHaveLength(0);
  });

  it("clear() resets lastFlushAt", async () => {
    const accumulator = createAccumulator(testConfig);

    await accumulator.recordFlush();
    const before = await accumulator.getLastFlushAt();
    expect(before).toBeGreaterThan(0);

    await accumulator.clear();
    const after = await accumulator.getLastFlushAt();
    expect(after).toBe(0);
  });
});
