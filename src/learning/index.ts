/**
 * Learning layer for OpenClaw.
 *
 * All learning state lives in qortex's SQLite store, accessed via MCP.
 * This module provides:
 * - QortexLearningClient: MCP bridge to qortex learning tools
 * - Domain adapter: translates tools/skills/files ↔ bandit arms
 * - CLI + API: observability and export
 * - Reference detection: domain-specific outcome evaluation
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
} from "./types.js";

export { buildArmId, parseArmId } from "./types.js";

// Qortex MCP client
export { QortexLearningClient } from "./qortex-client.js";
export type {
  QortexArm,
  QortexArmState,
  QortexMetricsResult,
  QortexPosteriorsResult,
  QortexSelectResult,
} from "./qortex-client.js";

// Domain adapter (tools/skills/files ↔ bandit arms)
export { buildCandidates, observeRunOutcomes, selectViaQortex } from "./qortex-adapter.js";

// Reference detection
export { detectReference } from "./reference-detection.js";

// CLI status + export
export { formatLearningStatusFromApi, formatLearningStatusFromQortex } from "./cli-status.js";

export { exportLearningDataFromQortex } from "./cli-export.js";

// API handler
export { createLearningApiHandler } from "./api.js";
