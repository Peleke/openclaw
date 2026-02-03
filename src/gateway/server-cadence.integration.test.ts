/**
 * Server Cadence integration tests — full signal flow coverage.
 *
 * Tests the complete P1 pipeline signal flow:
 * obsidian.note.modified → InsightExtractor → InsightDigest → TelegramNotifier
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSignalBus, type SignalBus } from "@peleke.s/cadence";
import type { OpenClawSignal } from "../cadence/signals.js";
import { createInsightExtractorResponder } from "../cadence/responders/insight-extractor/index.js";
import { createInsightDigestResponder } from "../cadence/responders/insight-digest/index.js";
import { registerResponders } from "../cadence/responders/index.js";

// Mock telegram send
vi.mock("../telegram/send.js", () => ({
  sendMessageTelegram: vi.fn().mockResolvedValue({ messageId: 12345 }),
}));

import { sendMessageTelegram } from "../telegram/send.js";
const mockSendTelegram = sendMessageTelegram as ReturnType<typeof vi.fn>;

// Mock LLM provider
function createMockLLMProvider(responses: string[] = []) {
  let callIndex = 0;
  return {
    name: "mock-llm",
    async chat() {
      if (callIndex >= responses.length) {
        return JSON.stringify([]);
      }
      return responses[callIndex++];
    },
  };
}

// Default mock insight response
const MOCK_INSIGHT_RESPONSE = JSON.stringify([
  {
    topic: "Test Insight Topic",
    pillar: "tech",
    hook: "A compelling hook about testing",
    excerpt: "This is the excerpt from the journal entry about testing software.",
    scores: { topicClarity: 0.9, publishReady: 0.85, novelty: 0.7 },
    formats: ["thread", "post"],
  },
]);

// Test signal factory
function makeNoteModifiedSignal(
  path: string,
  content: string,
  frontmatter: Record<string, unknown> = {},
): OpenClawSignal {
  return {
    type: "obsidian.note.modified",
    id: crypto.randomUUID(),
    ts: Date.now(),
    payload: { path, content, frontmatter },
  } as OpenClawSignal;
}

function makeCronFiredSignal(jobId: string): OpenClawSignal {
  return {
    type: "cadence.cron.fired",
    id: crypto.randomUUID(),
    ts: Date.now(),
    payload: {
      jobId,
      jobName: "Test Job",
      expr: "0 21 * * *",
      firedAt: Date.now(),
    },
  } as OpenClawSignal;
}

describe("P1 Content Pipeline Integration", () => {
  let bus: SignalBus<OpenClawSignal>;
  let cleanupFns: Array<() => void>;
  let emittedSignals: OpenClawSignal[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    bus = createSignalBus<OpenClawSignal>();
    cleanupFns = [];
    emittedSignals = [];

    // Track all emitted signals
    bus.onAny(async (signal) => {
      emittedSignals.push(signal);
    });
  });

  afterEach(async () => {
    for (const cleanup of cleanupFns) {
      cleanup();
    }
    vi.useRealTimers();
  });

  describe("note modified → insight extracted", () => {
    it("emits journal.insight.extracted when ::publish note is modified", async () => {
      const mockLLM = createMockLLMProvider([MOCK_INSIGHT_RESPONSE]);

      const extractor = createInsightExtractorResponder({
        config: {
          pillars: [{ id: "tech", name: "Technology", keywords: [] }],
          magicString: "::publish",
          minContentLength: 10,
          debounceMs: 100,
          maxBatchSize: 5,
          minBatchDelayMs: 50,
        },
        llm: mockLLM,
      });

      cleanupFns.push(extractor.register(bus));

      // Emit note modified with ::publish
      const content = "::publish\n\nThis is test content that should be extracted for insights.";
      await bus.emit(makeNoteModifiedSignal("/vault/test.md", content));

      // Advance timers past debounce
      await vi.advanceTimersByTimeAsync(200);

      // Check for extracted signal
      const extractedSignals = emittedSignals.filter((s) => s.type === "journal.insight.extracted");
      expect(extractedSignals.length).toBe(1);
      expect(extractedSignals[0].payload.insights).toHaveLength(1);
      expect(extractedSignals[0].payload.insights[0].topic).toBe("Test Insight Topic");
    });

    it("includes source path and content hash in extracted signal", async () => {
      const mockLLM = createMockLLMProvider([MOCK_INSIGHT_RESPONSE]);

      const extractor = createInsightExtractorResponder({
        config: {
          pillars: [],
          magicString: "::publish",
          minContentLength: 10,
          debounceMs: 50,
          maxBatchSize: 5,
          minBatchDelayMs: 10,
        },
        llm: mockLLM,
      });

      cleanupFns.push(extractor.register(bus));

      const content = "::publish\n\nTest content for hashing.";
      await bus.emit(makeNoteModifiedSignal("/vault/my-note.md", content));

      await vi.advanceTimersByTimeAsync(100);

      const extractedSignals = emittedSignals.filter((s) => s.type === "journal.insight.extracted");
      expect(extractedSignals.length).toBe(1);
      expect(extractedSignals[0].payload.source.path).toBe("/vault/my-note.md");
      expect(extractedSignals[0].payload.source.contentHash).toMatch(/^[a-f0-9]{16}$/);
    });

    it("skips notes without ::publish magic string", async () => {
      const mockLLM = createMockLLMProvider([MOCK_INSIGHT_RESPONSE]);

      const extractor = createInsightExtractorResponder({
        config: {
          pillars: [],
          magicString: "::publish",
          minContentLength: 10,
          debounceMs: 50,
          maxBatchSize: 5,
          minBatchDelayMs: 10,
        },
        llm: mockLLM,
      });

      cleanupFns.push(extractor.register(bus));

      // Note without ::publish
      const content = "# Regular Note\n\nThis is just a regular note without the publish marker.";
      await bus.emit(makeNoteModifiedSignal("/vault/regular.md", content));

      await vi.advanceTimersByTimeAsync(100);

      const extractedSignals = emittedSignals.filter((s) => s.type === "journal.insight.extracted");
      expect(extractedSignals.length).toBe(0);
    });

    it("skips _cadence-* test files", async () => {
      const mockLLM = createMockLLMProvider([MOCK_INSIGHT_RESPONSE]);

      const extractor = createInsightExtractorResponder({
        config: {
          pillars: [],
          magicString: "::publish",
          minContentLength: 10,
          debounceMs: 50,
          maxBatchSize: 5,
          minBatchDelayMs: 10,
        },
        llm: mockLLM,
      });

      cleanupFns.push(extractor.register(bus));

      const content = "::publish\n\nTest content.";
      await bus.emit(makeNoteModifiedSignal("/vault/_cadence-smoke-test.md", content));

      await vi.advanceTimersByTimeAsync(100);

      const extractedSignals = emittedSignals.filter((s) => s.type === "journal.insight.extracted");
      expect(extractedSignals.length).toBe(0);
    });
  });

  describe("insight extracted → digest ready", () => {
    it("emits journal.digest.ready when count threshold met", async () => {
      const digest = createInsightDigestResponder({
        config: {
          minInsightsToFlush: 2,
          maxHoursBetweenFlushes: 24,
          cooldownHours: 0, // No cooldown for testing
          quietHoursStart: "00:00",
          quietHoursEnd: "00:00",
          checkIntervalMs: 100,
        },
      });

      cleanupFns.push(digest.register(bus));

      // Emit 2 insight signals (meets threshold)
      for (let i = 0; i < 2; i++) {
        await bus.emit({
          type: "journal.insight.extracted",
          id: crypto.randomUUID(),
          ts: Date.now(),
          payload: {
            source: {
              signalType: "test",
              signalId: `s${i}`,
              path: `/test${i}.md`,
              contentHash: "abc123",
            },
            insights: [
              {
                id: crypto.randomUUID(),
                topic: `Test Topic ${i}`,
                hook: `Hook ${i}`,
                excerpt: `Excerpt ${i}`,
                scores: { topicClarity: 0.8, publishReady: 0.7, novelty: 0.6 },
                formats: ["post"],
              },
            ],
            extractedAt: Date.now(),
            extractorVersion: "test",
          },
        } as OpenClawSignal);
      }

      // Wait for scheduler to check
      await vi.advanceTimersByTimeAsync(200);

      const digestSignals = emittedSignals.filter((s) => s.type === "journal.digest.ready");
      expect(digestSignals.length).toBe(1);
      expect(digestSignals[0].payload.trigger).toBe("count");
      expect(digestSignals[0].payload.insights.length).toBe(2);
    });

    it("dequeues flushed insights after digest", async () => {
      let flushCount = 0;

      const digest = createInsightDigestResponder({
        config: {
          minInsightsToFlush: 1,
          maxHoursBetweenFlushes: 24,
          cooldownHours: 0,
          quietHoursStart: "00:00",
          quietHoursEnd: "00:00",
          checkIntervalMs: 100,
        },
        onFlush: async () => {
          flushCount++;
        },
      });

      cleanupFns.push(digest.register(bus));

      // First insight
      await bus.emit({
        type: "journal.insight.extracted",
        id: crypto.randomUUID(),
        ts: Date.now(),
        payload: {
          source: { signalType: "test", signalId: "s1", path: "/test1.md", contentHash: "abc" },
          insights: [
            {
              id: "insight-1",
              topic: "First Topic",
              hook: "Hook 1",
              excerpt: "Excerpt 1",
              scores: { topicClarity: 0.8, publishReady: 0.7, novelty: 0.6 },
              formats: ["post"],
            },
          ],
          extractedAt: Date.now(),
          extractorVersion: "test",
        },
      } as OpenClawSignal);

      await vi.advanceTimersByTimeAsync(200);
      expect(flushCount).toBe(1);

      // Second insight (should be in a NEW digest, not combined with first)
      await bus.emit({
        type: "journal.insight.extracted",
        id: crypto.randomUUID(),
        ts: Date.now(),
        payload: {
          source: { signalType: "test", signalId: "s2", path: "/test2.md", contentHash: "def" },
          insights: [
            {
              id: "insight-2",
              topic: "Second Topic",
              hook: "Hook 2",
              excerpt: "Excerpt 2",
              scores: { topicClarity: 0.8, publishReady: 0.7, novelty: 0.6 },
              formats: ["post"],
            },
          ],
          extractedAt: Date.now(),
          extractorVersion: "test",
        },
      } as OpenClawSignal);

      await vi.advanceTimersByTimeAsync(200);
      expect(flushCount).toBe(2);

      // Check that second digest only has the second insight
      const digestSignals = emittedSignals.filter((s) => s.type === "journal.digest.ready");
      expect(digestSignals.length).toBe(2);
      expect(digestSignals[1].payload.insights.length).toBe(1);
      expect(digestSignals[1].payload.insights[0].id).toBe("insight-2");
    });
  });

  describe("cron-triggered flush", () => {
    it("flushes all queued insights when matching cron job fires", async () => {
      const digest = createInsightDigestResponder({
        config: {
          minInsightsToFlush: 10, // High threshold - won't auto-flush
          maxHoursBetweenFlushes: 24,
          cooldownHours: 0,
          quietHoursStart: "00:00",
          quietHoursEnd: "00:00",
          checkIntervalMs: 100,
        },
        cronTriggerJobIds: ["nightly-digest"],
      });

      cleanupFns.push(digest.register(bus));

      // Queue 2 insights (under threshold)
      for (let i = 0; i < 2; i++) {
        await bus.emit({
          type: "journal.insight.extracted",
          id: crypto.randomUUID(),
          ts: Date.now(),
          payload: {
            source: {
              signalType: "test",
              signalId: `s${i}`,
              path: `/test${i}.md`,
              contentHash: "abc",
            },
            insights: [
              {
                id: crypto.randomUUID(),
                topic: `Topic ${i}`,
                hook: `Hook ${i}`,
                excerpt: `Excerpt ${i}`,
                scores: { topicClarity: 0.8, publishReady: 0.7, novelty: 0.6 },
                formats: ["post"],
              },
            ],
            extractedAt: Date.now(),
            extractorVersion: "test",
          },
        } as OpenClawSignal);
      }

      await vi.advanceTimersByTimeAsync(100);

      // No digest yet (under threshold)
      let digestSignals = emittedSignals.filter((s) => s.type === "journal.digest.ready");
      expect(digestSignals.length).toBe(0);

      // Fire cron
      await bus.emit(makeCronFiredSignal("nightly-digest"));
      await vi.advanceTimersByTimeAsync(50);

      // Now should have digest
      digestSignals = emittedSignals.filter((s) => s.type === "journal.digest.ready");
      expect(digestSignals.length).toBe(1);
      expect(digestSignals[0].payload.trigger).toBe("time");
      expect(digestSignals[0].payload.insights.length).toBe(2);
    });

    it("ignores cron signals with non-matching jobId", async () => {
      const digest = createInsightDigestResponder({
        config: {
          minInsightsToFlush: 10,
          maxHoursBetweenFlushes: 24,
          cooldownHours: 0,
          quietHoursStart: "00:00",
          quietHoursEnd: "00:00",
          checkIntervalMs: 100,
        },
        cronTriggerJobIds: ["nightly-digest"],
      });

      cleanupFns.push(digest.register(bus));

      // Queue an insight
      await bus.emit({
        type: "journal.insight.extracted",
        id: crypto.randomUUID(),
        ts: Date.now(),
        payload: {
          source: { signalType: "test", signalId: "s1", path: "/test.md", contentHash: "abc" },
          insights: [
            {
              id: crypto.randomUUID(),
              topic: "Topic",
              hook: "Hook",
              excerpt: "Excerpt",
              scores: { topicClarity: 0.8, publishReady: 0.7, novelty: 0.6 },
              formats: ["post"],
            },
          ],
          extractedAt: Date.now(),
          extractorVersion: "test",
        },
      } as OpenClawSignal);

      await vi.advanceTimersByTimeAsync(100);

      // Fire wrong cron job
      await bus.emit(makeCronFiredSignal("wrong-job-id"));
      await vi.advanceTimersByTimeAsync(50);

      // No digest
      const digestSignals = emittedSignals.filter((s) => s.type === "journal.digest.ready");
      expect(digestSignals.length).toBe(0);
    });
  });

  describe("full pipeline: note → extractor → digest", () => {
    it("processes note through full extraction and digest pipeline", async () => {
      const mockLLM = createMockLLMProvider([MOCK_INSIGHT_RESPONSE]);

      // Set up extractor
      const extractor = createInsightExtractorResponder({
        config: {
          pillars: [{ id: "tech", name: "Technology", keywords: [] }],
          magicString: "::publish",
          minContentLength: 10,
          debounceMs: 50,
          maxBatchSize: 5,
          minBatchDelayMs: 10,
        },
        llm: mockLLM,
      });

      // Set up digest with low threshold
      const digest = createInsightDigestResponder({
        config: {
          minInsightsToFlush: 1,
          maxHoursBetweenFlushes: 24,
          cooldownHours: 0,
          quietHoursStart: "00:00",
          quietHoursEnd: "00:00",
          checkIntervalMs: 100,
        },
      });

      cleanupFns.push(extractor.register(bus));
      cleanupFns.push(digest.register(bus));

      // Emit note modified
      const content =
        "::publish\n\nThis is a journal entry about software testing that should be extracted.";
      await bus.emit(makeNoteModifiedSignal("/vault/journal/2024-01-01.md", content));

      // Wait for extraction + digest
      await vi.advanceTimersByTimeAsync(500);

      // Should have both signals
      const extractedSignals = emittedSignals.filter((s) => s.type === "journal.insight.extracted");
      const digestSignals = emittedSignals.filter((s) => s.type === "journal.digest.ready");

      expect(extractedSignals.length).toBe(1);
      expect(digestSignals.length).toBe(1);

      // Digest should contain the extracted insight
      expect(digestSignals[0].payload.insights[0].topic).toBe("Test Insight Topic");
      expect(digestSignals[0].payload.insights[0].sourcePath).toBe("/vault/journal/2024-01-01.md");
    });
  });
});
