/**
 * Integration test: full Cadence signal chain.
 *
 * Verifies: cron → GitHub watcher → file write with ::linkedin
 *         → obsidian.note.modified → LinWheel publisher → linwheel.drafts.generated
 *
 * Uses a real SignalBus with mock external clients (GitHub, LLM, LinWheel SDK).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LinWheel } from "@linwheel/sdk";
import { createSignalBus, type SignalBus } from "@peleke.s/cadence";
import type { OpenClawSignal } from "../signals.js";
import type { LLMProvider, ChatMessage, ChatResponse } from "../llm/types.js";
import type {
  GitHubClient,
  GitHubRepo,
  GitHubPR,
  BuildlogEntry,
  FileWriter,
  WatcherClock,
} from "./github-watcher/types.js";
import { createGitHubWatcherResponder } from "./github-watcher/index.js";
import { createLinWheelPublisherResponder } from "./linwheel-publisher/index.js";
import { createTelegramNotifierResponder } from "./telegram-notifier.js";

// Mock telegram send to avoid real API calls
vi.mock("../../telegram/send.js", () => ({
  sendMessageTelegram: vi.fn().mockResolvedValue({ messageId: "test-msg-1" }),
}));

// --- Mock factories ---

function mockGhClient(): GitHubClient {
  return {
    listRepos: vi.fn<[string], Promise<GitHubRepo[]>>().mockResolvedValue([
      {
        name: "openclaw",
        fullName: "Peleke/openclaw",
        archived: false,
        fork: false,
        pushedAt: "2026-03-14T10:00:00Z",
      },
    ]),
    getMergedPRsForDate: vi.fn<[string, string], Promise<GitHubPR[]>>().mockResolvedValue([
      {
        number: 105,
        title: "fix: cadence pipeline",
        url: "https://github.com/Peleke/openclaw/pull/105",
        body: "Fix the pipeline",
        mergedAt: "2026-03-14T18:00:00Z",
        createdAt: "2026-03-14T12:00:00Z",
      },
    ]),
    getOpenPRs: vi.fn<[string, string], Promise<GitHubPR[]>>().mockResolvedValue([]),
    hasBuildlogDir: vi.fn<[string], Promise<boolean>>().mockResolvedValue(false),
    getRecentBuildlogEntries: vi
      .fn<[string, number], Promise<BuildlogEntry[]>>()
      .mockResolvedValue([]),
  };
}

function mockLlm(): LLMProvider {
  return {
    name: "mock-llm",
    chat: vi.fn<[ChatMessage[]], Promise<ChatResponse>>().mockResolvedValue({
      text: "Today I shipped a critical fix for the Cadence pipeline, wiring the LinWheel publisher into the dogfood script so ::linkedin tags finally produce drafts.",
      model: "test-model",
    }),
  };
}

function mockLinWheelClient(): LinWheel {
  return {
    analyze: vi.fn().mockResolvedValue({
      linkedinFit: { score: 9 },
      suggestedAngles: [{ angle: "field_note" }],
    }),
    reshape: vi.fn().mockResolvedValue({
      posts: [{ text: "Draft post about Cadence fix", postId: "p1" }],
    }),
  } as unknown as LinWheel;
}

function mockWriter(): FileWriter {
  let writtenContent = "";
  return {
    exists: vi.fn<[string], Promise<boolean>>().mockResolvedValue(false),
    write: vi.fn<[string, string], Promise<void>>().mockImplementation(async (_path, content) => {
      writtenContent = content;
    }),
    // Helper to access written content in tests
    get lastContent() {
      return writtenContent;
    },
  };
}

function mockClock(date = "2026-03-14"): WatcherClock {
  return { today: () => date };
}

// --- Tests ---

describe("Cadence pipeline integration: GH watcher → LinWheel", () => {
  let bus: SignalBus<OpenClawSignal>;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = createSignalBus<OpenClawSignal>();
  });

  it("full chain: cron → GH watcher → ::linkedin file → LinWheel drafts", async () => {
    const ghClient = mockGhClient();
    const llm = mockLlm();
    const writer = mockWriter();
    const linwheelClient = mockLinWheelClient();

    // Register GitHub watcher
    const ghWatcher = createGitHubWatcherResponder({
      llm,
      ghClient,
      writer,
      clock: mockClock(),
      vaultPath: "/workspace-obsidian",
      config: {
        owner: "Peleke",
        scanTime: "21:00",
        outputDir: "Buildlog",
        maxBuildlogEntries: 3,
        excludeRepos: [],
      },
    });
    const unsubGh = ghWatcher.register(bus);

    // Register LinWheel publisher (with short debounce for test)
    const linwheelPublisher = createLinWheelPublisherResponder({
      client: linwheelClient,
      config: { debounceMs: 100 },
    });
    const unsubLw = linwheelPublisher.register(bus);

    // Collect emitted signals
    const synthSignals: OpenClawSignal[] = [];
    const draftSignals: OpenClawSignal[] = [];
    bus.on("github.synthesis.written", (s) => {
      synthSignals.push(s);
    });
    bus.on("linwheel.drafts.generated", (s) => {
      draftSignals.push(s);
    });

    // Step 1: Fire the cron trigger
    await bus.emit({
      type: "cadence.cron.fired",
      id: "cron-1",
      ts: Date.now(),
      payload: {
        jobId: "github-watcher",
        jobName: "GitHub Watcher",
        expr: "0 21 * * *",
        firedAt: Date.now(),
      },
    });

    // Wait for async GH scan + LLM synthesis
    await vi.advanceTimersByTimeAsync(100);

    // Verify GH watcher wrote the file
    expect(writer.write).toHaveBeenCalledTimes(1);
    const writePath = (writer.write as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(writePath).toContain("2026-03-14-github-synthesis.md");

    const writeContent = (writer.write as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(writeContent.startsWith("::linkedin\n\n")).toBe(true);

    // Verify synthesis signal was emitted
    expect(synthSignals).toHaveLength(1);
    expect(synthSignals[0].payload.linkedinReady).toBe(true);

    // Step 2: Simulate obsidian watcher detecting the new file
    // (In production, chokidar detects the write and emits this signal)
    await bus.emit({
      type: "obsidian.note.modified",
      id: "note-1",
      ts: Date.now(),
      payload: {
        path: writePath,
        content: writeContent,
        frontmatter: {},
      },
    } as OpenClawSignal);

    // Advance past debounce
    vi.advanceTimersByTime(200);
    await vi.advanceTimersByTimeAsync(0);

    // Verify LinWheel processed the ::linkedin file
    expect(linwheelClient.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("shipped a critical fix") }),
    );
    expect(linwheelClient.reshape).toHaveBeenCalled();

    // Verify drafts signal
    expect(draftSignals).toHaveLength(1);
    expect(draftSignals[0].payload.postsCreated).toBe(1);

    unsubGh();
    unsubLw();
  });

  it("GH watcher emits github.synthesis.written → Telegram notifier fires", async () => {
    const ghClient = mockGhClient();
    const llm = mockLlm();
    const writer = mockWriter();

    // Register GitHub watcher
    const ghWatcher = createGitHubWatcherResponder({
      llm,
      ghClient,
      writer,
      clock: mockClock(),
      vaultPath: "/workspace-obsidian",
    });
    const unsubGh = ghWatcher.register(bus);

    // Register Telegram notifier
    const telegramNotifier = createTelegramNotifierResponder({
      telegramChatId: "123456",
      deliverDigests: true,
    });
    const unsubTg = telegramNotifier.register(bus);

    // Fire cron
    await bus.emit({
      type: "cadence.cron.fired",
      id: "cron-2",
      ts: Date.now(),
      payload: {
        jobId: "github-watcher",
        jobName: "GitHub Watcher",
        expr: "0 21 * * *",
        firedAt: Date.now(),
      },
    });

    await vi.advanceTimersByTimeAsync(100);

    // Telegram should have been called for the synthesis
    const { sendMessageTelegram } = await import("../../telegram/send.js");
    expect(sendMessageTelegram).toHaveBeenCalled();

    unsubGh();
    unsubTg();
  });

  it("dedup: second cron fire skips when synthesis already exists", async () => {
    const ghClient = mockGhClient();
    const llm = mockLlm();
    const writer = mockWriter();

    // First call: file doesn't exist. After write, it does.
    (writer.exists as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const ghWatcher = createGitHubWatcherResponder({
      llm,
      ghClient,
      writer,
      clock: mockClock(),
      vaultPath: "/workspace-obsidian",
    });
    const unsub = ghWatcher.register(bus);

    const cronPayload = {
      type: "cadence.cron.fired" as const,
      id: "cron-3",
      ts: Date.now(),
      payload: {
        jobId: "github-watcher",
        jobName: "GH Watcher",
        expr: "0 21 * * *",
        firedAt: Date.now(),
      },
    };

    // First fire: writes
    await bus.emit(cronPayload);
    await vi.advanceTimersByTimeAsync(100);
    expect(writer.write).toHaveBeenCalledTimes(1);

    // Second fire: skips (dedup)
    await bus.emit({ ...cronPayload, id: "cron-4" });
    await vi.advanceTimersByTimeAsync(100);
    expect(writer.write).toHaveBeenCalledTimes(1); // Still 1

    unsub();
  });
});
