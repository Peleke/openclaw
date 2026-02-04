# Confidence Scoring Methodology

How data quality is assessed and communicated.

## Overview

Every emission estimate includes a **confidence score** (0.0–1.0) indicating data quality. This enables:

- Transparent uncertainty communication
- Prioritization of data improvement efforts
- Compliance with reporting standards

## Confidence Scale

| Score | Label | Meaning |
|-------|-------|---------|
| 0.8–1.0 | Very High | Primary data from supplier |
| 0.6–0.8 | High | Published secondary data |
| 0.4–0.6 | Medium | Research-based estimates |
| 0.2–0.4 | Low | Model extrapolation |
| 0.0–0.2 | Very Low | Fallback estimates |

## Factor Sources

Confidence depends on how factors were derived:

| Source | Typical Confidence | Description |
|--------|-------------------|-------------|
| `measured` | 0.8+ | Direct measurement by provider |
| `research` | 0.5–0.7 | Academic research on similar models |
| `estimated` | 0.3–0.5 | Extrapolation from model characteristics |
| `fallback` | 0.1–0.2 | Generic estimate for unknown models |

## Calculation

### Per-Trace Confidence

Each trace inherits the factor's confidence:

```
trace.confidence = factor.confidence
```

### Aggregated Confidence

Summary confidence is token-weighted average:

```
avg_confidence = Σ(trace.confidence × trace.totalTokens) / Σ(trace.totalTokens)
```

Weighting by tokens ensures high-volume models dominate the average.

## GHG Protocol Mapping

Confidence maps to GHG Protocol Data Quality Score (DQS):

| Confidence | DQS | GHG Protocol Description |
|------------|-----|--------------------------|
| ≥0.8 | 1 | Primary data from suppliers |
| ≥0.6 | 2 | Published secondary data |
| ≥0.4 | 3 | Average secondary data |
| ≥0.2 | 4 | Estimated data |
| <0.2 | 5 | Highly uncertain |

```typescript
function confidenceToDataQuality(confidence: number): 1 | 2 | 3 | 4 | 5 {
  if (confidence >= 0.8) return 1;
  if (confidence >= 0.6) return 2;
  if (confidence >= 0.4) return 3;
  if (confidence >= 0.2) return 4;
  return 5;
}
```

## Uncertainty Conversion

For ISO 14064 reporting, confidence converts to uncertainty bounds:

| Confidence | Uncertainty | Range |
|------------|-------------|-------|
| ≥0.7 | ±15% | 85%–115% |
| ≥0.5 | ±30% | 70%–130% |
| ≥0.3 | ±50% | 50%–150% |
| <0.3 | ±100% | 0%–200% |

```typescript
function confidenceToUncertainty(confidence: number): { lower: number; upper: number } {
  if (confidence >= 0.7) return { lower: 0.85, upper: 1.15 };
  if (confidence >= 0.5) return { lower: 0.70, upper: 1.30 };
  if (confidence >= 0.3) return { lower: 0.50, upper: 1.50 };
  return { lower: 0.00, upper: 2.00 };
}
```

## Display

### CLI Output

```
Environmental Impact [PASSIVE]
  Grid carbon: 400 gCO₂/kWh (default)  |  Confidence: low (32%)
```

### Dashboard

Confidence shown as colored badge:
- 🟢 High (≥60%)
- 🟡 Medium (≥40%)
- 🔴 Low (<40%)

### Export

All exports include confidence/DQS fields:

```json
{
  "confidence": 0.32,
  "dataQualityScore": 4,
  "uncertainty_percent": 50
}
```

## Improving Confidence

### 1. Provider Data

If a provider publishes emission data:
- Update factor with new values
- Set `source: "measured"`
- Increase confidence to 0.8+

### 2. Academic Research

When new research available:
- Validate against existing factors
- Update if significant difference
- Document source

### 3. Direct Measurement

For dedicated deployments:
- Measure actual power consumption
- Apply real grid carbon
- Set confidence to 0.9+

## Current Status

Most AI providers don't publish per-request emissions:

| Provider | Data Available | Typical Confidence |
|----------|----------------|-------------------|
| Anthropic | No | 0.25–0.35 |
| OpenAI | No | 0.25–0.35 |
| Google | Partial | 0.35–0.45 |
| Others | No | 0.15–0.25 |

## Confidence Philosophy

### Conservative by Default

When uncertain, we overestimate emissions:
- Larger model size assumptions
- Higher energy per token
- Average (not clean) grid carbon

This ensures reported emissions are **upper bounds**.

### Transparent Uncertainty

Users always know data quality:
- Confidence displayed prominently
- Uncertainty ranges in exports
- Methodology documentation

### Continuous Improvement

Track confidence over time:
- Annual factor review
- Provider engagement
- Research monitoring
