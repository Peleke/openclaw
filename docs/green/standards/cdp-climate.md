# CDP Climate Compliance

Guide for reporting AI emissions in CDP Climate Change questionnaire.

## What is CDP?

[CDP](https://www.cdp.net/) (formerly Carbon Disclosure Project) runs the global environmental disclosure system. Companies report emissions through annual questionnaires, which are scored and published.

## Relevant Module

AI inference emissions belong in:

**Module 7: Emissions Breakdown**
- Section: Scope 3 emissions
- Category: Category 1 (Purchased goods and services)

## Export Format

Generate CDP-compliant export:

```bash
openclaw green export --format cdp --period 2025
```

**Output Structure:**

```json
{
  "reportingYear": 2025,
  "scope3": {
    "category1": {
      "emissions_tCO2eq": 0.01245,
      "methodology": "hybrid",
      "methodologyDescription": "Per-token emission factors estimated from academic research (Lacoste et al. 2019, Patterson et al. 2022) with conservative fallbacks. Factors account for GPU power consumption during inference with 3:1 output-to-input energy ratio.",
      "dataQuality": "calculated",
      "percentageCalculatedUsingPrimaryData": 0,
      "emissionFactorSources": [
        "ML CO2 Impact Calculator (Lacoste et al., 2019)",
        "Cloud Carbon Footprint methodology",
        "CodeCarbon hardware measurements"
      ]
    }
  },
  "intensity": [
    {
      "metric": "CO2 per million tokens",
      "value": 142.29,
      "unit": "gCO2eq/1M tokens"
    },
    {
      "metric": "CO2 per API call",
      "value": 6.74,
      "unit": "gCO2eq/call"
    }
  ]
}
```

## CDP Questions Mapping

### C6.5 - Scope 3 Emissions by Category

| Field | Response |
|-------|----------|
| Category | Category 1: Purchased goods and services |
| Scope 3 emissions (metric tons CO2e) | [from export] |
| Percentage calculated using primary data | 0% |
| Explanation | AI inference API services |

### C6.5a - Scope 3 Category 1 Details

| Field | Response |
|-------|----------|
| Description of activity | AI inference API calls to cloud providers |
| Emission factor used | Per-token factors from academic research |
| Emission factor source | Lacoste et al. 2019, Patterson et al. 2022 |
| Methodology | Hybrid method |

### C7.9 - Intensity Metrics

| Field | Response |
|-------|----------|
| Intensity figure | [intensityPerMillionTokens] |
| Metric numerator | Metric tons CO2e |
| Metric denominator | Million tokens processed |
| Scope(s) | Scope 3 |

## Data Quality Mapping

CDP uses different terminology than GHG Protocol:

| CDP Term | Description | OpenClaw Confidence |
|----------|-------------|---------------------|
| Measured | Direct measurement | N/A (not available) |
| Calculated | Calculated from activity data | ≥50% |
| Estimated | Estimated from proxies | <50% |

Most AI emissions are **calculated** (activity data = tokens × factors).

## Intensity Metrics

CDP requests emissions intensity metrics. OpenClaw provides:

1. **Per million tokens** — Standard for AI workloads
2. **Per API call** — Alternative activity metric

These enable year-over-year comparison even as usage grows.

## Methodology Description

Use this template for CDP methodology disclosure:

```
AI inference emissions are calculated using the hybrid method
combining secondary emission factors with activity data (token counts).

Per-model emission factors are derived from:
- Academic research on ML energy consumption (Lacoste et al. 2019)
- Published hardware power measurements (CodeCarbon project)
- Model size heuristics based on published architectures

Factors account for:
- GPU power consumption during inference
- 3:1 output-to-input energy ratio (iterative generation)
- Data center PUE of 1.2 (cloud provider average)
- Grid carbon intensity of [X] gCO2/kWh

Limitations:
- No supplier-specific emission data available
- Model architectures not fully disclosed by providers
- Data center locations and energy sources unknown
```

## Scoring Considerations

CDP scores responses based on:

1. **Completeness** — Report all material categories
2. **Transparency** — Disclose methodology and limitations
3. **Ambition** — Set and track reduction targets
4. **Leadership** — Engage suppliers, improve data quality

To improve score:
- Report every year consistently
- Set SBTi-aligned targets (see [SBTi Guide](sbti-ict.md))
- Document efforts to obtain supplier-specific data
- Show year-over-year progress

## Supplier Engagement

CDP encourages engaging suppliers for better data. For AI providers:

1. **Request** emissions data through official channels
2. **Document** attempts and responses
3. **Collaborate** on methodology improvements
4. **Advocate** for provider transparency

## Example Disclosure

```markdown
## Scope 3, Category 1: AI Services

We use third-party AI inference APIs for [use case].
Emissions are calculated using per-token factors from academic
research, as providers do not yet disclose per-request emissions.

| Metric | 2024 | 2025 | Change |
|--------|------|------|--------|
| Emissions (tCO2e) | 0.010 | 0.012 | +20% |
| API calls | 1,500 | 1,847 | +23% |
| Intensity (g/call) | 6.67 | 6.74 | +1% |

Intensity remained stable despite usage growth, indicating
efficiency improvements from model selection.

**Data quality**: Calculated (hybrid method)
**Uncertainty**: ±30%

We are engaging AI providers to obtain supplier-specific
emission factors and improve data quality.
```

## Related Standards

- [GHG Protocol](ghg-protocol.md) — Foundation for CDP reporting
- [TCFD](tcfd.md) — CDP aligns with TCFD recommendations
- [SBTi](sbti-ict.md) — Targets recognized by CDP
