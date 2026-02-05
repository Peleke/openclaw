# Export Format Reference

Detailed specifications for all export formats.

## JSON Export

Raw data export for custom analysis.

### Command

```bash
openclaw green export --format json --limit 1000
```

### Schema

```json
{
  "summary": {
    "traceCount": 1847,
    "totalCo2Grams": 12450.5,
    "totalWaterMl": 156000,
    "avgCo2PerTrace": 6.74,
    "avgConfidence": 0.32,
    "totalTokens": 87500000,
    "intensityPerMillionTokens": 142.29,
    "intensityPerQuery": 6.74,
    "byProvider": {
      "anthropic": {
        "traces": 1500,
        "co2Grams": 10200.3,
        "waterMl": 128000,
        "tokens": 72000000
      }
    },
    "byModel": {
      "claude-sonnet-4": {
        "traces": 1200,
        "co2Grams": 8100.2,
        "waterMl": 102000,
        "tokens": 58000000,
        "avgCo2PerTrace": 6.75
      }
    }
  },
  "traces": [
    {
      "traceId": "abc-123",
      "runId": "run-456",
      "timestamp": 1706918400000,
      "provider": "anthropic",
      "model": "claude-sonnet-4",
      "inputTokens": 1500,
      "outputTokens": 500,
      "cacheReadTokens": 0,
      "inputCo2Grams": 0.225,
      "outputCo2Grams": 0.225,
      "cacheCo2Grams": 0,
      "totalCo2Grams": 0.45,
      "waterMl": 6,
      "confidence": 0.3,
      "gridCarbonUsed": 400,
      "scope": 3,
      "category": 1,
      "calculationMethod": "average-data",
      "dataQualityScore": 3
    }
  ],
  "total": 1847
}
```

## GHG Protocol Export

For Scope 3 Category 1 reporting under GHG Protocol Corporate Standard.

### Command

```bash
openclaw green export --format ghg-protocol --period 2025-Q1
```

### Schema

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

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `reportingPeriod` | string | Period covered (year, quarter, month) |
| `organizationalBoundary` | string | Boundary approach description |
| `emissions_tCO2eq` | number | Total emissions in metric tons |
| `calculationMethod` | string | GHG Protocol method used |
| `dataQuality` | string | Quality assessment |
| `uncertainty_percent` | number | Uncertainty range |
| `emissionFactorSources` | string[] | Factor data sources |

## CDP Export

For CDP Climate Change questionnaire Module 7.

### Command

```bash
openclaw green export --format cdp --period 2025
```

### Schema

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

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `reportingYear` | number | CDP reporting year |
| `methodology` | string | `hybrid`, `average-data`, etc. |
| `methodologyDescription` | string | Detailed methodology text |
| `dataQuality` | string | `measured`, `calculated`, `estimated` |
| `percentageCalculatedUsingPrimaryData` | number | % from supplier data |
| `intensity` | array | Normalized metrics for C7.9 |

## TCFD Export

For Task Force on Climate-related Financial Disclosures.

### Command

```bash
openclaw green export --format tcfd --period 2025 --baseline 2024
```

### Schema

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
        "baseYearEmissionsGrams": 50000,
        "targetYear": 2030,
        "targetReductionPercent": 50,
        "pathway": "1.5C",
        "createdAt": 1706918400000
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

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `absoluteEmissions` | object | Total emissions with comparison |
| `comparisonToBaseline` | object | Year-over-year change |
| `carbonIntensity` | object | Normalized metrics |
| `targets` | array | SBTi targets with progress |
| `historicalTrend` | array | Quarterly emissions history |

## Period Formats

All exports accept `--period` with these formats:

| Format | Example | Range |
|--------|---------|-------|
| Year | `2025` | Jan 1 - Dec 31 |
| Quarter | `2025-Q1` | Jan 1 - Mar 31 |
| Month | `2025-01` | Jan 1 - Jan 31 |

## Unit Conversions

### Grams to Tonnes

All exports use **metric tonnes** (tCO₂eq):

```
tonnes = grams / 1,000,000
```

### Confidence to Uncertainty

```
±15% for confidence ≥ 0.7
±30% for confidence ≥ 0.5
±50% for confidence ≥ 0.3
±100% for confidence < 0.3
```

## Validation

Exports are JSON-schema validated. Invalid data returns error:

```json
{
  "error": "Invalid period format",
  "code": "INVALID_PARAMS"
}
```

## Programmatic Access

Use API endpoints for programmatic export:

```bash
# GHG Protocol
curl "http://localhost:18789/__openclaw__/api/green/export/ghg-protocol?period=2025-Q1"

# CDP
curl "http://localhost:18789/__openclaw__/api/green/export/cdp?year=2025"

# TCFD
curl "http://localhost:18789/__openclaw__/api/green/export/tcfd?period=2025&baseYear=2024"
```
