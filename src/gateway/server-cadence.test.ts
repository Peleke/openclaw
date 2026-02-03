/**
 * Server Cadence tests — comprehensive coverage for P1 Content Pipeline integration.
 *
 * Tests the gateway integration of Cadence's P1 pipeline:
 * - setupP1ContentPipeline() configuration handling
 * - startGatewayCadence() bus lifecycle
 * - Error handling and graceful degradation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SubsystemLogger } from "../logging/subsystem.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";

// Mock all cadence imports
vi.mock("../cadence/index.js", () => ({
  initOpenClawBus: vi.fn(),
  getOpenClawBus: vi.fn(),
  destroyOpenClawBus: vi.fn(),
  createObsidianWatcherSource: vi.fn(),
  loadCadenceConfig: vi.fn(),
  getScheduledJobs: vi.fn(),
  createCronBridge: vi.fn(),
  createInsightExtractorResponder: vi.fn(),
  createInsightDigestResponder: vi.fn(),
  createTelegramNotifierResponder: vi.fn(),
  createOpenClawLLMAdapter: vi.fn(),
  registerResponders: vi.fn(),
}));

import { startGatewayCadence, getGatewayCadenceBus } from "./server-cadence.js";

import {
  initOpenClawBus,
  getOpenClawBus,
  destroyOpenClawBus,
  createObsidianWatcherSource,
  loadCadenceConfig,
  getScheduledJobs,
  createCronBridge,
  createInsightExtractorResponder,
  createInsightDigestResponder,
  createTelegramNotifierResponder,
  createOpenClawLLMAdapter,
  registerResponders,
} from "../cadence/index.js";

// Cast mocks for type safety
const mockInitOpenClawBus = initOpenClawBus as ReturnType<typeof vi.fn>;
const mockGetOpenClawBus = getOpenClawBus as ReturnType<typeof vi.fn>;
const mockDestroyOpenClawBus = destroyOpenClawBus as ReturnType<typeof vi.fn>;
const mockCreateObsidianWatcherSource = createObsidianWatcherSource as ReturnType<typeof vi.fn>;
const mockLoadCadenceConfig = loadCadenceConfig as ReturnType<typeof vi.fn>;
const mockGetScheduledJobs = getScheduledJobs as ReturnType<typeof vi.fn>;
const mockCreateCronBridge = createCronBridge as ReturnType<typeof vi.fn>;
const mockCreateInsightExtractorResponder = createInsightExtractorResponder as ReturnType<
  typeof vi.fn
>;
const mockCreateInsightDigestResponder = createInsightDigestResponder as ReturnType<typeof vi.fn>;
const mockCreateTelegramNotifierResponder = createTelegramNotifierResponder as ReturnType<
  typeof vi.fn
>;
const mockCreateOpenClawLLMAdapter = createOpenClawLLMAdapter as ReturnType<typeof vi.fn>;
const mockRegisterResponders = registerResponders as ReturnType<typeof vi.fn>;

// Mock logger
function createMockLogger(): SubsystemLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SubsystemLogger;
}

// Mock bus
function createMockBus() {
  return {
    bus: {
      on: vi.fn().mockReturnValue(() => {}),
      onAny: vi.fn().mockReturnValue(() => {}),
      emit: vi.fn().mockResolvedValue(undefined),
    },
    addSource: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

// Default P1 config
function createMockP1Config(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    vaultPath: "/test/vault",
    delivery: { channel: "telegram", telegramChatId: "123456" },
    pillars: [
      { id: "tech", name: "Technology", keywords: ["code", "software"] },
      { id: "life", name: "Life" }, // No keywords - tests default to []
    ],
    llm: { provider: "anthropic", model: "claude-3-5-haiku-latest" },
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

describe("startGatewayCadence", () => {
  let mockLog: SubsystemLogger;
  let mockBus: ReturnType<typeof createMockBus>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLog = createMockLogger();
    mockBus = createMockBus();
    mockInitOpenClawBus.mockReturnValue(mockBus);
    mockCreateObsidianWatcherSource.mockReturnValue({ name: "obsidian-watcher" });
    mockCreateCronBridge.mockReturnValue({ name: "cron-bridge" });
    mockCreateInsightExtractorResponder.mockReturnValue({ name: "insight-extractor" });
    mockCreateInsightDigestResponder.mockReturnValue({ name: "insight-digest" });
    mockCreateTelegramNotifierResponder.mockReturnValue({ name: "telegram-notifier" });
    mockCreateOpenClawLLMAdapter.mockReturnValue({ name: "openclaw-llm" });
    mockGetScheduledJobs.mockReturnValue([
      { id: "nightly-digest", name: "Nightly Digest", expr: "0 21 * * *", tz: "America/New_York" },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("with Cadence disabled", () => {
    it("returns null when cfg.cadence is undefined", async () => {
      const cfg = {} as OpenClawConfig;
      const result = await startGatewayCadence({ cfg, log: mockLog });

      expect(result).toBeNull();
      expect(mockLog.debug).toHaveBeenCalledWith("cadence: disabled in config");
    });

    it("returns null when cfg.cadence.enabled is false", async () => {
      const cfg = { cadence: { enabled: false } } as OpenClawConfig;
      const result = await startGatewayCadence({ cfg, log: mockLog });

      expect(result).toBeNull();
    });
  });

  describe("bus initialization", () => {
    it("initializes OpenClawBus with debug mode from CADENCE_DEBUG env", async () => {
      const originalEnv = process.env.CADENCE_DEBUG;
      process.env.CADENCE_DEBUG = "1";
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockInitOpenClawBus).toHaveBeenCalledWith(expect.objectContaining({ debug: true }));

      process.env.CADENCE_DEBUG = originalEnv;
    });

    it("initializes OpenClawBus without debug mode when CADENCE_DEBUG is not set", async () => {
      const originalEnv = process.env.CADENCE_DEBUG;
      delete process.env.CADENCE_DEBUG;
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockInitOpenClawBus).toHaveBeenCalledWith(expect.objectContaining({ debug: false }));

      process.env.CADENCE_DEBUG = originalEnv;
    });

    it("registers onError handler that logs signal handling errors", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      // Get the onError callback that was passed to initOpenClawBus
      const initCall = mockInitOpenClawBus.mock.calls[0][0];
      expect(initCall.onError).toBeDefined();

      // Test the onError callback
      const mockError = new Error("Handler failed");
      const mockSignal = { type: "test.signal", id: "123" };
      initCall.onError(mockError, mockSignal);

      expect(mockLog.error).toHaveBeenCalledWith(
        expect.stringContaining("cadence: handler error for test.signal"),
      );
    });
  });

  describe("obsidian watcher", () => {
    it("adds obsidian watcher when vaultPath is configured", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true, vaultPath: "/my/vault" } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockCreateObsidianWatcherSource).toHaveBeenCalledWith({
        vaultPath: "/my/vault",
        emitTasks: true,
      });
      expect(mockBus.addSource).toHaveBeenCalledWith({ name: "obsidian-watcher" });
    });

    it("skips obsidian watcher when vaultPath is not set", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockCreateObsidianWatcherSource).not.toHaveBeenCalled();
    });
  });

  describe("P1 pipeline integration", () => {
    it("sets up P1 pipeline when config is enabled and valid", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config());

      const cfg = { cadence: { enabled: true, vaultPath: "/vault" } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      // Should create all responders
      expect(mockCreateOpenClawLLMAdapter).toHaveBeenCalledWith({
        defaultProvider: "anthropic",
        defaultModel: "claude-3-5-haiku-latest",
      });
      expect(mockCreateInsightExtractorResponder).toHaveBeenCalled();
      expect(mockCreateInsightDigestResponder).toHaveBeenCalled();
      expect(mockCreateTelegramNotifierResponder).toHaveBeenCalled();

      // Should register responders
      expect(mockRegisterResponders).toHaveBeenCalled();
    });

    it("adds cron bridge source when schedule is enabled", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config());

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockCreateCronBridge).toHaveBeenCalled();
      expect(mockBus.addSource).toHaveBeenCalledWith({ name: "cron-bridge" });
    });

    it("logs pipeline status with responder and source counts", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config());

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringMatching(/P1 pipeline ready.*responders.*sources/),
      );
    });

    it("continues gracefully when P1 setup returns null (disabled)", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      const result = await startGatewayCadence({ cfg, log: mockLog });

      // Should still return a valid result (bus started)
      expect(result).not.toBeNull();
      expect(mockBus.start).toHaveBeenCalled();
    });
  });

  describe("P1 disabled scenarios", () => {
    it("returns null from P1 setup when p1Config.enabled is false", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      // P1 responders should NOT be created
      expect(mockCreateInsightExtractorResponder).not.toHaveBeenCalled();
      expect(mockCreateInsightDigestResponder).not.toHaveBeenCalled();
    });

    it("returns null from P1 setup when vaultPath is empty", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ vaultPath: "" }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("no vaultPath configured"));
      expect(mockCreateInsightExtractorResponder).not.toHaveBeenCalled();
    });
  });

  describe("LLM provider failures", () => {
    it("returns null from P1 setup when createOpenClawLLMAdapter throws", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config());
      mockCreateOpenClawLLMAdapter.mockImplementation(() => {
        throw new Error("Invalid API key");
      });

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockLog.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to create LLM provider"),
      );
      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining("P1 insight extraction will be disabled"),
      );
      expect(mockCreateInsightExtractorResponder).not.toHaveBeenCalled();
    });

    it("handles non-Error throws from LLM adapter", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config());
      mockCreateOpenClawLLMAdapter.mockImplementation(() => {
        throw "string error"; // Non-Error throw
      });

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("string error"));
    });
  });

  describe("delivery channel variations", () => {
    it("creates TelegramNotifier when channel is telegram and chatId is set", async () => {
      mockLoadCadenceConfig.mockResolvedValue(
        createMockP1Config({
          delivery: { channel: "telegram", telegramChatId: "123456" },
        }),
      );

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockCreateTelegramNotifierResponder).toHaveBeenCalledWith({
        telegramChatId: "123456",
        deliverDigests: true,
        notifyOnFileChange: false,
      });
    });

    it("skips TelegramNotifier when channel is log", async () => {
      mockLoadCadenceConfig.mockResolvedValue(
        createMockP1Config({
          delivery: { channel: "log" },
        }),
      );

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockCreateTelegramNotifierResponder).not.toHaveBeenCalled();
      expect(mockLog.debug).toHaveBeenCalledWith(
        expect.stringContaining("delivery channel is 'log'"),
      );
    });

    it("warns when telegram channel lacks telegramChatId", async () => {
      mockLoadCadenceConfig.mockResolvedValue(
        createMockP1Config({
          delivery: { channel: "telegram" }, // No chatId
        }),
      );

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockCreateTelegramNotifierResponder).not.toHaveBeenCalled();
      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("not fully configured"));
    });

    it("warns for unknown delivery channels", async () => {
      mockLoadCadenceConfig.mockResolvedValue(
        createMockP1Config({
          delivery: { channel: "discord" }, // Not fully implemented
        }),
      );

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining("'discord' not fully configured"),
      );
    });
  });

  describe("cron job scheduling", () => {
    it("creates no cron jobs when schedule.enabled is false", async () => {
      mockLoadCadenceConfig.mockResolvedValue(
        createMockP1Config({
          schedule: { enabled: false },
        }),
      );
      mockGetScheduledJobs.mockReturnValue([]);

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockCreateCronBridge).not.toHaveBeenCalled();
    });

    it("creates cron bridge with jobs from getScheduledJobs", async () => {
      const jobs = [
        { id: "nightly-digest", name: "Nightly", expr: "0 21 * * *", tz: "UTC" },
        { id: "morning-standup", name: "Morning", expr: "0 8 * * *", tz: "UTC" },
      ];
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config());
      mockGetScheduledJobs.mockReturnValue(jobs);

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockCreateCronBridge).toHaveBeenCalledWith({ jobs });
    });

    it("passes correct cronTriggerJobIds to digest responder", async () => {
      mockLoadCadenceConfig.mockResolvedValue(
        createMockP1Config({
          schedule: {
            enabled: true,
            nightlyDigest: "21:00",
            morningStandup: "08:00",
            timezone: "UTC",
          },
        }),
      );

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockCreateInsightDigestResponder).toHaveBeenCalledWith(
        expect.objectContaining({
          cronTriggerJobIds: ["nightly-digest", "morning-standup"],
        }),
      );
    });

    it("only includes nightly-digest when morningStandup is not set", async () => {
      mockLoadCadenceConfig.mockResolvedValue(
        createMockP1Config({
          schedule: {
            enabled: true,
            nightlyDigest: "21:00",
            morningStandup: undefined,
            timezone: "UTC",
          },
        }),
      );

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockCreateInsightDigestResponder).toHaveBeenCalledWith(
        expect.objectContaining({
          cronTriggerJobIds: ["nightly-digest"],
        }),
      );
    });
  });

  describe("pillar configuration", () => {
    it("passes pillars with keywords defaulting to empty array", async () => {
      mockLoadCadenceConfig.mockResolvedValue(
        createMockP1Config({
          pillars: [
            { id: "tech", name: "Tech", keywords: ["code"] },
            { id: "life", name: "Life" }, // No keywords
          ],
        }),
      );

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockCreateInsightExtractorResponder).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            pillars: [
              { id: "tech", name: "Tech", keywords: ["code"] },
              { id: "life", name: "Life", keywords: [] },
            ],
          }),
        }),
      );
    });
  });

  describe("bus lifecycle", () => {
    it("starts all sources after registration", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockBus.start).toHaveBeenCalled();
      expect(mockLog.info).toHaveBeenCalledWith("cadence: signal bus started");
    });

    it("registers onAny handler for debug logging", async () => {
      const originalEnv = process.env.CADENCE_DEBUG;
      process.env.CADENCE_DEBUG = "1";
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockBus.bus.onAny).toHaveBeenCalled();

      process.env.CADENCE_DEBUG = originalEnv;
    });

    it("returns stop function that cleanly shuts down bus", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      const result = await startGatewayCadence({ cfg, log: mockLog });

      expect(result).not.toBeNull();
      expect(result!.stop).toBeDefined();

      // Call stop
      await result!.stop();

      expect(mockBus.stop).toHaveBeenCalled();
      expect(mockDestroyOpenClawBus).toHaveBeenCalled();
      expect(mockLog.info).toHaveBeenCalledWith("cadence: stopping signal bus");
      expect(mockLog.info).toHaveBeenCalledWith("cadence: signal bus stopped");
    });

    it("returns bus in result for external access", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      const result = await startGatewayCadence({ cfg, log: mockLog });

      expect(result).not.toBeNull();
      expect(result!.bus).toBe(mockBus);
    });
  });
});

describe("getGatewayCadenceBus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the bus from getOpenClawBus", () => {
    const mockBus = createMockBus();
    mockGetOpenClawBus.mockReturnValue(mockBus);

    const result = getGatewayCadenceBus();

    expect(result).toBe(mockBus);
    expect(mockGetOpenClawBus).toHaveBeenCalled();
  });

  it("throws when bus is not initialized", () => {
    mockGetOpenClawBus.mockImplementation(() => {
      throw new Error("Bus not initialized");
    });

    expect(() => getGatewayCadenceBus()).toThrow("Bus not initialized");
  });
});
