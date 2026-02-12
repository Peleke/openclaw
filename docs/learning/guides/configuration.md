# Configuration

## Basic Configuration

Add a `learning` section to `openclaw.json`:

```json
{
  "learning": {
    "enabled": true,
    "phase": "passive"
  }
}
```

## Full Configuration

```json
{
  "learning": {
    "enabled": true,
    "phase": "passive",
    "strategy": "thompson",
    "tokenBudget": 8000,
    "baselineRate": 0.10,
    "minPulls": 5
  }
}
```

## Option Reference

### `enabled`

| | |
|---|---|
| **Type** | `boolean` |
| **Default** | `true` |

Enable or disable the learning layer entirely. When disabled, no traces are recorded and no posteriors are updated.

### `phase`

| | |
|---|---|
| **Type** | `"passive" \| "active"` |
| **Default** | `"passive"` |

Controls whether the learning layer actively optimizes prompts.

- **`passive`** — Traces are recorded and posteriors are maintained, but all arms are included in every run. Safe to leave on indefinitely.
- **`active`** — Thompson Sampling selects which arms to include based on learned posteriors. Low-value arms may be excluded to save tokens.

### `strategy`

| | |
|---|---|
| **Type** | `"thompson"` |
| **Default** | `"thompson"` |

The selection strategy. Currently only Thompson Sampling is supported. Reserved for future strategies (e.g., LinUCB with contextual features).

### `tokenBudget`

| | |
|---|---|
| **Type** | `number` |
| **Default** | `8000` |

Maximum tokens allocated for prompt components (tools, skills, files). Arms are selected greedily within this budget, prioritizing seeds and underexplored arms.

**Reference values:**

| Budget | Use Case |
|--------|----------|
| `4000` | Minimal prompt, aggressive optimization |
| `8000` | Default balance |
| `16000` | Large tool inventories |
| `32000` | Very permissive, minimal exclusion |

### `baselineRate`

| | |
|---|---|
| **Type** | `number` (0.0 - 1.0) |
| **Default** | `0.10` |

Fraction of runs that use the full prompt (all arms included) for counterfactual evaluation. Higher rates provide better comparison data but reduce optimization gains.

**Recommended rates by inventory size:**

| Arm Count | Recommended Rate |
|-----------|-----------------|
| 1-10 | `0.20` (20%) |
| 11-50 | `0.10` (10%) |
| 50+ | `0.05` (5%) |

### `minPulls`

| | |
|---|---|
| **Type** | `number` |
| **Default** | `5` |

Arms with fewer than this many observations are always included (never excluded by Thompson Sampling). This ensures every arm gets enough data before the bandit can decide to drop it.

This value is forwarded to the qortex backend as an exploration floor. Even when the token budget is tight, arms below the `minPulls` threshold are guaranteed inclusion.

### `decayHalfLifeDays` (future)

| | |
|---|---|
| **Type** | `number` |
| **Default** | — |

Reserved for v0.0.2 temporal decay. Will allow posteriors to gradually forget old observations, adapting to changing tool relevance over time.

## Config Precedence

Configuration is resolved in this order (highest priority first):

1. **CLI flags** (e.g., `--host`, `--port`)
2. **Environment variables** (`OPENCLAW_GATEWAY_HOST`)
3. **`openclaw.json`** in project root
4. **Built-in defaults**

## Scenario Examples

### Minimal (Observe Only)

```json
{
  "learning": {
    "enabled": true,
    "phase": "passive"
  }
}
```

Leave all other options at defaults. Data accumulates silently.

### Passive with Conservative Budget

```json
{
  "learning": {
    "enabled": true,
    "phase": "passive",
    "tokenBudget": 4000,
    "minPulls": 10
  }
}
```

Useful for analysis: see what *would* be excluded with a tight budget, without actually excluding anything yet.

### Active with High Exploration

```json
{
  "learning": {
    "enabled": true,
    "phase": "active",
    "tokenBudget": 8000,
    "baselineRate": 0.20,
    "minPulls": 10
  }
}
```

More baseline runs and higher `minPulls` means the bandit explores longer before committing to exclusions.

### Active with Aggressive Optimization

```json
{
  "learning": {
    "enabled": true,
    "phase": "active",
    "tokenBudget": 4000,
    "baselineRate": 0.05,
    "minPulls": 3
  }
}
```

Tight budget, few baselines, quick convergence. Use when you have a large tool inventory and want fast token savings.

## Next Steps

- [CLI Reference](cli-reference.md) — All commands documented
- [Thompson Sampling](../theory/thompson-sampling.md) — How the selection strategy works
