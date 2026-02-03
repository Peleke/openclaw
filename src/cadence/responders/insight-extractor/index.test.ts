/**
 * Insight Extractor responder integration tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSignalBus } from "../../signal-bus.js";
import type { OpenClawSignal } from "../../signals.js";
import { createInsightExtractorResponder, type LLMProvider } from "./index.js";
import type { ExtractorConfig, PillarConfig } from "./types.js";

const testPillars: PillarConfig[] = [
  { id: "norse", name: "Norse Studies", keywords: ["viking", "mythology"] },
  { id: "tech", name: "Technical", keywords: ["code", "software"] },
];

const baseConfig: Partial<ExtractorConfig> = {
  pillars: testPillars,
  magicString: "::publish",
  minContentLength: 20,
  debounceMs: 100,
  maxBatchSize: 5,
  minBatchDelayMs: 50,
};

function createMockLLM(): LLMProvider & { chatMock: ReturnType<typeof vi.fn> } {
  const chatMock = vi.fn().mockResolvedValue("[]");
  return {
    chatMock,
    chat: chatMock,
  };
}

function createNoteSignal(
  path: string,
  content: string,
  frontmatter?: Record<string, unknown>,
): OpenClawSignal {
  return {
    type: "obsidian.note.modified",
    id: `sig-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
    payload: {
      path,
      content,
      frontmatter,
    },
  };
}

function createLLMResponse(
  insights: Array<{
    topic: string;
    pillar?: string | null;
    hook: string;
    excerpt: string;
  }>,
): string {
  return JSON.stringify(
    insights.map((i) => ({
      topic: i.topic,
      pillar: i.pillar ?? null,
      hook: i.hook,
      excerpt: i.excerpt,
      scores: { topicClarity: 0.8, publishReady: 0.7, novelty: 0.9 },
      formats: ["thread", "post"],
    })),
  );
}

describe("Signal Subscription", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes to obsidian.note.modified", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();

    llm.chatMock.mockResolvedValue(
      createLLMResponse([{ topic: "Test Topic", hook: "Hook", excerpt: "Excerpt" }]),
    );

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    const unsub = responder.register(bus);

    await bus.emit(
      createNoteSignal(
        "/vault/journal.md",
        "::publish\n\nThis is test content that is long enough to pass",
      ),
    );

    // Wait for debounce
    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 50);

    expect(llm.chatMock).toHaveBeenCalled();
    unsub();
  });

  it("skips content without magic string", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    responder.register(bus);

    await bus.emit(
      createNoteSignal(
        "/vault/journal.md",
        "This is content without the magic string and should be skipped",
      ),
    );

    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 50);

    expect(llm.chatMock).not.toHaveBeenCalled();
  });

  it("skips _cadence-* test files", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    responder.register(bus);

    await bus.emit(
      createNoteSignal(
        "/vault/_cadence-smoke-test.md",
        "::publish\n\nThis content has the magic string but path should be skipped",
      ),
    );

    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 50);

    expect(llm.chatMock).not.toHaveBeenCalled();
  });

  it("skips content below minimum length", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    responder.register(bus);

    await bus.emit(createNoteSignal("/vault/journal.md", "::publish\n\nShort"));

    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 50);

    expect(llm.chatMock).not.toHaveBeenCalled();
  });
});

describe("Debouncing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces rapid changes to same file", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();

    llm.chatMock.mockResolvedValue(
      createLLMResponse([{ topic: "Final Topic", hook: "Hook", excerpt: "Excerpt" }]),
    );

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    responder.register(bus);

    // Rapid changes
    await bus.emit(
      createNoteSignal("/vault/journal.md", "::publish\n\nFirst version of content here"),
    );
    await vi.advanceTimersByTimeAsync(30);
    await bus.emit(
      createNoteSignal("/vault/journal.md", "::publish\n\nSecond version of content here"),
    );
    await vi.advanceTimersByTimeAsync(30);
    await bus.emit(
      createNoteSignal("/vault/journal.md", "::publish\n\nThird and final version of content here"),
    );

    // Wait for debounce
    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 50);

    // Should only call LLM once with final content
    expect(llm.chatMock).toHaveBeenCalledTimes(1);
    expect(llm.chatMock.mock.calls[0][0][1].content).toContain("Third and final");
  });

  it("processes different files independently", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();

    llm.chatMock.mockResolvedValue(
      createLLMResponse([{ topic: "Topic", hook: "Hook", excerpt: "Excerpt" }]),
    );

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    responder.register(bus);

    await bus.emit(createNoteSignal("/vault/file1.md", "::publish\n\nContent for file one here"));
    await bus.emit(createNoteSignal("/vault/file2.md", "::publish\n\nContent for file two here"));

    // Wait for debounce + batch
    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + baseConfig.minBatchDelayMs! + 100);

    // Should process both files
    expect(llm.chatMock).toHaveBeenCalledTimes(2);
  });
});

describe("Signal Emission", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits journal.insight.extracted signal", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();
    const extractedHandler = vi.fn();

    llm.chatMock.mockResolvedValue(
      createLLMResponse([
        {
          topic: "Viking Navigation",
          pillar: "norse",
          hook: "Vikings sailed without GPS",
          excerpt: "Using sun stones...",
        },
      ]),
    );

    bus.subscribe("journal.insight.extracted", extractedHandler);

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    responder.register(bus);

    await bus.emit(
      createNoteSignal(
        "/vault/journal.md",
        "::publish\n\nToday I learned about Viking navigation techniques",
      ),
    );

    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 100);

    expect(extractedHandler).toHaveBeenCalledTimes(1);

    const signal = extractedHandler.mock.calls[0][0];
    expect(signal.type).toBe("journal.insight.extracted");
    expect(signal.payload.insights).toHaveLength(1);
    expect(signal.payload.insights[0].topic).toBe("Viking Navigation");
    expect(signal.payload.insights[0].pillar).toBe("norse");
  });

  it("includes source information in signal", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();
    const extractedHandler = vi.fn();

    llm.chatMock.mockResolvedValue(
      createLLMResponse([{ topic: "Test", hook: "Hook", excerpt: "Excerpt" }]),
    );

    bus.subscribe("journal.insight.extracted", extractedHandler);

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
      hashContent: () => "test-hash-123",
    });

    responder.register(bus);

    await bus.emit(
      createNoteSignal(
        "/vault/my-journal.md",
        "::publish\n\nContent for testing source info tracking",
      ),
    );

    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 100);

    const signal = extractedHandler.mock.calls[0][0];
    expect(signal.payload.source.path).toBe("/vault/my-journal.md");
    expect(signal.payload.source.contentHash).toBe("test-hash-123");
    expect(signal.payload.source.signalType).toBe("obsidian.note.modified");
  });

  it("does not emit signal when no insights extracted", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();
    const extractedHandler = vi.fn();

    llm.chatMock.mockResolvedValue("[]"); // No insights

    bus.subscribe("journal.insight.extracted", extractedHandler);

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    responder.register(bus);

    await bus.emit(
      createNoteSignal(
        "/vault/journal.md",
        "::publish\n\nContent that yields no insights from LLM",
      ),
    );

    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 100);

    expect(extractedHandler).not.toHaveBeenCalled();
  });
});

describe("Pillar Hints", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes pillar hint from frontmatter to LLM", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();

    llm.chatMock.mockResolvedValue(
      createLLMResponse([{ topic: "Test", hook: "Hook", excerpt: "Excerpt" }]),
    );

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    responder.register(bus);

    await bus.emit(
      createNoteSignal("/vault/journal.md", "::publish\n\nContent about Norse mythology here", {
        pillar: "norse",
        title: "My Note",
      }),
    );

    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 100);

    const userPrompt = llm.chatMock.mock.calls[0][0][1].content;
    expect(userPrompt).toContain("norse");
    expect(userPrompt).toContain("hint");
  });
});

describe("Error Handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("continues on LLM error", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();

    llm.chatMock
      .mockRejectedValueOnce(new Error("LLM API error"))
      .mockResolvedValueOnce(
        createLLMResponse([{ topic: "Success", hook: "Hook", excerpt: "Excerpt" }]),
      );

    const extractedHandler = vi.fn();
    bus.subscribe("journal.insight.extracted", extractedHandler);

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    responder.register(bus);

    // First file will fail
    await bus.emit(createNoteSignal("/vault/file1.md", "::publish\n\nContent for file one here"));
    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 100);

    // Second file should still work
    await bus.emit(createNoteSignal("/vault/file2.md", "::publish\n\nContent for file two here"));
    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 100);

    expect(extractedHandler).toHaveBeenCalledTimes(1);
  });

  it("handles malformed LLM response", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();

    llm.chatMock.mockResolvedValue("This is not valid JSON at all");

    const extractedHandler = vi.fn();
    bus.subscribe("journal.insight.extracted", extractedHandler);

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    responder.register(bus);

    await bus.emit(
      createNoteSignal("/vault/journal.md", "::publish\n\nContent that gets malformed response"),
    );

    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 100);

    // Should not emit signal for malformed response
    expect(extractedHandler).not.toHaveBeenCalled();
  });
});

describe("Cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("unsubscriber stops signal subscription", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    const unsub = responder.register(bus);

    // Emit before unsubscribe
    await bus.emit(
      createNoteSignal("/vault/journal.md", "::publish\n\nContent before unsubscribe"),
    );

    // Unsubscribe before debounce completes
    unsub();

    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 100);

    // Should not have called LLM (debounce was cleared)
    expect(llm.chatMock).not.toHaveBeenCalled();
  });

  it("clears pending debounces on unsubscribe", async () => {
    const bus = createSignalBus<OpenClawSignal>();
    const llm = createMockLLM();

    const responder = createInsightExtractorResponder({
      config: baseConfig,
      llm,
    });

    const unsub = responder.register(bus);

    // Queue multiple files
    await bus.emit(createNoteSignal("/vault/file1.md", "::publish\n\nContent one here"));
    await bus.emit(createNoteSignal("/vault/file2.md", "::publish\n\nContent two here"));
    await bus.emit(createNoteSignal("/vault/file3.md", "::publish\n\nContent three here"));

    // Unsubscribe
    unsub();

    await vi.advanceTimersByTimeAsync(baseConfig.debounceMs! + 100);

    // Nothing should have been processed
    expect(llm.chatMock).not.toHaveBeenCalled();
  });
});
