/**
 * Pipeline builder tests — single source of truth for P1 responder/source creation.
 *
 * Tests buildCadencePipeline() and createLinWheelClientFromEnv() which
 * are shared by both the gateway (server-cadence.ts) and dogfood script
 * (scripts/cadence.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all responder/source factories
vi.mock("./responders/insight-extractor/index.js", () => ({
  createInsightExtractorResponder: vi.fn().mockReturnValue({ name: "insight-extractor" }),
}));
vi.mock("./responders/insight-digest/index.js", () => ({
  createInsightDigestResponder: vi.fn().mockReturnValue({ name: "insight-digest" }),
}));
vi.mock("./responders/telegram-notifier.js", () => ({
  createTelegramNotifierResponder: vi.fn().mockReturnValue({ name: "telegram-notifier" }),
}));
vi.mock("./responders/linwheel-publisher/index.js", () => ({
  createLinWheelPublisherResponder: vi.fn().mockReturnValue({ name: "linwheel-publisher" }),
}));
vi.mock("./responders/github-watcher/index.js", () => ({
  createGitHubWatcherResponder: vi.fn().mockReturnValue({ name: "github-watcher" }),
}));
vi.mock("./responders/runlist/index.js", () => ({
  createRunlistResponder: vi.fn().mockReturnValue({ name: "runlist" }),
}));
vi.mock("./sources/cron-bridge.js", () => ({
  createCronBridge: vi.fn().mockReturnValue({ name: "cron-bridge" }),
}));
vi.mock("./config.js", () => ({
  getScheduledJobs: vi
    .fn()
    .mockReturnValue([{ id: "nightly", name: "Nightly", expr: "0 21 * * *" }]),
}));
vi.mock("@linwheel/sdk", () => {
  function MockLinWheel(this: Record<string, unknown>, opts: Record<string, unknown>) {
    Object.assign(this, opts);
  }
  return { LinWheel: MockLinWheel };
});

import { buildCadencePipeline, createLinWheelClientFromEnv } from "./pipeline-builder.js";
import { createInsightExtractorResponder } from "./responders/insight-extractor/index.js";
import { createInsightDigestResponder } from "./responders/insight-digest/index.js";
import { createTelegramNotifierResponder } from "./responders/telegram-notifier.js";
import { createLinWheelPublisherResponder } from "./responders/linwheel-publisher/index.js";
import { createGitHubWatcherResponder } from "./responders/github-watcher/index.js";
import { createRunlistResponder } from "./responders/runlist/index.js";
import { createCronBridge } from "./sources/cron-bridge.js";
import { getScheduledJobs } from "./config.js";

const mockGetScheduledJobs = getScheduledJobs as ReturnType<typeof vi.fn>;

function createConfig(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    vaultPath: "/workspace-obsidian",
    delivery: { channel: "telegram", telegramChatId: "123456" },
    pillars: [
      { id: "tech", name: "Tech", keywords: ["code"] },
      { id: "life", name: "Life" },
    ],
    llm: { provider: "anthropic", model: "claude-haiku" },
    extraction: { publishTag: "::publish" },
    digest: {
      minToFlush: 3,
      maxHoursBetween: 24,
      cooldownHours: 2,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    },
    schedule: {
      enabled: true,
      nightlyDigest: "21:00",
      morningStandup: "08:00",
      timezone: "America/New_York",
    },
    ...overrides,
  };
}

const mockLlm = { name: "mock-llm", chat: vi.fn() };

describe("buildCadencePipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScheduledJobs.mockReturnValue([
      { id: "nightly-digest", name: "Nightly", expr: "0 21 * * *" },
    ]);
  });

  afterEach(() => {
    // Clean up env vars
    delete process.env.LINWHEEL_API_KEY;
  });

  describe("always-created responders", () => {
    it("creates InsightExtractor with normalized pillars", () => {
      const config = createConfig();
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createInsightExtractorResponder).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            pillars: [
              { id: "tech", name: "Tech", keywords: ["code"] },
              { id: "life", name: "Life", keywords: [] },
            ],
          }),
          llm: mockLlm,
        }),
      );
    });

    it("creates InsightDigest with config-driven cronTriggerJobIds", () => {
      const config = createConfig();
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createInsightDigestResponder).toHaveBeenCalledWith(
        expect.objectContaining({
          cronTriggerJobIds: ["nightly-digest", "morning-standup"],
        }),
      );
    });

    it("includes extraCronTriggerJobIds when provided", () => {
      const config = createConfig();
      buildCadencePipeline({
        config: config as any,
        llmProvider: mockLlm as any,
        extraCronTriggerJobIds: ["manual-trigger"],
      });

      expect(createInsightDigestResponder).toHaveBeenCalledWith(
        expect.objectContaining({
          cronTriggerJobIds: ["manual-trigger", "nightly-digest", "morning-standup"],
        }),
      );
    });

    it("skips schedule job IDs when schedule is disabled", () => {
      const config = createConfig({ schedule: { enabled: false } });
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createInsightDigestResponder).toHaveBeenCalledWith(
        expect.objectContaining({
          cronTriggerJobIds: [],
        }),
      );
    });
  });

  describe("Telegram notifier", () => {
    it("creates when channel is telegram and chatId is set", () => {
      const config = createConfig();
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createTelegramNotifierResponder).toHaveBeenCalledWith({
        telegramChatId: "123456",
        deliverDigests: true,
        notifyOnFileChange: false,
      });
    });

    it("skips when channel is log", () => {
      const config = createConfig({ delivery: { channel: "log" } });
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createTelegramNotifierResponder).not.toHaveBeenCalled();
    });

    it("skips when telegram has no chatId", () => {
      const config = createConfig({ delivery: { channel: "telegram" } });
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createTelegramNotifierResponder).not.toHaveBeenCalled();
    });
  });

  describe("LinWheel publisher", () => {
    it("creates when LINWHEEL_API_KEY is set", () => {
      process.env.LINWHEEL_API_KEY = "lw_sk_test";
      const config = createConfig();
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createLinWheelPublisherResponder).toHaveBeenCalled();
    });

    it("skips when LINWHEEL_API_KEY is not set", () => {
      delete process.env.LINWHEEL_API_KEY;
      const config = createConfig();
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createLinWheelPublisherResponder).not.toHaveBeenCalled();
    });

    it("skips when LINWHEEL_API_KEY is empty", () => {
      process.env.LINWHEEL_API_KEY = "";
      const config = createConfig();
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createLinWheelPublisherResponder).not.toHaveBeenCalled();
    });

    it("skips when LINWHEEL_API_KEY is whitespace", () => {
      process.env.LINWHEEL_API_KEY = "   ";
      const config = createConfig();
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createLinWheelPublisherResponder).not.toHaveBeenCalled();
    });
  });

  describe("GitHub watcher", () => {
    it("creates when githubWatcher.enabled is true", () => {
      const config = createConfig({ githubWatcher: { enabled: true, owner: "TestOrg" } });
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createGitHubWatcherResponder).toHaveBeenCalledWith(
        expect.objectContaining({
          vaultPath: "/workspace-obsidian",
          config: expect.objectContaining({ owner: "TestOrg" }),
        }),
      );
    });

    it("uses default values for optional fields", () => {
      const config = createConfig({ githubWatcher: { enabled: true } });
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createGitHubWatcherResponder).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            owner: "Peleke",
            scanTime: "21:00",
            outputDir: "Buildlog",
            maxBuildlogEntries: 3,
            excludeRepos: [],
          }),
        }),
      );
    });

    it("skips when githubWatcher is undefined", () => {
      const config = createConfig();
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createGitHubWatcherResponder).not.toHaveBeenCalled();
    });

    it("skips when githubWatcher.enabled is false", () => {
      const config = createConfig({ githubWatcher: { enabled: false } });
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createGitHubWatcherResponder).not.toHaveBeenCalled();
    });
  });

  describe("Runlist responder", () => {
    it("creates when runlist.enabled and telegramChatId set", () => {
      const config = createConfig({ runlist: { enabled: true, runlistDir: "Runlist" } });
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createRunlistResponder).toHaveBeenCalledWith(
        expect.objectContaining({
          vaultPath: "/workspace-obsidian",
          telegramChatId: "123456",
          runlistDir: "Runlist",
        }),
      );
    });

    it("skips when runlist.enabled but no telegramChatId", () => {
      const config = createConfig({
        runlist: { enabled: true },
        delivery: { channel: "log" },
      });
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createRunlistResponder).not.toHaveBeenCalled();
    });

    it("skips when runlist is not in config", () => {
      const config = createConfig();
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createRunlistResponder).not.toHaveBeenCalled();
    });
  });

  describe("Cron bridge", () => {
    it("creates when scheduled jobs exist", () => {
      const config = createConfig();
      buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createCronBridge).toHaveBeenCalled();
    });

    it("skips when no scheduled jobs", () => {
      mockGetScheduledJobs.mockReturnValue([]);
      const config = createConfig();
      const result = buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(createCronBridge).not.toHaveBeenCalled();
      expect(result.sources).toHaveLength(0);
    });
  });

  describe("return value", () => {
    it("returns responders and sources arrays", () => {
      const config = createConfig();
      const result = buildCadencePipeline({ config: config as any, llmProvider: mockLlm as any });

      expect(result.responders).toBeInstanceOf(Array);
      expect(result.sources).toBeInstanceOf(Array);
      expect(result.responders.length).toBeGreaterThan(0);
    });
  });
});

describe("createLinWheelClientFromEnv", () => {
  afterEach(() => {
    delete process.env.LINWHEEL_API_KEY;
    delete process.env.LINWHEEL_SIGNING_SECRET;
    delete process.env.LINWHEEL_BASE_URL;
  });

  it("returns LinWheel client when LINWHEEL_API_KEY is set", () => {
    process.env.LINWHEEL_API_KEY = "lw_sk_test_key";
    const client = createLinWheelClientFromEnv();
    expect(client).not.toBeNull();
  });

  it("returns null when LINWHEEL_API_KEY is not set", () => {
    delete process.env.LINWHEEL_API_KEY;
    const client = createLinWheelClientFromEnv();
    expect(client).toBeNull();
  });

  it("returns null when LINWHEEL_API_KEY is empty", () => {
    process.env.LINWHEEL_API_KEY = "";
    const client = createLinWheelClientFromEnv();
    expect(client).toBeNull();
  });

  it("returns null when LINWHEEL_API_KEY is whitespace", () => {
    process.env.LINWHEEL_API_KEY = "   ";
    const client = createLinWheelClientFromEnv();
    expect(client).toBeNull();
  });

  it("passes signingSecret when LINWHEEL_SIGNING_SECRET is set", () => {
    process.env.LINWHEEL_API_KEY = "lw_sk_test";
    process.env.LINWHEEL_SIGNING_SECRET = "secret123";
    const client = createLinWheelClientFromEnv() as any;
    expect(client).not.toBeNull();
    expect(client.signingSecret).toBe("secret123");
  });

  it("passes baseUrl when LINWHEEL_BASE_URL is set", () => {
    process.env.LINWHEEL_API_KEY = "lw_sk_test";
    process.env.LINWHEEL_BASE_URL = "https://custom.api.com";
    const client = createLinWheelClientFromEnv() as any;
    expect(client).not.toBeNull();
    expect(client.baseUrl).toBe("https://custom.api.com");
  });
});
