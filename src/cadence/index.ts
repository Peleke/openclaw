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

// Domain types (kept from original)
export type { Block, Task, CadenceConfig, NudgeState } from "./types.js";
export { CADENCE_DEFAULTS } from "./types.js";

// Utilities
export { extractTasks, readPlanFile } from "./obsidian.js";

// Re-export useful Cadence types
export type { SignalBus, Source, Middleware, BaseSignal } from "@peleke.s/cadence";
