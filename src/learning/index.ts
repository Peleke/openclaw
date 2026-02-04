/**
 * Learning layer for OpenClaw.
 *
 * Provides Thompson Sampling-based active learning for prompt composition.
 *
 * @module learning
 */

// Core types
export type {
  Arm,
  ArmId,
  ArmOutcome,
  ArmPosterior,
  ArmType,
  LearningConfig,
  ParsedArmId,
  RunTrace,
  SelectionContext,
  SelectionResult,
  SelectionStrategy,
} from "./types.js";

export { buildArmId, parseArmId } from "./types.js";

// Beta distribution utilities
export type { ArmSource, BetaParams } from "./beta.js";

export {
  betaCredibleInterval,
  betaMean,
  betaVariance,
  getInitialPrior,
  sampleBeta,
  updateBeta,
} from "./beta.js";

// Thompson Sampling strategy
export type { ThompsonConfig } from "./strategy.js";

export { createThompsonStrategy, SEED_ARM_IDS, ThompsonStrategy } from "./strategy.js";

// Pre-run selection
export type {
  ContextFile,
  PreRunSelectionParams,
  PreRunSelectionResult,
  SkillEntry,
} from "./pre-run.js";

export { inferArmSource, selectPromptComponents } from "./pre-run.js";

// Post-run update
export type { UpdatePosteriorsParams, UpdatePosteriorsResult } from "./update.js";

export { batchUpdatePosteriors, getPosteriorStats, updatePosteriors } from "./update.js";

// Baseline utilities
export {
  generateBaselineSeed,
  recommendedBaselineRate,
  shouldRunBaseline,
  shouldRunBaselineSeeded,
} from "./baseline.js";

// Storage
export {
  countTraces,
  ensureLearningSchema,
  getRunTrace,
  getTraceSummary,
  insertRunTrace,
  listRunTraces,
  listRunTracesWithOffset,
  loadPosteriors,
  openLearningDb,
  savePosterior,
  getTokenTimeseries,
  getConvergenceTimeseries,
} from "./store.js";

export type { TraceSummary, TimeseriesBucket } from "./store.js";

// Trace capture
export { captureAndStoreTrace, captureRunTrace, extractArms } from "./trace-capture.js";

// Reference detection
export { detectReference } from "./reference-detection.js";
