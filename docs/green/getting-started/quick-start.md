# Quick Start

Get up and running with environmental impact tracking in 5 minutes.

## 1. Run Some Requests

Green tracking is automatic. Just use OpenClaw normally:

```bash
openclaw chat "Hello, world!"
```

Each request generates a carbon trace with:
- Provider and model used
- Token counts (input, output, cache)
- Estimated CO₂ emissions
- Estimated water usage
- Confidence score

## 2. Check Your Impact

View your carbon footprint summary:

```bash
openclaw green status
```

Output:

```
Environmental Impact [PASSIVE]
  Grid carbon: 400 gCO₂/kWh (default)  |  Confidence: low (32%)

  Carbon: 12.4 kg CO₂eq    Water: 156 L    Requests: 1,847    Since: Jan 15

  ≈ Driving 62 km  |  ≈ 1,245 phone charges  |  ≈ 1 tree for 20 hours

Provider Breakdown
  Anthropic    1,500 requests    10.2 kg CO₂    (82%)
  OpenAI         347 requests     2.3 kg CO₂    (18%)

Top Models (by total carbon)
  claude-sonnet-4     8.1 kg    (65%)
  gpt-4o-mini         2.3 kg    (18%)
  claude-haiku-4      1.1 kg     (9%)
```

## 3. View Intensity Metrics

For TCFD-style reporting:

```bash
openclaw green intensity
```

Output:

```
Carbon Intensity Metrics (TCFD)

  Per million tokens: 142.50 gCO₂eq
  Per API call:       6.7200 gCO₂eq

  Uncertainty range:  70% - 130%
```

## 4. View in Dashboard

Open the Gateway UI and navigate to the **Green** tab:

1. Start the gateway: `openclaw gateway run`
2. Open http://localhost:18789
3. Click the **Green** tab (leaf icon)

The dashboard shows:
- Summary cards (total CO₂, water, avg per request)
- Provider breakdown
- Model efficiency comparison
- Intensity metrics

## 5. Export for Reporting

Generate reports for compliance frameworks:

```bash
# GHG Protocol format
openclaw green export --format ghg-protocol --period 2025-Q1

# CDP Climate format
openclaw green export --format cdp --period 2025

# TCFD format with baseline comparison
openclaw green export --format tcfd --period 2025 --baseline 2024
```

## 6. Set Reduction Targets (Optional)

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

## Next Steps

- [Core Concepts](concepts.md) — Understand the data model
- [CLI Reference](../guides/cli-reference.md) — All commands documented
- [Standards Compliance](../standards/ghg-protocol.md) — Reporting guides
