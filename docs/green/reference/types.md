# Type Definitions

TypeScript types for the Green module.

## Configuration

### GreenConfig

Main configuration type:

```typescript
type GreenConfig = {
  /** Enable environmental tracking. Default: true */
  enabled?: boolean;

  /** Tracking mode. Default: "passive" */
  mode?: "disabled" | "passive" | "active";

  /** Override carbon factors for specific providers/models */
  factorOverrides?: Record<string, Partial<CarbonFactor>>;

  /** Default grid carbon intensity (gCO₂/kWh). Default: 400 */
  defaultGridCarbon?: number;

  /** Alert threshold (grams CO₂ per day). Default: null */
  dailyAlertThreshold?: number;

  /** Include in CLI status output. Default: true */
  showInStatus?: boolean;
};
```

## Carbon Factors

### CarbonFactor

Emission factor for a provider/model:

```typescript
type CarbonFactor = {
  provider: string;
  model: string;
  inputCo2PerMillionTokens: number;
  outputCo2PerMillionTokens: number;
  cacheReadCo2PerMillionTokens: number;
  waterMlPerMillionTokens: number;
  confidence: number;
  source: CarbonFactorSource;
  lastUpdated?: number;
};
```

### CarbonFactorSource

How the factor was derived:

```typescript
type CarbonFactorSource = "measured" | "research" | "estimated" | "fallback";
```

| Value | Description |
|-------|-------------|
| `measured` | Direct measurement from provider |
| `research` | Academic research data |
| `estimated` | Extrapolated from similar models |
| `fallback` | Generic estimate |

## Carbon Traces

### CarbonTrace

Per-request emission record:

```typescript
type CarbonTrace = {
  traceId: string;
  runId: string;
  sessionId?: string;
  timestamp: number;
  provider: string;
  model: string;

  // Token counts
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;

  // Calculated emissions (grams)
  inputCo2Grams: number;
  outputCo2Grams: number;
  cacheCo2Grams: number;
  totalCo2Grams: number;

  // Water usage (milliliters)
  waterMl: number;

  // Data quality
  confidence: number;
  gridCarbonUsed: number;

  // GHG Protocol compliance
  scope: 3;
  category: 1;
  calculationMethod: CalculationMethod;
  dataQualityScore: 1 | 2 | 3 | 4 | 5;

  // Optional regional data
  region?: string;
  regionGridCarbon?: number;
};
```

### CalculationMethod

GHG Protocol calculation method:

```typescript
type CalculationMethod =
  | "supplier-specific"
  | "hybrid"
  | "average-data"
  | "spend-based";
```

## Summaries

### CarbonSummary

Aggregated emission data:

```typescript
type CarbonSummary = {
  traceCount: number;
  totalCo2Grams: number;
  totalWaterMl: number;
  avgCo2PerTrace: number;
  avgConfidence: number;

  // TCFD intensity metrics
  totalTokens: number;
  intensityPerMillionTokens: number;
  intensityPerQuery: number;

  // ISO 14064 uncertainty
  uncertaintyLower: number;
  uncertaintyUpper: number;

  // Breakdown
  byProvider: Record<string, ProviderSummary>;
  byModel: Record<string, ModelSummary>;

  // Time range
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
};
```

### ProviderSummary

Per-provider aggregation:

```typescript
type ProviderSummary = {
  traces: number;
  co2Grams: number;
  waterMl: number;
  tokens: number;
};
```

### ModelSummary

Per-model aggregation:

```typescript
type ModelSummary = {
  traces: number;
  co2Grams: number;
  waterMl: number;
  tokens: number;
  avgCo2PerTrace: number;
};
```

## Targets

### CarbonTarget

SBTi emission reduction target:

```typescript
type CarbonTarget = {
  targetId: string;
  name: string;
  baseYear: number;
  baseYearEmissionsGrams: number;
  targetYear: number;
  targetReductionPercent: number;
  pathway: "1.5C" | "well-below-2C" | "2C";
  createdAt: number;
};
```

### TargetProgress

Progress toward a target:

```typescript
type TargetProgress = {
  target: CarbonTarget;
  currentYearEmissionsGrams: number;
  progressPercent: number;
  onTrack: boolean;
  projectedEndYear: number | null;
};
```

## Export Types

### GhgProtocolExport

GHG Protocol reporting format:

```typescript
type GhgProtocolExport = {
  reportingPeriod: string;
  organizationalBoundary: string;
  scope3Category1: {
    emissions_tCO2eq: number;
    calculationMethod: string;
    dataQuality: string;
    uncertainty_percent: number;
    emissionFactorSources: string[];
  };
};
```

### CdpExport

CDP Climate reporting format:

```typescript
type CdpExport = {
  reportingYear: number;
  scope3: {
    category1: {
      emissions_tCO2eq: number;
      methodology: string;
      methodologyDescription: string;
      dataQuality: "measured" | "calculated" | "estimated";
      percentageCalculatedUsingPrimaryData: number;
      emissionFactorSources: string[];
    };
  };
  intensity: Array<{
    metric: string;
    value: number;
    unit: string;
  }>;
};
```

### TcfdExport

TCFD reporting format:

```typescript
type TcfdExport = {
  absoluteEmissions: {
    scope3Cat1_tCO2eq: number;
    reportingPeriod: string;
    comparisonToBaseline?: {
      baseYear: number;
      changePercent: number;
    };
  };
  carbonIntensity: {
    perMillionTokens_gCO2eq: number;
    perApiCall_gCO2eq: number;
  };
  targets?: TargetProgress[];
  historicalTrend: Array<{
    period: string;
    emissions_tCO2eq: number;
  }>;
};
```

### Iso14064Export

ISO 14064 reporting format:

```typescript
type Iso14064Export = {
  standard: "ISO 14064-1:2018";
  reportingPeriod: {
    start: string;
    end: string;
  };
  organizationalBoundary: {
    approach: "operational_control" | "financial_control" | "equity_share";
    entities: string[];
  };
  operationalBoundary: {
    scope3: {
      category1: {
        included: boolean;
        sources: string[];
      };
    };
  };
  quantificationMethodology: {
    method: "calculation" | "measurement";
    activityData: string;
    emissionFactors: string;
    globalWarmingPotentials: string;
  };
  uncertainty: {
    method: string;
    overallUncertainty_percent: number;
  };
  emissions: {
    scope3Cat1_tCO2eq: number;
    uncertainty_tCO2eq: number;
  };
};
```

## Equivalents

### CarbonEquivalents

Relatable comparisons:

```typescript
type CarbonEquivalents = {
  carKm: number;
  phoneCharges: number;
  treeDays: number;
  streamingHours: number;
  googleSearches: number;
};
```

## API Response Types

### SummaryResponse

`GET /api/green/summary` response:

```typescript
type SummaryResponse = CarbonSummary & {
  dateRange: {
    start: string;
    end: string;
  };
  equivalents: CarbonEquivalents;
};
```

### TracesResponse

`GET /api/green/traces` response:

```typescript
type TracesResponse = {
  traces: CarbonTrace[];
  total: number;
  limit: number;
  offset: number;
};
```

### TimeseriesResponse

`GET /api/green/timeseries` response:

```typescript
type TimeseriesResponse = {
  metric: "co2" | "water" | "traces";
  bucket: "1h" | "1d" | "1w" | "1M";
  data: Array<{
    timestamp: number;
    value: number;
  }>;
};
```
