/**
 * Server Cadence tests — gateway integration with shared pipeline builder.
 *
 * Tests gateway-specific concerns:
 * - Cadence enable/disable from OpenClaw config
 * - Bus initialization and lifecycle
 * - LLM provider error handling
 * - Obsidian watcher setup
 * - Delegation to buildCadencePipeline
 * - Duplicate-process warning
 *
 * Responder-level tests (which responders are created for which config)
 * live in pipeline-builder.test.ts.
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
  buildCadencePipeline: vi.fn(),
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
  buildCadencePipeline,
  createOpenClawLLMAdapter,
  registerResponders,
} from "../cadence/index.js";

// Cast mocks
const mockInitOpenClawBus = initOpenClawBus as ReturnType<typeof vi.fn>;
const mockGetOpenClawBus = getOpenClawBus as ReturnType<typeof vi.fn>;
const mockDestroyOpenClawBus = destroyOpenClawBus as ReturnType<typeof vi.fn>;
const mockCreateObsidianWatcherSource = createObsidianWatcherSource as ReturnType<typeof vi.fn>;
const mockLoadCadenceConfig = loadCadenceConfig as ReturnType<typeof vi.fn>;
const mockBuildCadencePipeline = buildCadencePipeline as ReturnType<typeof vi.fn>;
const mockCreateOpenClawLLMAdapter = createOpenClawLLMAdapter as ReturnType<typeof vi.fn>;
const mockRegisterResponders = registerResponders as ReturnType<typeof vi.fn>;

function createMockLogger(): SubsystemLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SubsystemLogger;
}

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

function createMockP1Config(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    vaultPath: "/test/vault",
    delivery: { channel: "telegram", telegramChatId: "123456" },
    pillars: [{ id: "tech", name: "Technology", keywords: ["code"] }],
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
    mockCreateOpenClawLLMAdapter.mockReturnValue({ name: "openclaw-llm" });
    mockBuildCadencePipeline.mockReturnValue({
      responders: [{ name: "insight-extractor" }, { name: "insight-digest" }],
      sources: [{ name: "cron-bridge" }],
    });
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

      const initCall = mockInitOpenClawBus.mock.calls[0][0];
      expect(initCall.onError).toBeDefined();

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

  describe("P1 pipeline delegation", () => {
    it("calls buildCadencePipeline with config and llmProvider", async () => {
      const p1Config = createMockP1Config();
      mockLoadCadenceConfig.mockResolvedValue(p1Config);

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockBuildCadencePipeline).toHaveBeenCalledWith({
        config: p1Config,
        llmProvider: { name: "openclaw-llm" },
      });
    });

    it("registers responders from pipeline builder", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config());

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockRegisterResponders).toHaveBeenCalledWith(mockBus.bus, [
        { name: "insight-extractor" },
        { name: "insight-digest" },
      ]);
    });

    it("adds sources from pipeline builder", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config());

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockBus.addSource).toHaveBeenCalledWith({ name: "cron-bridge" });
    });

    it("skips pipeline when P1 is disabled", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      const result = await startGatewayCadence({ cfg, log: mockLog });

      expect(mockBuildCadencePipeline).not.toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(mockBus.start).toHaveBeenCalled();
    });

    it("skips pipeline when vaultPath is empty", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ vaultPath: "" }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("no vaultPath configured"));
      expect(mockBuildCadencePipeline).not.toHaveBeenCalled();
    });
  });

  describe("LLM provider failures", () => {
    it("skips pipeline when createOpenClawLLMAdapter throws", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config());
      mockCreateOpenClawLLMAdapter.mockImplementation(() => {
        throw new Error("Invalid API key");
      });

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockLog.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to create LLM provider"),
      );
      expect(mockBuildCadencePipeline).not.toHaveBeenCalled();
    });

    it("handles non-Error throws from LLM adapter", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config());
      mockCreateOpenClawLLMAdapter.mockImplementation(() => {
        throw "string error";
      });

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("string error"));
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

    it("returns stop function that cleanly shuts down bus", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      const result = await startGatewayCadence({ cfg, log: mockLog });

      expect(result).not.toBeNull();
      await result!.stop();

      expect(mockBus.stop).toHaveBeenCalled();
      expect(mockDestroyOpenClawBus).toHaveBeenCalled();
    });

    it("returns bus in result for external access", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      const result = await startGatewayCadence({ cfg, log: mockLog });

      expect(result!.bus).toBe(mockBus);
    });
  });

  describe("duplicate-process warning", () => {
    it("logs warning when cadence is enabled via gateway config", async () => {
      mockLoadCadenceConfig.mockResolvedValue(createMockP1Config({ enabled: false }));

      const cfg = { cadence: { enabled: true } } as OpenClawConfig;
      await startGatewayCadence({ cfg, log: mockLog });

      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining("Ensure the openclaw-cadence.service"),
      );
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
