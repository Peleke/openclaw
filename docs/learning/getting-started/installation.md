# Installation

The Learning module is built into OpenClaw and enabled by default. No additional installation is required.

## Verify Installation

Check that learning tracking is active:

```bash
openclaw learning status
```

You should see output like:

```
Learning Layer Status  [PASSIVE]
  Budget: 8,000  |  Baseline: 10%  |  Min pulls: 5

No traces recorded yet. Run some agent messages to start collecting data.
```

## Configuration

Learning can be configured in `openclaw.json`:

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

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the learning layer entirely |
| `phase` | string | `"passive"` | `"passive"` (observe only) or `"active"` (optimize prompts) |
| `strategy` | string | `"thompson"` | Selection strategy (only `"thompson"` currently) |
| `tokenBudget` | number | `8000` | Max tokens allocated for prompt components |
| `baselineRate` | number | `0.10` | Fraction of runs using full prompt for counterfactual evaluation |
| `minPulls` | number | `5` | Arms with fewer than N observations are always included |

## Phases

### Passive Mode (Default)

Traces all requests silently. Posteriors are recorded but **not used for selection** — every arm is included in every run. This is safe to leave on indefinitely and provides data for analysis without changing agent behavior.

### Active Mode

Same as passive, plus:

- Thompson Sampling selects which arms to include
- Low-value arms may be excluded to save tokens
- Baseline runs (configurable rate) still use the full prompt for comparison

Switch to active mode when you have enough data (typically 50+ traces) and want to start optimizing:

```json
{
  "learning": {
    "phase": "active"
  }
}
```

## Data Access

When the gateway is running, the CLI fetches live data from the gateway API. If the gateway is unreachable, it falls back to the local SQLite database.

### Database Location

Learning data is stored in SQLite at:

```
~/.openclaw/learning/learning.db
```

This database contains:

- `run_traces` — Per-request trace records with arm outcomes
- `arm_posteriors` — Beta distribution parameters for each arm

**Note:** When running in a sandboxed or remote gateway environment, the gateway's database may be at a different path than the host's. The CLI's API-first approach ensures you always see the gateway's live data regardless of filesystem layout.

## Next Steps

- [Quick Start](quick-start.md) — 8-step walkthrough
- [Configuration](../guides/configuration.md) — Advanced configuration options
