# Reward Model

The reward model determines how arm observations translate into posterior updates. It consists of three parts: reference detection, reward assignment, and prior specification.

## Reference Detection

After each run, the learning layer checks whether each included arm was actually used by the model. Detection logic varies by arm type:

| Arm Type | Detection Method | Example |
|----------|-----------------|---------|
| `tool` | Tool name appears in tool call metadata | Model calls `Bash` → `tool:exec:Bash` is referenced |
| `skill` | Skill name in output text or tool metadata | Output mentions "coding" → `skill:coding:main` is referenced |
| `file` | Filename appears in assistant text | Output mentions "README.md" → `file:workspace:README.md` is referenced |
| `memory` | Substring (20+ chars) of content in output | Output contains memory snippet → memory arm is referenced |
| `section` | Always referenced when included | Structural sections are always "used" |

## Reward Values

| Outcome | Reward | Posterior Update |
|---------|--------|-----------------|
| Included + referenced | `1.0` | `alpha += 1` (success) |
| Included + not referenced | `0.0` | `beta += 1` (failure) |
| Excluded | — | No update (counterfactual not observed) |

Only included arms receive updates. Excluded arms have no observed outcome, so their posteriors remain unchanged. This is a key property — the system doesn't penalize arms it chose not to include.

## Initial Priors

Priors encode domain knowledge about how likely an arm is to be useful before any data is observed.

### Curated Arms: Beta(3, 1)

- **Mean:** 0.75 (optimistic)
- **Applies to:** tools, skills, memories
- **Rationale:** Curated components were included intentionally by the user or system. They are likely useful. Starting optimistic avoids premature pruning of valuable tools.

### Learned Arms: Beta(1, 1)

- **Mean:** 0.50 (neutral/uniform)
- **Applies to:** files
- **Rationale:** Workspace files may or may not be relevant to a given task. Start neutral and let the data determine their value.

## Posterior Statistics

### Mean

The expected usefulness score:

```
mean = alpha / (alpha + beta)
```

Higher mean = more frequently referenced = more likely to be included.

### Variance

Uncertainty in the mean estimate:

```
variance = (alpha * beta) / ((alpha + beta)^2 * (alpha + beta + 1))
```

Decreases as observations accumulate.

### Credible Interval

95% credible interval via normal approximation:

```
CI = [mean - 1.96 * sqrt(variance), mean + 1.96 * sqrt(variance)]
```

Clamped to [0, 1].

## Confidence by Pull Count

| Pulls | Confidence | CI Width (typical) | Interpretation |
|-------|------------|-------------------|----------------|
| 0 | None | — | Prior only |
| 1-4 | Low | 0.40+ | Insufficient data; arm always included |
| 5-19 | Medium | 0.15-0.40 | Growing certainty; exploration/exploitation tradeoff |
| 20-49 | High | 0.08-0.15 | Strong signal; posterior mean is reliable |
| 50+ | Very High | < 0.08 | Converged; minimal remaining uncertainty |

## Baseline Counterfactual

Baseline runs serve as the counterfactual — "what would have happened with the full prompt?" This enables:

1. **Token savings measurement** — Compare average tokens in selected runs vs. baseline runs
2. **Performance comparison** — Compare response quality (duration, errors) between groups
3. **Continuous exploration** — All arms get data, even those excluded from selected runs

### How It Works

On each request, a coin flip (weighted by `baselineRate`) determines the run type:

- **Baseline run:** All arms included up to token budget. `isBaseline = true`.
- **Selected run:** Thompson Sampling chooses arms. `isBaseline = false`.

The `tokenSavingsPercent` metric compares average total tokens:

```
savings = ((baselineAvgTokens - selectedAvgTokens) / baselineAvgTokens) * 100
```

Positive savings means the learning layer is reducing token usage.

## Recommended Baseline Rates

| Inventory Size | Recommended Rate | Rationale |
|----------------|-----------------|-----------|
| 1-10 arms | 20% | Small inventory; each arm needs more data |
| 11-50 arms | 10% | Default balance |
| 50+ arms | 5% | Large inventory; selection provides more value |

Higher baseline rates provide better comparison data but reduce the optimization benefit (more runs use the full prompt).

## Next Steps

- [Thompson Sampling](thompson-sampling.md) — The selection algorithm
- [Core Concepts](../getting-started/concepts.md) — Arms, posteriors, phases
- [Configuration](../guides/configuration.md) — Tune baseline rate and priors
