/**
 * Thompson Sampling strategy for arm selection.
 *
 * Implements the SelectionStrategy interface with:
 * - Baseline rate (counterfactual evaluation)
 * - Seed arms that are never excluded
 * - Underexplored arms always included
 * - Thompson sampling for exploration/exploitation
 * - Token budget greedy selection
 */

import type {
  Arm,
  ArmId,
  ArmPosterior,
  SelectionContext,
  SelectionResult,
  SelectionStrategy,
} from "./types.js";
import { sampleBeta, getInitialPrior, type BetaParams } from "./beta.js";

export type ThompsonConfig = {
  /** Fraction of runs using full prompt (counterfactual). Default 0.10. */
  baselineRate: number;
  /** Arms with fewer than N pulls are always included. Default 5. */
  minPulls: number;
  /** Core arms that are never excluded. */
  seedArmIds?: ArmId[];
};

/** Default seed arms - core tools that should never be excluded. */
export const SEED_ARM_IDS: ArmId[] = [
  "tool:fs:Read",
  "tool:fs:Write",
  "tool:fs:Edit",
  "tool:exec:Bash",
  "tool:fs:Glob",
  "tool:fs:Grep",
];

type ScoredArm = {
  arm: Arm;
  score: number;
  isSeed: boolean;
  isUnderexplored: boolean;
};

export class ThompsonStrategy implements SelectionStrategy {
  private readonly seedSet: Set<ArmId>;

  constructor(private readonly config: ThompsonConfig) {
    this.seedSet = new Set(config.seedArmIds ?? SEED_ARM_IDS);
  }

  select(params: {
    arms: Arm[];
    posteriors: Map<ArmId, ArmPosterior>;
    context: SelectionContext;
    tokenBudget: number;
  }): SelectionResult {
    const { arms, posteriors, tokenBudget } = params;

    // 1. Baseline check: with baselineRate probability, include all arms
    if (Math.random() < this.config.baselineRate) {
      return this.selectAll(arms, tokenBudget);
    }

    // 2. Sample Thompson score for each arm
    const scored: ScoredArm[] = arms.map((arm) => ({
      arm,
      score: this.sampleScore(arm, posteriors),
      isSeed: this.seedSet.has(arm.id),
      isUnderexplored: this.isUnderexplored(arm.id, posteriors),
    }));

    // 3. Sort: seeds first, then underexplored, then by score (descending)
    scored.sort((a, b) => {
      // Seeds always first
      if (a.isSeed !== b.isSeed) return a.isSeed ? -1 : 1;
      // Underexplored arms next
      if (a.isUnderexplored !== b.isUnderexplored) return a.isUnderexplored ? -1 : 1;
      // Then by Thompson score (higher is better)
      return b.score - a.score;
    });

    // 4. Greedy selection within token budget
    const selectedArms: ArmId[] = [];
    const excludedArms: ArmId[] = [];
    let usedTokens = 0;

    for (const { arm } of scored) {
      if (usedTokens + arm.tokenCost <= tokenBudget) {
        selectedArms.push(arm.id);
        usedTokens += arm.tokenCost;
      } else {
        excludedArms.push(arm.id);
      }
    }

    return {
      selectedArms,
      excludedArms,
      isBaseline: false,
      totalTokenBudget: tokenBudget,
      usedTokens,
    };
  }

  /**
   * Select all arms up to token budget (baseline run).
   * Used for counterfactual evaluation.
   */
  private selectAll(arms: Arm[], tokenBudget: number): SelectionResult {
    const selectedArms: ArmId[] = [];
    const excludedArms: ArmId[] = [];
    let usedTokens = 0;

    for (const arm of arms) {
      if (usedTokens + arm.tokenCost <= tokenBudget) {
        selectedArms.push(arm.id);
        usedTokens += arm.tokenCost;
      } else {
        excludedArms.push(arm.id);
      }
    }

    return {
      selectedArms,
      excludedArms,
      isBaseline: true,
      totalTokenBudget: tokenBudget,
      usedTokens,
    };
  }

  /**
   * Sample Thompson score for an arm.
   * This is THE key line: we sample from the posterior, not use the mean.
   * This enables exploration of uncertain arms.
   */
  private sampleScore(arm: Arm, posteriors: Map<ArmId, ArmPosterior>): number {
    const posterior = posteriors.get(arm.id);
    const params: BetaParams = posterior
      ? { alpha: posterior.alpha, beta: posterior.beta }
      : this.getPrior(arm);
    return sampleBeta(params);
  }

  /**
   * Get initial prior based on arm type.
   */
  private getPrior(arm: Arm): BetaParams {
    const source = arm.type === "file" ? "learned" : "curated";
    return getInitialPrior(source);
  }

  /**
   * Check if arm is underexplored (fewer than minPulls observations).
   */
  private isUnderexplored(armId: ArmId, posteriors: Map<ArmId, ArmPosterior>): boolean {
    const posterior = posteriors.get(armId);
    return !posterior || posterior.pulls < this.config.minPulls;
  }
}

/**
 * Create a Thompson Sampling strategy with default configuration.
 */
export function createThompsonStrategy(overrides?: Partial<ThompsonConfig>): ThompsonStrategy {
  return new ThompsonStrategy({
    baselineRate: overrides?.baselineRate ?? 0.1,
    minPulls: overrides?.minPulls ?? 5,
    seedArmIds: overrides?.seedArmIds ?? SEED_ARM_IDS,
  });
}
