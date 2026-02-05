# GHG Protocol Compliance

Guide for reporting AI emissions under the GHG Protocol Corporate Standard.

## What is GHG Protocol?

The [Greenhouse Gas Protocol](https://ghgprotocol.org/) is the world's most widely used greenhouse gas accounting standard. It provides frameworks for organizations to measure and report their emissions.

## Classification

AI inference emissions fall under:

- **Scope 3**: Indirect emissions from value chain
- **Category 1**: Purchased Goods and Services

This classification applies because:
- You don't own the data centers (not Scope 1)
- You don't purchase the electricity directly (not Scope 2)
- The API service is a purchased good (Scope 3, Cat 1)

## Calculation Methods

GHG Protocol defines four methods for Scope 3, Category 1:

### 1. Supplier-Specific Method

Uses emissions data provided by the supplier (API provider).

**Status**: Not yet available — providers don't publish per-request emissions.

### 2. Hybrid Method

Combines supplier data with secondary data.

**Status**: Partially available — some providers publish aggregate data.

### 3. Average-Data Method

Uses industry-average emission factors.

**Status**: **Primary method** — OpenClaw uses academic research factors.

### 4. Spend-Based Method

Uses emissions per dollar spent.

**Status**: Available as fallback, but less accurate.

## Data Quality

GHG Protocol requires reporting data quality. OpenClaw maps confidence to the 5-point scale:

| DQS | Description | OpenClaw Confidence |
|-----|-------------|---------------------|
| 1 | Primary data from suppliers | ≥80% |
| 2 | Published secondary data | ≥60% |
| 3 | Average secondary data | ≥40% |
| 4 | Estimated data | ≥20% |
| 5 | Highly uncertain | <20% |

Most AI inference emissions are **DQS 3-4** (average-data method with research-based factors).

## Export Format

Generate GHG Protocol-compliant export:

```bash
openclaw green export --format ghg-protocol --period 2025-Q1
```

**Output Structure:**

```json
{
  "reportingPeriod": "2025-Q1",
  "organizationalBoundary": "Operational control - AI inference API usage",
  "scope3Category1": {
    "emissions_tCO2eq": 0.01245,
    "calculationMethod": "Average-data method using per-model emission factors",
    "dataQuality": "Good",
    "uncertainty_percent": 30,
    "emissionFactorSources": [
      "ML CO2 Impact Calculator (Lacoste et al., 2019)",
      "Cloud Carbon Footprint methodology",
      "CodeCarbon hardware measurements"
    ]
  }
}
```

## Required Disclosures

When reporting under GHG Protocol, disclose:

### 1. Organizational Boundary

```
Operational control approach. Emissions from AI inference
API calls made by [Organization] using third-party providers.
```

### 2. Operational Boundary

```
Scope 3, Category 1: Purchased Goods and Services
Sub-category: Cloud computing services (AI inference)
```

### 3. Calculation Methodology

```
Emissions calculated using average-data method with per-model
emission factors derived from academic research (Lacoste et al. 2019,
Patterson et al. 2022). Factors account for GPU power consumption
during inference with 3:1 output-to-input energy ratio.
```

### 4. Emission Factors

```
Per-token emission factors (gCO₂eq per million tokens):
- Input tokens: 30-400 depending on model size
- Output tokens: 90-1200 (3x input due to iterative generation)
- Cache reads: ~10% of input

Grid carbon intensity: [configured value] gCO₂/kWh
PUE factor: 1.2 (cloud data center assumption)
```

### 5. Data Quality Assessment

```
Data Quality Score: 3 (Average secondary data)
Confidence: [X]%
Uncertainty: ±[Y]%

Limitations:
- No supplier-specific data available
- Model architecture details not disclosed
- Data center locations unknown
```

## Verification

For third-party verification, provide:

1. **Raw trace data**: `openclaw green export --format json`
2. **Summary by period**: `openclaw green export --format ghg-protocol`
3. **Methodology documentation**: Link to this guide
4. **Factor sources**: Academic papers cited

## Example Report Section

```markdown
## Scope 3 Emissions - Category 1

### AI Inference Services

| Metric | Value | Unit |
|--------|-------|------|
| Total emissions | 12.45 | kg CO₂eq |
| API calls | 1,847 | count |
| Avg per call | 6.74 | g CO₂eq |
| Data quality | 3 | DQS (1-5) |
| Uncertainty | ±30% | |

**Methodology**: Average-data method using per-model emission
factors from academic research. Factors applied to token counts
from API responses.

**Emission factor sources**:
- Lacoste et al. (2019) "Quantifying the Carbon Emissions of Machine Learning"
- Patterson et al. (2022) "Carbon Emissions and Large Neural Network Training"
- CodeCarbon project hardware measurements

**Limitations**: No supplier-specific data. Estimates based on
model size heuristics and published research on similar architectures.
```

## Best Practices

1. **Report quarterly** — More granular than annual, catches trends
2. **Track by provider** — Different providers have different footprints
3. **Document assumptions** — Grid carbon, PUE, model mappings
4. **Update factors** — Check for new research/provider data annually
5. **Set targets** — Use SBTi framework for reduction commitments

## Related Standards

- [CDP Climate](cdp-climate.md) — Uses GHG Protocol as foundation
- [TCFD](tcfd.md) — Requires GHG Protocol-aligned disclosure
- [ISO 14064](iso-14064.md) — Compatible with GHG Protocol
- [SBTi](sbti-ict.md) — Targets based on GHG Protocol inventory
