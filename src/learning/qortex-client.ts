/**
 * MCP bridge to qortex's learning tools.
 *
 * Thin typed wrapper around the 6 qortex learning MCP tools:
 *   qortex_learning_select, qortex_learning_observe,
 *   qortex_learning_posteriors, qortex_learning_metrics,
 *   qortex_learning_session_start, qortex_learning_session_end
 *
 * Graceful degradation: when qortex is unavailable, select() returns all
 * candidates and observe() is a no-op.
 *
 * Tool names and parameter shapes verified against:
 *   qortex-track-c/src/qortex/mcp/server.py (lines 2027–2131)
 *   qortex-track-c/src/qortex/learning/types.py
 */

import type { QortexConnection } from "../qortex/types.js";
import { log } from "./logger.js";

// Timeouts (ms)
const SELECT_TIMEOUT_MS = 10_000;
const OBSERVE_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 15_000;

// ── Types (mirror qortex's Python types exactly) ─────────────────────────────

/** Input arm candidate (matches qortex Arm dataclass). */
export type QortexArm = {
  id: string;
  metadata?: Record<string, unknown>;
  token_cost?: number;
};

/**
 * Return shape of qortex_learning_select.
 * Fields: selected_arms, excluded_arms, is_baseline, scores, token_budget, used_tokens
 */
export type QortexSelectResult = {
  selected_arms: string[];
  excluded_arms: string[];
  is_baseline: boolean;
  scores: Record<string, number>;
  token_budget: number;
  used_tokens: number;
};

/**
 * Return shape of qortex_learning_observe.
 * Fields: arm_id, alpha, beta, mean, pulls
 */
export type QortexObserveResult = {
  arm_id: string;
  alpha: number;
  beta: number;
  mean: number;
  pulls: number;
};

/**
 * Per-arm posterior state from qortex (ArmState.to_dict()).
 * Keys: alpha, beta, pulls, total_reward, last_updated, mean
 */
export type QortexArmState = {
  alpha: number;
  beta: number;
  pulls: number;
  total_reward: number;
  last_updated: string;
  mean: number;
};

/**
 * Return shape of qortex_learning_posteriors.
 * posteriors is a dict (map) of arm_id → ArmState dict.
 */
export type QortexPosteriorsResult = {
  learner: string;
  posteriors: Record<string, QortexArmState>;
};

/**
 * Return shape of qortex_learning_metrics.
 * Fields: learner, total_pulls, total_reward, accuracy, arm_count, explore_ratio
 */
export type QortexMetricsResult = {
  learner: string;
  total_pulls: number;
  total_reward: number;
  accuracy: number;
  arm_count: number;
  explore_ratio: number;
};

/** Return shape of qortex_learning_session_start. */
export type QortexSessionStartResult = {
  session_id: string;
  learner: string;
};

/** Return shape of qortex_learning_session_end. */
export type QortexSessionEndResult = {
  session_id: string;
  learner: string;
  selected_arms: string[];
  outcomes: Record<string, string>;
  started_at: string;
  ended_at: string;
};

// ── Client ───────────────────────────────────────────────────────────────────

export class QortexLearningClient {
  constructor(
    private readonly connection: QortexConnection,
    private readonly learnerName: string = "openclaw",
  ) {}

  get isAvailable(): boolean {
    return this.connection.isConnected;
  }

  /**
   * Select arms via Thompson Sampling.
   * On failure: returns all candidate IDs (no filtering).
   *
   * qortex params: learner, candidates, context, k, token_budget
   */
  async select(
    candidates: QortexArm[],
    opts?: {
      context?: Record<string, unknown>;
      token_budget?: number;
      /** Number of arms to select (default: all within budget). */
      k?: number;
    },
  ): Promise<QortexSelectResult> {
    if (!this.isAvailable) {
      return this.fallbackSelectAll(candidates, opts?.token_budget);
    }
    try {
      const result = (await this.connection.callTool(
        "qortex_learning_select",
        {
          learner: this.learnerName,
          candidates: candidates.map((c) => ({
            id: c.id,
            metadata: c.metadata ?? {},
            token_cost: c.token_cost ?? 0,
          })),
          context: opts?.context ?? null,
          k: opts?.k ?? 0, // 0 = select as many as budget allows
          token_budget: opts?.token_budget ?? 0,
        },
        { timeout: SELECT_TIMEOUT_MS },
      )) as QortexSelectResult;
      return result;
    } catch (err) {
      log.debug(`qortex learning select failed, falling back to all: ${String(err)}`);
      return this.fallbackSelectAll(candidates, opts?.token_budget);
    }
  }

  /**
   * Record an observation (reward signal) for an arm.
   * On failure: no-op (data loss acceptable in degraded mode).
   *
   * qortex params: learner, arm_id, outcome, reward, context
   */
  async observe(
    armId: string,
    outcome: string,
    opts?: { reward?: number; context?: Record<string, unknown> },
  ): Promise<QortexObserveResult | null> {
    if (!this.isAvailable) return null;
    try {
      return (await this.connection.callTool(
        "qortex_learning_observe",
        {
          learner: this.learnerName,
          arm_id: armId,
          outcome,
          reward: opts?.reward ?? 0.0,
          context: opts?.context ?? null,
        },
        { timeout: OBSERVE_TIMEOUT_MS },
      )) as QortexObserveResult;
    } catch (err) {
      log.debug(`qortex learning observe failed: ${String(err)}`);
      return null;
    }
  }

  /**
   * Fetch current posteriors from qortex.
   * Returns a map of arm_id → ArmState, or null on failure.
   *
   * qortex params: learner, context, arm_ids
   */
  async posteriors(opts?: {
    context?: Record<string, unknown>;
    arm_ids?: string[];
  }): Promise<QortexPosteriorsResult | null> {
    if (!this.isAvailable) return null;
    try {
      return (await this.connection.callTool(
        "qortex_learning_posteriors",
        {
          learner: this.learnerName,
          context: opts?.context ?? null,
          arm_ids: opts?.arm_ids ?? null,
        },
        { timeout: QUERY_TIMEOUT_MS },
      )) as QortexPosteriorsResult;
    } catch (err) {
      log.debug(`qortex learning posteriors failed: ${String(err)}`);
      return null;
    }
  }

  /**
   * Fetch aggregate metrics from qortex.
   * Returns null on failure.
   *
   * qortex params: learner, window
   */
  async metrics(opts?: { window?: number }): Promise<QortexMetricsResult | null> {
    if (!this.isAvailable) return null;
    try {
      return (await this.connection.callTool(
        "qortex_learning_metrics",
        {
          learner: this.learnerName,
          window: opts?.window ?? null,
        },
        { timeout: QUERY_TIMEOUT_MS },
      )) as QortexMetricsResult;
    } catch (err) {
      log.debug(`qortex learning metrics failed: ${String(err)}`);
      return null;
    }
  }

  /**
   * Start a learning session.
   *
   * qortex params: learner, session_name
   */
  async sessionStart(sessionName: string): Promise<QortexSessionStartResult | null> {
    if (!this.isAvailable) return null;
    try {
      return (await this.connection.callTool(
        "qortex_learning_session_start",
        { learner: this.learnerName, session_name: sessionName },
        { timeout: OBSERVE_TIMEOUT_MS },
      )) as QortexSessionStartResult;
    } catch (err) {
      log.debug(`qortex learning session_start failed: ${String(err)}`);
      return null;
    }
  }

  /**
   * End a learning session.
   *
   * qortex params: session_id (no learner needed)
   */
  async sessionEnd(sessionId: string): Promise<QortexSessionEndResult | null> {
    if (!this.isAvailable) return null;
    try {
      return (await this.connection.callTool(
        "qortex_learning_session_end",
        { session_id: sessionId },
        { timeout: OBSERVE_TIMEOUT_MS },
      )) as QortexSessionEndResult;
    } catch (err) {
      log.debug(`qortex learning session_end failed: ${String(err)}`);
      return null;
    }
  }

  /** Fallback: return all candidates as selected (no filtering). */
  private fallbackSelectAll(candidates: QortexArm[], tokenBudget?: number): QortexSelectResult {
    const budget = tokenBudget ?? 0;
    let usedTokens = 0;
    const selected: string[] = [];
    const excluded: string[] = [];

    for (const c of candidates) {
      const cost = c.token_cost ?? 0;
      // If no budget specified (0), include everything
      if (budget === 0 || usedTokens + cost <= budget) {
        selected.push(c.id);
        usedTokens += cost;
      } else {
        excluded.push(c.id);
      }
    }

    return {
      selected_arms: selected,
      excluded_arms: excluded,
      is_baseline: true, // fallback is treated as baseline
      scores: {},
      token_budget: budget,
      used_tokens: usedTokens,
    };
  }
}
