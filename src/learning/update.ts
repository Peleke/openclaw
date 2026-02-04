/**
 * Post-run posterior update hook for Thompson Sampling.
 *
 * Called after trace capture to update arm posteriors based on outcomes.
 */

import type { DatabaseSync } from "node:sqlite";
import type { RunTrace, ArmPosterior, LearningConfig, ArmId } from "./types.js";
import { parseArmId } from "./types.js";
import { loadPosteriors, savePosterior } from "./store.js";
import { updateBeta, getInitialPrior, type BetaParams } from "./beta.js";
import { log } from "./logger.js";

export type UpdatePosteriorsParams = {
  db: DatabaseSync;
  trace: RunTrace;
  config: LearningConfig;
};

export type UpdatePosteriorsResult = {
  /** Number of existing posteriors updated. */
  updated: number;
  /** Number of new posteriors created. */
  created: number;
};

/**
 * Update posteriors based on run outcomes.
 *
 * Reward model:
 * - Arm included + referenced → reward = 1.0 (success)
 * - Arm included + not referenced → reward = 0.0 (failure)
 * - Arm excluded → no update (counterfactual not observed)
 *
 * Only runs in active phase; passive phase skips updates.
 */
export function updatePosteriors(params: UpdatePosteriorsParams): UpdatePosteriorsResult {
  const { db, trace, config } = params;

  // Skip in passive mode
  if (config.phase !== "active") {
    return { updated: 0, created: 0 };
  }

  // Skip aborted or errored runs - incomplete data
  if (trace.aborted || trace.error) {
    log.debug(`learning: skipping posterior update for aborted/errored run ${trace.runId}`);
    return { updated: 0, created: 0 };
  }

  const posteriors = loadPosteriors(db);
  let updated = 0;
  let created = 0;
  const now = Date.now();

  for (const outcome of trace.arms) {
    // Only update included arms - we don't observe counterfactuals
    if (!outcome.included) continue;

    const reward = outcome.referenced ? 1.0 : 0.0;
    const existing = posteriors.get(outcome.armId);

    if (existing) {
      const updatedParams = updateBeta({ alpha: existing.alpha, beta: existing.beta }, reward);
      savePosterior(db, {
        armId: outcome.armId,
        alpha: updatedParams.alpha,
        beta: updatedParams.beta,
        pulls: existing.pulls + 1,
        lastUpdated: now,
      });
      updated++;
    } else {
      // Create new posterior with initial prior + first observation
      const prior = inferPrior(outcome.armId);
      const updatedParams = updateBeta(prior, reward);
      savePosterior(db, {
        armId: outcome.armId,
        alpha: updatedParams.alpha,
        beta: updatedParams.beta,
        pulls: 1,
        lastUpdated: now,
      });
      created++;
    }
  }

  log.debug(`learning: updated ${updated} posteriors, created ${created} new posteriors`);
  return { updated, created };
}

/**
 * Infer initial prior for an arm based on its type.
 */
function inferPrior(armId: ArmId): BetaParams {
  const parsed = parseArmId(armId);
  if (!parsed) {
    // Default to curated prior if parsing fails
    return getInitialPrior("curated");
  }

  const source = parsed.type === "file" ? "learned" : "curated";
  return getInitialPrior(source);
}

/**
 * Batch update posteriors from multiple traces.
 * Useful for bootstrapping from historical traces.
 */
export function batchUpdatePosteriors(
  db: DatabaseSync,
  traces: RunTrace[],
  config: LearningConfig,
): UpdatePosteriorsResult {
  let totalUpdated = 0;
  let totalCreated = 0;

  for (const trace of traces) {
    const result = updatePosteriors({ db, trace, config });
    totalUpdated += result.updated;
    totalCreated += result.created;
  }

  return { updated: totalUpdated, created: totalCreated };
}

/**
 * Get posterior statistics for an arm.
 */
export function getPosteriorStats(
  posteriors: Map<ArmId, ArmPosterior>,
  armId: ArmId,
): {
  mean: number;
  pulls: number;
  confidence: "high" | "medium" | "low";
} | null {
  const posterior = posteriors.get(armId);
  if (!posterior) return null;

  const mean = posterior.alpha / (posterior.alpha + posterior.beta);
  const pulls = posterior.pulls;

  // Confidence based on number of observations
  let confidence: "high" | "medium" | "low";
  if (pulls >= 20) {
    confidence = "high";
  } else if (pulls >= 5) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return { mean, pulls, confidence };
}
