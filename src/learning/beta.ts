/**
 * Beta distribution utilities for Thompson Sampling.
 *
 * Pure math - no external dependencies.
 */

export type BetaParams = {
  /** Successes + prior. */
  alpha: number;
  /** Failures + prior. */
  beta: number;
};

/**
 * Sample from Beta(alpha, beta) using the Gamma ratio method.
 * X = Ga / (Ga + Gb) where Ga ~ Gamma(a,1), Gb ~ Gamma(b,1)
 */
export function sampleBeta(params: BetaParams): number {
  const ga = sampleGamma(params.alpha);
  const gb = sampleGamma(params.beta);
  // Avoid division by zero (extremely rare with valid params)
  if (ga + gb === 0) return 0.5;
  return ga / (ga + gb);
}

/**
 * Sample from Gamma(shape, 1) using Marsaglia-Tsang method.
 * For shape < 1, use rejection sampling.
 */
function sampleGamma(shape: number): number {
  if (shape <= 0) return 0;

  // For shape < 1, use the relation: Gamma(a) = Gamma(a+1) * U^(1/a)
  if (shape < 1) {
    const u = Math.random();
    return sampleGamma(shape + 1) * u ** (1 / shape);
  }

  // Marsaglia-Tsang method for shape >= 1
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    // Rejection sampling for v > 0
    do {
      x = gaussianRandom();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    // Accept/reject step
    const xSq = x * x;
    if (u < 1 - 0.0331 * xSq * xSq) {
      return d * v;
    }
    if (Math.log(u) < 0.5 * xSq + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Box-Muller transform for standard normal N(0,1).
 */
function gaussianRandom(): number {
  let u1: number;
  let u2: number;

  // Ensure u1 > 0 to avoid log(0)
  do {
    u1 = Math.random();
  } while (u1 === 0);

  u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Posterior mean: E[X] = α / (α + β)
 */
export function betaMean(params: BetaParams): number {
  const sum = params.alpha + params.beta;
  if (sum === 0) return 0.5;
  return params.alpha / sum;
}

/**
 * Posterior variance: Var[X] = αβ / ((α+β)²(α+β+1))
 */
export function betaVariance(params: BetaParams): number {
  const { alpha, beta } = params;
  const sum = alpha + beta;
  if (sum === 0 || sum + 1 === 0) return 0;
  return (alpha * beta) / (sum * sum * (sum + 1));
}

/**
 * Bayesian update: α += reward, β += (1-reward)
 *
 * For Bernoulli observations: reward ∈ {0, 1}
 * For continuous rewards: reward ∈ [0, 1]
 */
export function updateBeta(params: BetaParams, reward: number): BetaParams {
  return {
    alpha: params.alpha + reward,
    beta: params.beta + (1 - reward),
  };
}

export type ArmSource = "curated" | "learned";

/**
 * Initial priors based on arm source.
 *
 * - "curated" (tools, skills): Beta(3, 1) — optimistic, mean=0.75
 *   Rationale: Curated components were included intentionally and are
 *   likely to be useful. Start optimistic to avoid premature pruning.
 *
 * - "learned" (files): Beta(1, 1) — neutral, mean=0.50
 *   Rationale: Workspace files may or may not be relevant. Start neutral
 *   and let the data speak.
 */
export function getInitialPrior(source: ArmSource): BetaParams {
  switch (source) {
    case "curated":
      return { alpha: 3, beta: 1 };
    case "learned":
      return { alpha: 1, beta: 1 };
  }
}

/**
 * 95% credible interval for Beta distribution.
 * Uses normal approximation for computational efficiency.
 */
export function betaCredibleInterval(
  params: BetaParams,
  level = 0.95,
): { lower: number; upper: number } {
  const mean = betaMean(params);
  const variance = betaVariance(params);
  const std = Math.sqrt(variance);

  // z-score for credible interval (1.96 for 95%)
  const z = 1.96 * (level === 0.95 ? 1 : Math.sqrt(-2 * Math.log(1 - level)));

  return {
    lower: Math.max(0, mean - z * std),
    upper: Math.min(1, mean + z * std),
  };
}
