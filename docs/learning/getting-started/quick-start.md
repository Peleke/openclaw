# Quick Start

Get up and running with learning layer observability in 5 minutes.

## Prerequisites

- OpenClaw installed and configured
- Gateway running: `openclaw gateway run`

## 1. Generate Some Traces

Learning tracking is automatic. Just use OpenClaw normally:

```bash
openclaw chat "Hello, world!"
```

Each request generates a run trace with arm outcomes, token usage, and reference detection. Run a few more requests so there's data to look at:

```bash
openclaw chat "List the files in the current directory."
openclaw chat "Read the README and summarize it."
openclaw chat "What tests exist in this project?"
```

## 2. Check Status

View the learning layer summary:

```bash
openclaw learning status
```

When the gateway is reachable, this fetches live data from the gateway API. You should see output like:

```
Learning Layer Status  [PASSIVE]
  Budget: 8,000  |  Baseline: 10%  |  Min pulls: 5

  Traces: 4    Arms: 12    Tokens: 18,400    Range: 2/5/2025 – 2/5/2025

Run Distribution
  Baseline: 1 (25.0%)    Selected: 3 (75.0%)

Top Arms (highest posterior mean)
  Arm               Mean     Pulls    Last Updated
  tool:fs:Read      0.800       3     2/5/2025
  tool:exec:Bash    0.750       2     2/5/2025
  tool:fs:Glob      0.750       2     2/5/2025
  tool:fs:Grep      0.750       2     2/5/2025
  tool:fs:Edit      0.750       1     2/5/2025
```

## 3. Open the Dashboard

```bash
openclaw learning dashboard
```

This prints a URL like:

```
Dashboard: http://localhost:18789/__openclaw__/api/learning/dashboard
```

Open that URL in your browser. The gateway serves the dashboard HTML on-the-fly — no files are written to disk. You should see:

- **Summary cards** — Traces, arms, total tokens, token savings, date range
- **Convergence chart** — Per-arm posterior means over time
- **Baseline vs Selected** — Bar chart comparing token usage and duration
- **Token usage over time** — Area chart of average tokens per run
- **Run distribution** — Doughnut chart of baseline vs. selected runs
- **Reference heatmap** — Visual grid of arm outcomes across traces
- **Posteriors table** — All arms with means, credible intervals, and confidence

The dashboard auto-refreshes every 30 seconds.

## 4. Explore Posteriors via API

Query the API directly for programmatic access:

```bash
curl http://localhost:18789/__openclaw__/api/learning/posteriors | python3 -m json.tool
```

```json
[
  {
    "armId": "tool:fs:Read",
    "alpha": 5.0,
    "beta": 2.0,
    "mean": 0.714,
    "pulls": 4,
    "lastUpdated": 1707091200000,
    "isSeed": true,
    "isUnderexplored": true,
    "credibleInterval": { "lower": 0.382, "upper": 1.0 },
    "confidence": "low"
  }
]
```

## 5. View Baseline Comparison

Check how optimized runs compare to full-prompt baselines:

```bash
curl http://localhost:18789/__openclaw__/api/learning/summary | python3 -m json.tool
```

The `baseline` object shows:

- `baselineAvgTokens` — Average tokens when using the full prompt
- `selectedAvgTokens` — Average tokens with Thompson Sampling selection
- `tokenSavingsPercent` — Positive means you're saving tokens

## 6. Switch to Active Mode

Once you have enough traces (50+ recommended), enable active optimization:

Edit `openclaw.json`:

```json
{
  "learning": {
    "phase": "active"
  }
}
```

Restart the gateway. Now Thompson Sampling will select which arms to include based on learned posteriors. The status badge changes to `[ACTIVE]`:

```bash
openclaw learning status
```

```
Learning Layer Status  [ACTIVE]
  Budget: 8,000  |  Baseline: 10%  |  Min pulls: 5
  ...
```

## 7. Monitor Token Savings

After switching to active mode, watch the token savings grow:

```bash
openclaw learning status
```

Look for the `Token Savings` line:

```
  Token Savings: +12.3% (baseline avg: 5200, selected avg: 4560)
```

Positive savings means the learning layer is successfully reducing token usage by excluding low-value prompt components.

## 8. Export Data

Export traces and posteriors for offline analysis:

```bash
# JSON export
openclaw learning export --format json > learning-data.json

# CSV export
openclaw learning export --format csv > learning-data.csv

# Posteriors only
openclaw learning export --format json --no-traces
```

## Learning Module + Green Module

Both modules follow the same patterns. If you also have Green tracking enabled:

```bash
# Both use the same --host/--port options
openclaw green status
openclaw learning status

# Both support the OPENCLAW_GATEWAY_HOST environment variable
export OPENCLAW_GATEWAY_HOST=10.0.0.5
openclaw green dashboard
openclaw learning dashboard
```

## Next Steps

- [Core Concepts](concepts.md) — Understand arms, posteriors, phases
- [Dashboard Guide](../guides/dashboard.md) — Dashboard sections, themes, troubleshooting
- [CLI Reference](../guides/cli-reference.md) — All commands documented
- [API Reference](../guides/api-reference.md) — REST API endpoints
- [Thompson Sampling](../theory/thompson-sampling.md) — How the bandit algorithm works
