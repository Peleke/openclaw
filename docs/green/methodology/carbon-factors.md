# Carbon Factors Methodology

How emission factors are derived for AI inference.

## Overview

Carbon factors define emissions per unit of activity:

```
CO₂ (grams) = tokens × factor (gCO₂/token)
```

OpenClaw provides per-model factors for major providers.

## Factor Structure

Each factor includes:

| Field | Unit | Description |
|-------|------|-------------|
| `inputCo2PerMillionTokens` | gCO₂eq | Input processing emissions |
| `outputCo2PerMillionTokens` | gCO₂eq | Output generation emissions |
| `cacheReadCo2PerMillionTokens` | gCO₂eq | Cache read emissions |
| `waterMlPerMillionTokens` | mL | Water for cooling |
| `confidence` | 0-1 | Data quality indicator |
| `source` | string | Factor derivation method |

## Derivation Methodology

### Step 1: Model Size Estimation

Estimate parameter count from model name and behavior:

| Model Class | Estimated Parameters |
|-------------|---------------------|
| Large (Opus, GPT-4) | 200B+ |
| Medium (Sonnet, GPT-4o) | 50-200B |
| Small (Haiku, Mini) | 7-20B |

### Step 2: Energy per Token

Based on academic research:

```
Energy (J/token) = f(parameters, architecture)
```

Key papers:
- Lacoste et al. (2019) — ML CO2 Impact methodology
- Patterson et al. (2022) — Large model training energy
- Luccioni et al. (2024) — Inference energy measurements

### Step 3: Output Multiplier

Output tokens require ~3x more energy than input:

```
output_factor = input_factor × 3
```

Rationale:
- Each output token requires full forward pass
- Input tokens can be batched/parallelized
- Autoregressive generation is inherently sequential

### Step 4: Grid Carbon

Convert energy to CO₂:

```
CO₂ = Energy × Grid_Carbon × PUE
```

Where:
- Grid carbon: gCO₂/kWh (default 400)
- PUE: Power Usage Effectiveness (default 1.2)

### Step 5: Cache Adjustment

Cache reads are ~10% of input processing:

```
cache_factor = input_factor × 0.1
```

## Default Factors

### Anthropic Models

| Model | Input | Output | Cache | Confidence |
|-------|-------|--------|-------|------------|
| claude-opus-4 | 400 | 1200 | 40 | 0.25 |
| claude-sonnet-4 | 150 | 450 | 15 | 0.30 |
| claude-haiku-4 | 30 | 90 | 3 | 0.35 |

### OpenAI Models

| Model | Input | Output | Cache | Confidence |
|-------|-------|--------|-------|------------|
| gpt-4o | 200 | 600 | 20 | 0.30 |
| gpt-4o-mini | 40 | 120 | 4 | 0.35 |
| o1 | 500 | 1500 | 50 | 0.20 |

### Fallback Factors

For unknown models:

| Size Class | Input | Output | Cache | Confidence |
|------------|-------|--------|-------|------------|
| Large | 300 | 900 | 30 | 0.15 |
| Small | 50 | 150 | 5 | 0.15 |

## Academic Sources

### Lacoste et al. (2019)

"Quantifying the Carbon Emissions of Machine Learning"

- Introduced ML CO2 Impact Calculator
- Established GPU power consumption baselines
- Provided training-to-inference scaling

### Patterson et al. (2022)

"Carbon Emissions and Large Neural Network Training"

- Measured large model training energy
- Documented efficiency improvements over time
- Provided parameter-to-energy relationships

### Luccioni et al. (2024)

"Power Hungry Processing: Watts Driving the Cost of AI Deployment"

- Direct inference measurements
- Compared model architectures
- Quantified efficiency variations

### Li et al. (2023)

"Making AI Less Thirsty"

- Water consumption analysis
- Cooling requirements
- Regional variations

## Assumptions

### Hardware

- Modern inference hardware (H100/A100 class)
- Mixed precision (FP16/BF16) inference
- Typical batch sizes

### Infrastructure

- Cloud data center
- PUE 1.2 (hyperscaler average)
- Shared infrastructure (not dedicated)

### Grid Carbon

- Default: 400 gCO₂/kWh (world average)
- Configurable per deployment
- Future: Real-time regional data

## Limitations

### No Supplier Data

Providers don't publish per-request emissions. Factors are estimates.

### Architecture Unknown

Exact model architectures aren't disclosed. Estimates use heuristics.

### Location Unknown

Data center locations (and thus grid carbon) unknown. Uses averages.

### Efficiency Changes

Hardware and software improvements change factors over time.

## Factor Updates

Factors should be reviewed:

1. **Annually** — New research and measurements
2. **On model release** — New models may have different efficiency
3. **On provider disclosure** — If providers publish data

## Custom Factors

Override factors with better data:

```json
{
  "green": {
    "factorOverrides": {
      "anthropic:claude-sonnet-4": {
        "inputCo2PerMillionTokens": 120,
        "outputCo2PerMillionTokens": 360,
        "confidence": 0.6,
        "source": "measured"
      }
    }
  }
}
```

## Future Improvements

### Supplier-Specific Data

If providers publish emission factors:
- `confidence` → 0.8+
- `source` → "supplier-specific"

### Real-Time Grid Carbon

With Electricity Maps API:
- Regional grid intensity
- Time-of-day variations
- Renewable energy tracking

### Hardware-Specific Factors

Different hardware has different efficiency:
- TPU vs GPU
- Inference-optimized chips
- Quantized models
