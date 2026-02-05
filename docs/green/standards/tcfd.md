# TCFD Compliance

Guide for climate-related financial disclosures under TCFD recommendations.

## What is TCFD?

The [Task Force on Climate-related Financial Disclosures](https://www.fsb-tcfd.org/) provides recommendations for consistent climate-related financial risk disclosures. Many jurisdictions now require TCFD-aligned reporting.

## TCFD Pillars

TCFD organizes disclosures into four pillars:

1. **Governance** — Board and management oversight
2. **Strategy** — Climate risks and opportunities
3. **Risk Management** — Identification and management processes
4. **Metrics and Targets** — Emissions data and reduction targets

The Green module primarily supports **Metrics and Targets**.

## Metrics Requirements

TCFD recommends disclosing:

### Cross-Industry Metrics

| Metric | Green Module Support |
|--------|---------------------|
| Scope 1 emissions | N/A (direct emissions) |
| Scope 2 emissions | N/A (purchased energy) |
| Scope 3 emissions | ✅ Category 1 (AI inference) |
| Climate-related risks | ⚠️ Manual assessment needed |
| Climate-related opportunities | ⚠️ Manual assessment needed |

### Industry-Specific Metrics

For technology/software companies:

| Metric | Green Module Support |
|--------|---------------------|
| Energy consumption | ✅ Derived from factors |
| Carbon intensity per unit | ✅ Per token, per call |
| Emissions from cloud services | ✅ AI inference portion |

## Export Format

Generate TCFD-compliant export:

```bash
openclaw green export --format tcfd --period 2025 --baseline 2024
```

**Output Structure:**

```json
{
  "absoluteEmissions": {
    "scope3Cat1_tCO2eq": 0.01245,
    "reportingPeriod": "2025",
    "comparisonToBaseline": {
      "baseYear": 2024,
      "changePercent": 24.5
    }
  },
  "carbonIntensity": {
    "perMillionTokens_gCO2eq": 142.29,
    "perApiCall_gCO2eq": 6.74
  },
  "targets": [
    {
      "target": {
        "targetId": "target-123",
        "name": "Net Zero 2030",
        "baseYear": 2025,
        "targetYear": 2030,
        "targetReductionPercent": 50,
        "pathway": "1.5C"
      },
      "currentYearEmissionsGrams": 12450,
      "progressPercent": 75.1,
      "onTrack": true,
      "projectedEndYear": 2028
    }
  ],
  "historicalTrend": [
    { "period": "2025-Q1", "emissions_tCO2eq": 0.0028 },
    { "period": "2025-Q2", "emissions_tCO2eq": 0.0031 },
    { "period": "2025-Q3", "emissions_tCO2eq": 0.0033 },
    { "period": "2025-Q4", "emissions_tCO2eq": 0.0033 }
  ]
}
```

## Intensity Metrics

TCFD emphasizes intensity metrics for comparability:

### Per Million Tokens

```
Intensity = Total CO₂ (g) / Total Tokens (M)
```

Enables comparison across:
- Different time periods
- Different organizations
- Industry benchmarks

### Per API Call

```
Intensity = Total CO₂ (g) / Total Calls
```

Alternative metric tied to business activity.

## Uncertainty Disclosure

TCFD expects disclosure of data limitations:

```bash
openclaw green intensity
```

Shows uncertainty range (e.g., ±30%) based on data quality.

## Target Disclosure

TCFD recommends disclosing:

1. **Baseline year** and emissions
2. **Target year** and reduction goal
3. **Progress** toward target
4. **Methodology** for target setting

Set targets using SBTi framework:

```bash
openclaw green targets:add \
  --name "50% Reduction by 2030" \
  --base-year 2025 \
  --target-year 2030 \
  --reduction 50 \
  --pathway 1.5C
```

## Historical Trend

TCFD values trend data for understanding trajectory:

```json
"historicalTrend": [
  { "period": "2025-Q1", "emissions_tCO2eq": 0.0028 },
  { "period": "2025-Q2", "emissions_tCO2eq": 0.0031 },
  { "period": "2025-Q3", "emissions_tCO2eq": 0.0033 },
  { "period": "2025-Q4", "emissions_tCO2eq": 0.0033 }
]
```

Shows quarterly progression for the reporting period.

## Example Disclosure

### Metrics and Targets Section

```markdown
## Climate Metrics

### Greenhouse Gas Emissions

| Scope | 2024 | 2025 | Change |
|-------|------|------|--------|
| Scope 3 Cat 1 (AI) | 10.0 kg | 12.4 kg | +24% |

### Carbon Intensity

| Metric | 2024 | 2025 | Change |
|--------|------|------|--------|
| g CO₂e per M tokens | 140.2 | 142.3 | +1.5% |
| g CO₂e per API call | 6.67 | 6.74 | +1.0% |

Intensity metrics remained stable despite 24% growth in absolute
emissions, reflecting efficiency improvements from model selection
and caching strategies.

### Emission Reduction Targets

| Target | Base Year | Target Year | Reduction | Progress |
|--------|-----------|-------------|-----------|----------|
| Net Zero 2030 | 2025 | 2030 | 50% | On track |

We have set a science-based target aligned with the 1.5°C pathway
to reduce AI inference emissions 50% by 2030 from a 2025 baseline.

### Methodology and Limitations

Emissions calculated using per-token factors from academic research.
Data quality: Average secondary data (DQS 3).
Uncertainty: ±30%.

Limitations include lack of supplier-specific data and unknown
data center locations. We are engaging providers to improve data quality.
```

## Scenario Analysis

TCFD recommends scenario analysis for climate risks. For AI emissions:

### Physical Risks

- Data center cooling costs may increase
- Extreme weather may disrupt cloud services
- Water scarcity may constrain operations

### Transition Risks

- Carbon pricing may increase API costs
- Regulation may require provider transparency
- Customer demand for low-carbon AI may shift market

### Opportunities

- Efficient models reduce costs and emissions
- Carbon-aware scheduling optimizes timing
- Provider selection based on renewable energy

## Related Standards

- [GHG Protocol](ghg-protocol.md) — Emission calculation methodology
- [CDP](cdp-climate.md) — Aligned disclosure framework
- [SBTi](sbti-ict.md) — Target-setting methodology
