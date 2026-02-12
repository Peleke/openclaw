# Core Concepts

## Arms

An **arm** is any component that can be included or excluded from the agent's prompt. Each arm has a hierarchical ID in `type:category:id` format.

### Arm Types

| Type | Description | Example ID |
|------|-------------|------------|
| `tool` | Agent tools (Read, Write, Bash, etc.) | `tool:fs:Read` |
| `memory` | Memory entries loaded into context | `memory:project:auth-notes` |
| `skill` | Skill/plugin prompt sections | `skill:coding:main` |
| `file` | Workspace files in context | `file:workspace:README.md` |
| `section` | Structural prompt sections | `section:system:instructions` |

### Seed Arms

Some arms are **seed arms** — core tools that are never excluded by Thompson Sampling. The default seed set is:

| Arm ID | Description |
|--------|-------------|
| `tool:fs:Read` | Read files |
| `tool:fs:Write` | Write files |
| `tool:fs:Edit` | Edit files |
| `tool:exec:Bash` | Execute commands |
| `tool:fs:Glob` | Find files by pattern |
| `tool:fs:Grep` | Search file contents |

Seed arms are always included regardless of their posterior scores.

### Token Cost

Each arm has an estimated token cost based on its size in the prompt. Tools are estimated at `ceil(JSON.stringify(tool).length / 4)` tokens; files and skills use `ceil(content.length / 4)`.

## Posteriors

Each arm maintains a **posterior** — a Beta distribution that represents the system's belief about the arm's usefulness.

### Beta Distribution

A Beta(alpha, beta) distribution models the probability of success:

- **alpha** — Accumulated successes + prior
- **beta** — Accumulated failures + prior
- **mean** — `alpha / (alpha + beta)` — the expected usefulness score
- **variance** — Decreases as more data is collected

### Credible Intervals

Each posterior has a 95% credible interval `[lower, upper]` computed via normal approximation. Narrow intervals indicate high confidence; wide intervals indicate uncertainty.

### Confidence Levels

| Pulls | Confidence | Interpretation |
|-------|------------|---------------|
| < 5 | Low | Insufficient data; arm always included |
| 5-19 | Medium | Growing certainty; bandit may explore or exploit |
| 20+ | High | Strong signal; bandit relies on posterior mean |

## Run Traces

A **run trace** captures everything about a single agent request:

| Field | Description |
|-------|-------------|
| `traceId` | Unique trace identifier |
| `runId` | Run identifier (may span multiple traces) |
| `sessionId` | Session identifier |
| `timestamp` | Unix timestamp (ms) |
| `provider` | AI provider (e.g., `"anthropic"`) |
| `model` | Model name (e.g., `"claude-sonnet-4"`) |
| `isBaseline` | Whether this was a full-prompt baseline run |
| `arms` | Array of arm outcomes (included, referenced, tokenCost) |
| `usage` | Token usage (input, output, cacheRead, total) |
| `durationMs` | Request duration in milliseconds |

### Arm Outcomes

Each arm in a trace has an outcome:

- **included: true, referenced: true** — Arm was in the prompt and the model used it (reward = 1.0)
- **included: true, referenced: false** — Arm was in the prompt but not used (reward = 0.0)
- **included: false** — Arm was excluded; no reward update (counterfactual not observed)

## Thompson Sampling

Thompson Sampling is a Bayesian approach to the multi-armed bandit problem. Instead of always picking the arm with the highest average score, it **samples** from each arm's posterior distribution and selects based on the samples.

This naturally balances:

- **Exploitation** — Arms with high posteriors are sampled high more often
- **Exploration** — Uncertain arms occasionally sample high, getting included for more data

See [Thompson Sampling Theory](../theory/thompson-sampling.md) for the full algorithm and comparison with alternatives.

## Two Phases

### Passive Phase

In passive mode, the learning layer **observes but does not act**:

- All arms are included in every run
- Traces are recorded with arm outcomes
- Posteriors are maintained (in active mode) or available for analysis
- No impact on agent behavior

This is the default and is safe to leave on indefinitely.

### Active Phase

In active mode, the learning layer **optimizes prompt composition**:

- Thompson Sampling selects arms within the token budget
- Seed arms and underexplored arms (fewer than `minPulls` observations) are always included
- Baseline runs (configurable rate) use the full prompt for comparison
- Posteriors are updated after each run

#### Excluded-Tools Guidance

When Thompson Sampling excludes tools from a run, the system injects guidance into the model's system prompt listing which tools are currently unavailable. This means the model can explain to users when a requested capability is temporarily excluded, rather than silently producing an empty or confused response.

**When to switch to active:**

- You have 50+ traces (enough data for meaningful posteriors)
- You want to start saving tokens
- You've reviewed the dashboard and understand which arms are high/low value

## Baseline Runs

A fraction of runs (default 10%) use the **full prompt** — all arms included, no Thompson Sampling selection. These baseline runs enable:

1. **Counterfactual evaluation** — Compare optimized runs against full-prompt performance
2. **Continuous data collection** — All arms get occasional observations, preventing stale posteriors
3. **Drift detection** — If baseline performance changes, the system can detect shifting arm relevance

Baseline rate is configurable via `baselineRate`. Recommended rates depend on inventory size:

| Arm Count | Recommended Rate |
|-----------|-----------------|
| 1-10 | 20% |
| 11-50 | 10% |
| 50+ | 5% |

## Reference Detection

After each run, the learning layer checks whether each included arm was actually **referenced** by the model's output. Detection logic varies by arm type:

| Arm Type | Detection Method |
|----------|-----------------|
| `tool` | Tool name appears in tool call metadata |
| `skill` | Skill name mentioned in output or tool metadata |
| `file` | Filename appears in assistant text |
| `memory` | Substring (20+ chars) of memory content appears in output |
| `section` | Always considered referenced when included |

A reference means the model found the arm useful — this drives the reward signal (referenced = 1.0, not referenced = 0.0).

## Next Steps

- [Quick Start](quick-start.md) — See these concepts in action
- [Thompson Sampling](../theory/thompson-sampling.md) — Full algorithm details
- [Reward Model](../theory/reward-model.md) — How rewards and priors work
