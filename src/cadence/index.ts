/**
 * Cadence integration for OpenClaw.
 *
 * Provides ambient agency through typed signal infrastructure.
 */

// Signal types
export type { OpenClawSignal, OpenClawSignalType, OpenClawPayloadMap } from "./signals.js";

// Bus management
export {
  createOpenClawBus,
  initOpenClawBus,
  getOpenClawBus,
  destroyOpenClawBus,
  type OpenClawBus,
  type OpenClawBusOptions,
} from "./bus.js";

// Sources
export {
  createObsidianWatcherSource,
  type ObsidianWatcherOptions,
} from "./sources/obsidian-watcher.js";
export {
  createCronBridge,
  getNextRun,
  type CronJob,
  type CronBridgeOptions,
} from "./sources/cron-bridge.js";

// Responders
export {
  registerResponders,
  createTaskLoggerResponder,
  type Responder,
} from "./responders/index.js";
export { createInsightExtractorResponder } from "./responders/insight-extractor/index.js";
export { createInsightDigestResponder } from "./responders/insight-digest/index.js";
export { createTelegramNotifierResponder } from "./responders/telegram-notifier.js";

// LLM
export { createOpenClawLLMAdapter, createMockLLMProvider } from "./llm/openclaw-adapter.js";
export type { LLMProvider, ChatMessage, ChatOptions, ChatResponse } from "./llm/types.js";

// P1 Config
export {
  loadCadenceConfig,
  saveCadenceConfig,
  getScheduledJobs,
  getConfigPath,
  type CadenceP1Config,
} from "./config.js";

// Domain types (kept from original)
export type { Block, Task, CadenceConfig, NudgeState } from "./types.js";
export { CADENCE_DEFAULTS } from "./types.js";

// Utilities
export { extractTasks, readPlanFile } from "./obsidian.js";

// Re-export useful Cadence types
export type { SignalBus, Source, Middleware, BaseSignal } from "@peleke.s/cadence";
