/**
 * Core types for the OpenClaw learning layer.
 *
 * Hierarchical arm IDs: "type:category:id"
 * e.g. "tool:exec:bash", "skill:coding:main", "file:workspace:auth-notes.md"
 */

export type ArmType = "tool" | "memory" | "skill" | "file" | "section";

/** Hierarchical arm identifier: "type:category:id" */
export type ArmId = string;

export type Arm = {
  id: ArmId;
  type: ArmType;
  category: string;
  label: string;
  /** Estimated tokens this arm consumes in the prompt. */
  tokenCost: number;
};

export type ArmPosterior = {
  armId: ArmId;
  /** Beta distribution successes (prior = 1.0). */
  alpha: number;
  /** Beta distribution failures (prior = 1.0). */
  beta: number;
  /** Total times this arm was included in a run. */
  pulls: number;
  lastUpdated: number;
};

export type SelectionContext = {
  sessionKey?: string;
  channel?: string;
  provider?: string;
  model?: string;
  promptLength?: number;
  /** Captured now for future LinUCB (v0.0.2). */
  featureVector?: number[];
};

export type ArmOutcome = {
  armId: ArmId;
  included: boolean;
  referenced: boolean;
  tokenCost: number;
};

export type RunTrace = {
  traceId: string;
  runId: string;
  sessionId: string;
  sessionKey?: string;
  timestamp: number;
  provider?: string;
  model?: string;
  channel?: string;
  isBaseline: boolean;
  context: SelectionContext;
  arms: ArmOutcome[];
  usage?: { input?: number; output?: number; cacheRead?: number; total?: number };
  durationMs?: number;
  systemPromptChars: number;
  aborted: boolean;
  error?: string;
};

export type SelectionResult = {
  selectedArms: ArmId[];
  excludedArms: ArmId[];
  isBaseline: boolean;
  totalTokenBudget: number;
  usedTokens: number;
};

export type LearningConfig = {
  enabled?: boolean;
  phase?: "passive" | "active";
  tokenBudget?: number;
  /** Fraction of runs using full prompt (counterfactual). Default 0.10. */
  baselineRate?: number;
  /** Arms with fewer than N pulls are always included. */
  minPulls?: number;
  /** Qortex learning backend configuration. */
  qortex?: {
    /** Command to spawn qortex MCP server. Default: "uvx qortex mcp-serve". */
    command?: string;
  };
  /** Learner name in qortex. Default: "openclaw". */
  learnerName?: string;
};

// -- Parsing helpers --

const VALID_ARM_TYPES = new Set<ArmType>(["tool", "memory", "skill", "file", "section"]);

export type ParsedArmId = { type: ArmType; category: string; id: string };

/** Parse "type:category:id" into components. Returns null if malformed. */
export function parseArmId(armId: string): ParsedArmId | null {
  const parts = armId.split(":");
  if (parts.length < 3) return null;
  const [type, category, ...rest] = parts;
  if (!VALID_ARM_TYPES.has(type as ArmType)) return null;
  if (!category || rest.length === 0) return null;
  return { type: type as ArmType, category, id: rest.join(":") };
}

/** Build an arm ID from components. */
export function buildArmId(type: ArmType, category: string, id: string): ArmId {
  return `${type}:${category}:${id}`;
}
