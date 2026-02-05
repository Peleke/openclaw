# Thompson Sampling

## The Multi-Armed Bandit Problem

Imagine a row of slot machines (bandits), each with an unknown payout rate. You want to maximize your total reward, but you don't know which machine is best. You must balance:

- **Exploration** — Try different machines to learn their payout rates
- **Exploitation** — Play the machine you currently believe is best

In OpenClaw, the "machines" are prompt components (tools, skills, files) and the "reward" is whether the model actually references them.

## Why Thompson Sampling

Several algorithms solve the multi-armed bandit problem. Here's how they compare:

| Algorithm | Approach | Pros | Cons |
|-----------|----------|------|------|
| **Epsilon-Greedy** | Random exploration with probability epsilon | Simple | Wastes exploration on known-bad arms |
| **UCB1** | Upper confidence bound on reward estimate | Deterministic | Overly optimistic; slow to converge with many arms |
| **Thompson Sampling** | Sample from posterior, pick highest sample | Naturally adaptive exploration | Requires prior specification |

Thompson Sampling is the best fit for prompt optimization because:

1. **Adaptive exploration** — Uncertain arms get explored more; well-known arms get exploited
2. **Principled priors** — We can encode domain knowledge (curated tools are likely useful)
3. **Natural convergence** — Exploration decreases automatically as posteriors tighten
4. **Budget-compatible** — Scores can be used for greedy selection within a token budget

## How It Works in OpenClaw

### Step 1: Maintain Posteriors

Each arm has a Beta(alpha, beta) posterior. Initially:

- **Curated arms** (tools, skills, memories): Beta(3, 1) — mean 0.75, optimistic
- **Learned arms** (files): Beta(1, 1) — mean 0.50, neutral

After each observation:

- Referenced (success): `alpha += 1`
- Not referenced (failure): `beta += 1`

### Step 2: Sample Scores

For each arm, draw a random sample from its Beta posterior:

```
score_i ~ Beta(alpha_i, beta_i)
```

Arms with high posteriors tend to sample high (exploitation). Arms with wide posteriors occasionally sample high (exploration).

### Step 3: Rank and Pack

Sort arms by priority:

1. **Seed arms** — Always first (never excluded)
2. **Underexplored arms** — Fewer than `minPulls` observations
3. **All others** — Sorted by Thompson score (descending)

Greedily select arms within the token budget:

```
selected = []
usedTokens = 0
for arm in sorted_arms:
    if usedTokens + arm.tokenCost <= tokenBudget:
        selected.append(arm)
        usedTokens += arm.tokenCost
```

### Step 4: Observe and Update

After the model responds, check which included arms were referenced:

- **Included + referenced** → reward = 1.0 → `alpha += 1`
- **Included + not referenced** → reward = 0.0 → `beta += 1`
- **Excluded** → no update (counterfactual not observed)

## Selection Algorithm

```
function thompsonSelect(arms, posteriors, tokenBudget, config):
    // Baseline check
    if random() < config.baselineRate:
        return selectAll(arms, tokenBudget)

    // Score each arm
    for arm in arms:
        posterior = posteriors[arm.id] ?? initialPrior(arm)
        arm.score = sampleBeta(posterior.alpha, posterior.beta)
        arm.isSeed = arm.id in SEED_ARM_IDS
        arm.isUnderexplored = posterior.pulls < config.minPulls

    // Sort: seeds > underexplored > by score
    sort(arms, by=[isSeed DESC, isUnderexplored DESC, score DESC])

    // Greedy selection within budget
    selected = []
    usedTokens = 0
    for arm in arms:
        if usedTokens + arm.tokenCost <= tokenBudget:
            selected.append(arm)
            usedTokens += arm.tokenCost

    return selected
```

## Convergence

As observations accumulate, posteriors tighten:

- **High-value arms** (frequently referenced) develop high means with narrow intervals — they're almost always selected
- **Low-value arms** (rarely referenced) develop low means — they're almost always excluded
- **Marginal arms** maintain wider intervals and continue to be explored occasionally

Convergence speed depends on:

| Factor | Effect |
|--------|--------|
| Baseline rate | Higher rate = more data for all arms = faster convergence |
| `minPulls` | Higher value = longer forced exploration before exclusion |
| Arm count | More arms = each arm gets fewer observations per run |
| Token budget | Tighter budget = more arms excluded = faster differentiation |

Typically, posteriors stabilize after 50-200 traces for a moderate-sized arm inventory (10-30 arms).

## Comparison with Alternatives

| Feature | Thompson Sampling | Epsilon-Greedy | UCB1 |
|---------|-------------------|----------------|------|
| Exploration strategy | Posterior sampling | Random | Upper confidence bound |
| Prior knowledge | Yes (Beta priors) | No | No |
| Budget-aware | Yes (greedy packing) | No (random subset) | Partially |
| Convergence | Fast for informative priors | Slow (constant exploration) | Moderate |
| Implementation | Moderate | Simple | Simple |
| Theory | Bayesian | Frequentist | Frequentist |

## Next Steps

- [Reward Model](reward-model.md) — How reference detection drives rewards
- [Core Concepts](../getting-started/concepts.md) — Arms, posteriors, phases
- [Types Reference](../reference/types.md) — All type definitions
