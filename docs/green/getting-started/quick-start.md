# Quick Start

Get up and running with environmental impact tracking in 5 minutes.

## Prerequisites

- OpenClaw installed and configured
- Gateway running: `openclaw gateway run`

## 1. Generate Some Traces

Green tracking is automatic. Just use OpenClaw normally:

```bash
openclaw chat "Hello, world!"
```

Each request generates a carbon trace with provider, model, token counts, estimated CO2, water usage, and a confidence score.

Run a few more requests so there's data to look at:

```bash
openclaw chat "Explain the greenhouse effect in two sentences."
openclaw chat "What is a carbon offset?"
```

## 2. Check Your Impact

View your carbon footprint summary:

```bash
openclaw green status
```

When the gateway is reachable, this fetches live data from the gateway API. You should see output like:

```
Environmental Impact [PASSIVE]
  Grid carbon: 400 gCO2/kWh (default)  |  Confidence: low (32%)

  Carbon: 12.4 kg CO2eq    Water: 156 L    Requests: 1,847    Since: Jan 15

  ~ Driving 62 km  |  ~ 1,245 phone charges  |  ~ 1 tree for 20 hours

Provider Breakdown
  Anthropic    1,500 requests    10.2 kg CO2    (82%)
  OpenAI         347 requests     2.3 kg CO2    (18%)

Top Models (by total carbon)
  claude-sonnet-4     8.1 kg    (65%)
  gpt-4o-mini         2.3 kg    (18%)
  claude-haiku-4      1.1 kg     (9%)
```

## 3. Open the Dashboard

```bash
openclaw green dashboard
```

This prints a URL like:

```
Dashboard: http://localhost:18789/__openclaw__/api/green/dashboard
```

Open that URL in your browser. The gateway serves the dashboard HTML on-the-fly — no files are written to disk. You should see:

- **Summary cards** — Total CO2, water, request count, avg per request, confidence
- **Real-world equivalents** — Car km, phone charges, tree absorption days
- **Emissions over time** — Daily CO2 line chart
- **Provider breakdown** — Doughnut chart by provider
- **Intensity metrics** — TCFD per-million-tokens and per-query benchmarks
- **Recent traces** — Table of the last 20 requests

The dashboard auto-refreshes every 30 seconds.

## 4. Try a Remote Gateway

If your gateway is on a different host (sandbox, VM, remote server), use `--host` and `--port`:

```bash
openclaw green status --host 10.0.0.5 --port 9999
openclaw green dashboard --host 10.0.0.5 --port 9999
```

To avoid passing flags every time, set the `OPENCLAW_GATEWAY_HOST` environment variable:

```bash
export OPENCLAW_GATEWAY_HOST=10.0.0.5
openclaw green status
openclaw green dashboard
```

## 5. Verify Offline Fallback

If the gateway is unreachable, the CLI falls back to the local SQLite database:

```bash
# Point at a port where nothing is listening
openclaw green status --port 1

# Still works — uses the local DB at ~/.openclaw/green.db
```

This is useful for reviewing data when the gateway is down, or on a different machine from the gateway.

## 6. View Intensity Metrics

For TCFD-style carbon intensity reporting:

```bash
openclaw green intensity
```

```
Carbon Intensity Metrics (TCFD)

  Per million tokens: 142.50 gCO2eq
  Per API call:       6.7200 gCO2eq

  Uncertainty range:  70% - 130%
```

## 7. Export for Reporting

Generate reports for compliance frameworks:

```bash
# GHG Protocol format
openclaw green export --format ghg-protocol --period 2025-Q1

# CDP Climate format
openclaw green export --format cdp --period 2025

# TCFD format with baseline comparison
openclaw green export --format tcfd --period 2025 --baseline 2024
```

## 8. Set Reduction Targets (Optional)

Create SBTi-aligned emission reduction targets:

```bash
openclaw green targets:add \
  --name "Net Zero 2030" \
  --base-year 2025 \
  --target-year 2030 \
  --reduction 50 \
  --pathway 1.5C
```

Track progress:

```bash
openclaw green targets
```

## Learning Module

The Learning module follows the same patterns. If you have learning tracking enabled:

```bash
# View learning layer status (API-first, falls back to local DB)
openclaw learning status

# Open the learning dashboard
openclaw learning dashboard
```

Both commands support the same `--host` and `--port` options and `OPENCLAW_GATEWAY_HOST` environment variable.

## Next Steps

- [Core Concepts](concepts.md) — Understand traces, factors, confidence
- [Dashboard Guide](../guides/dashboard.md) — Dashboard sections, themes, troubleshooting
- [CLI Reference](../guides/cli-reference.md) — All commands documented
- [API Reference](../guides/api-reference.md) — REST API endpoints
- [Standards Compliance](../standards/ghg-protocol.md) — Reporting guides
