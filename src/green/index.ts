/**
 * Green layer for OpenClaw.
 *
 * Provides environmental impact tracking for AI inference.
 *
 * @module green
 */

// Core types
export type {
  CarbonFactor,
  CarbonFactorSource,
  CarbonTrace,
  CarbonSummary,
  CarbonEquivalents,
  CarbonTimeseriesBucket,
  GreenConfig,
  ProviderBreakdown,
} from "./types.js";

// Config
export {
  DEFAULT_GREEN_CONFIG,
  DEFAULT_CARBON_FACTORS,
  FALLBACK_CARBON_FACTOR,
  resolveGreenConfig,
} from "./config.js";

// Calculator
export {
  calculateCarbon,
  calculateEquivalents,
  findCarbonFactor,
  formatConfidence,
} from "./carbon-calculator.js";

// Storage
export {
  countCarbonTraces,
  ensureGreenSchema,
  getCarbonSummary,
  getCarbonTimeseries,
  getProviderBreakdown,
  insertCarbonTrace,
  listCarbonTraces,
  openGreenDb,
} from "./store.js";

// Trace capture
export { captureAndStoreGreenTrace, captureGreenTrace } from "./trace-capture.js";
