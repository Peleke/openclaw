# Green: Environmental Impact Tracking for OpenClaw

> Accountability-first, always-on carbon footprint and environmental impact tracking for AI inference.

## The Problem

Every LLM inference request has an environmental cost:
- **Carbon emissions** from GPU power consumption
- **Water usage** for data center cooling
- **Embodied carbon** in hardware manufacturing

This cost is largely invisible. Providers don't disclose per-request emissions. Users have no way to understand, track, or reduce their AI environmental footprint.

OpenClaw should surface this by default — not as guilt, but as **accountability and awareness**.

---

## Design Principles

1. **Always-on by default** — Track from the first request
2. **Per-request granularity** — Reconstruct sessions/aggregates from atomic data
3. **Conservative estimates** — When data unavailable, use worst-case backed by research
4. **Confidence scoring** — Every estimate carries a numeric confidence (0.0–1.0)
5. **Provider-extensible** — Start with Anthropic + OpenAI, design for all providers
6. **Surfaced by default** — Dashboard, CLI, and notifications without opt-in

---

## Architecture

```
                    ┌─────────────────────┐
                    │   Gateway UI        │
                    │   "Green" Tab       │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │   /__openclaw__/    │
                    │   api/green/*       │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │  Carbon  │    │  Carbon  │    │   Grid   │
        │Calculator│    │  Store   │    │  Carbon  │
        │          │    │ (SQLite) │    │   API    │
        └────┬─────┘    └────┬─────┘    └────┬─────┘
             │               │               │
             └───────┬───────┘               │
                     │                       │
        ┌────────────┴────────────┐          │
        │   Post-Run Capture      │◄─────────┘
        │   (trace-capture.ts)    │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │  pi-embedded-runner     │
        │  (usage, provider,      │
        │   model, tokens)        │
        └─────────────────────────┘
```

---

## Data Model

### Carbon Factors (Per Provider/Model)

| Field | Type | Description |
|-------|------|-------------|
| provider | string | e.g., "anthropic", "openai" |
| model | string | e.g., "claude-sonnet-4-20250514" |
| input_co2_per_1m_tokens | number | grams CO₂eq per 1M input tokens |
| output_co2_per_1m_tokens | number | grams CO₂eq per 1M output tokens |
| cache_read_co2_per_1m_tokens | number | grams (typically ~10% of input) |
| water_ml_per_1m_tokens | number | milliliters water per 1M tokens |
| confidence | number | 0.0–1.0 confidence in estimate |
| source | string | "measured" | "research" | "estimated" |
| last_updated | number | timestamp |

### Carbon Trace (Per Request)

Extends `RunTrace` pattern from learning layer:

| Field | Type | Description |
|-------|------|-------------|
| trace_id | string | UUID |
| run_id | string | Links to agent run |
| session_id | string | Session context |
| timestamp | number | Unix ms |
| provider | string | Provider used |
| model | string | Model used |
| input_tokens | number | From usage |
| output_tokens | number | From usage |
| cache_read_tokens | number | From usage |
| input_co2_g | number | Computed: tokens × factor |
| output_co2_g | number | Computed: tokens × factor |
| cache_co2_g | number | Computed: tokens × factor |
| total_co2_g | number | Sum of above |
| water_ml | number | Estimated water usage |
| grid_factor_used | number | gCO₂/kWh at compute time |
| confidence | number | Weighted by factor confidence |
| is_baseline | boolean | For A/B tracking |

### Daily Summary (Aggregated)

| Field | Type | Description |
|-------|------|-------------|
| date | string | YYYY-MM-DD |
| total_co2_g | number | Sum for day |
| total_water_ml | number | Sum for day |
| trace_count | number | Number of requests |
| avg_co2_per_trace | number | Mean |
| top_provider | string | Highest carbon |
| top_model | string | Highest carbon |
| equivalent_car_km | number | Relatability metric |
| equivalent_phone_charges | number | Relatability metric |

---

## Carbon Factor Research (2025 Data)

### Default Estimates (Conservative)

Based on academic research (Luccioni et al. 2024, Patterson et al. 2022, Li et al. 2023):

```typescript
const DEFAULT_CARBON_FACTORS: Record<string, CarbonFactor> = {
  // Anthropic Claude models (estimated from BLOOM research + scaling)
  "anthropic:claude-sonnet-4": {
    input_co2_per_1m_tokens: 150,    // grams
    output_co2_per_1m_tokens: 450,   // grams (3x input, generation is expensive)
    cache_read_co2_per_1m_tokens: 15, // grams (~10% of input)
    water_ml_per_1m_tokens: 3000,    // ml
    confidence: 0.3,                  // Low - no official data
    source: "estimated",
  },
  "anthropic:claude-opus-4": {
    input_co2_per_1m_tokens: 400,
    output_co2_per_1m_tokens: 1200,
    cache_read_co2_per_1m_tokens: 40,
    water_ml_per_1m_tokens: 8000,
    confidence: 0.25,
    source: "estimated",
  },
  "anthropic:claude-haiku-4": {
    input_co2_per_1m_tokens: 30,
    output_co2_per_1m_tokens: 90,
    cache_read_co2_per_1m_tokens: 3,
    water_ml_per_1m_tokens: 600,
    confidence: 0.35,
    source: "estimated",
  },

  // OpenAI models
  "openai:gpt-4o": {
    input_co2_per_1m_tokens: 200,
    output_co2_per_1m_tokens: 600,
    cache_read_co2_per_1m_tokens: 20,
    water_ml_per_1m_tokens: 4000,
    confidence: 0.3,
    source: "estimated",
  },
  "openai:gpt-4o-mini": {
    input_co2_per_1m_tokens: 40,
    output_co2_per_1m_tokens: 120,
    cache_read_co2_per_1m_tokens: 4,
    water_ml_per_1m_tokens: 800,
    confidence: 0.35,
    source: "estimated",
  },

  // Fallback for unknown models
  "unknown:large": {
    input_co2_per_1m_tokens: 300,
    output_co2_per_1m_tokens: 900,
    cache_read_co2_per_1m_tokens: 30,
    water_ml_per_1m_tokens: 6000,
    confidence: 0.15,
    source: "fallback",
  },
  "unknown:small": {
    input_co2_per_1m_tokens: 50,
    output_co2_per_1m_tokens: 150,
    cache_read_co2_per_1m_tokens: 5,
    water_ml_per_1m_tokens: 1000,
    confidence: 0.15,
    source: "fallback",
  },
};
```

### Estimation Methodology

When provider data is unavailable:

1. **Model size heuristic**: Infer parameter count from model name/capabilities
2. **Scaling law**: Energy scales sublinearly with parameters (~N^0.7)
3. **Hardware assumption**: Modern inference uses H100/A100 class GPUs
4. **PUE factor**: Apply 1.1–1.4 for cloud data centers
5. **Grid carbon**: Use regional average or Electricity Maps API

```
CO₂ = tokens × (energy_per_token × grid_carbon_intensity × PUE)
```

### Confidence Scoring

```typescript
type ConfidenceLevel = {
  value: number;      // 0.0–1.0
  label: string;      // "high" | "medium" | "low" | "very_low"
  explanation: string;
};

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.7) return { value: confidence, label: "high", explanation: "Based on published provider data" };
  if (confidence >= 0.5) return { value: confidence, label: "medium", explanation: "Based on academic research + extrapolation" };
  if (confidence >= 0.3) return { value: confidence, label: "low", explanation: "Estimated from similar models" };
  return { value: confidence, label: "very_low", explanation: "Fallback estimate, low confidence" };
}
```

---

## File Structure

```
src/green/
├── index.ts                    # Public API exports
├── types.ts                    # CarbonFactor, CarbonTrace, GreenConfig
├── config.ts                   # Default config + loading
├── store.ts                    # SQLite storage (carbon_traces, carbon_factors)
├── carbon-factors.ts           # Factor registry + lookups
├── carbon-calculator.ts        # tokens → CO₂ conversion
├── trace-capture.ts            # Post-run capture hook
├── api.ts                      # JSON API handlers
├── cli-status.ts               # CLI output formatting
├── dashboard-html.ts           # Self-contained HTML dashboard
├── equivalents.ts              # CO₂ → relatable metrics
└── electricity-maps.ts         # Optional: real-time grid carbon API

ui/src/ui/
├── views/green.ts              # Lit view component
├── controllers/green.ts        # State management
└── navigation.ts               # (update for green tab)
```

---

## Configuration

```typescript
type GreenConfig = {
  /** Enable environmental tracking. Default: true */
  enabled?: boolean;

  /** Tracking mode. Default: "passive" */
  mode?: "disabled" | "passive" | "active";

  /** Override carbon factors for specific providers/models */
  factorOverrides?: Record<string, Partial<CarbonFactor>>;

  /** Default grid carbon intensity (gCO₂/kWh). Default: 400 (world average) */
  defaultGridCarbon?: number;

  /** Electricity Maps API key for real-time grid data */
  electricityMapsApiKey?: string;

  /** Data center region hint (for grid carbon lookup) */
  regionHint?: string;

  /** Alert threshold (grams CO₂ per day). Default: null (no alerts) */
  dailyAlertThreshold?: number;

  /** Include in CLI status output. Default: true */
  showInStatus?: boolean;
};
```

Example `openclaw.json`:
```json
{
  "green": {
    "enabled": true,
    "mode": "passive",
    "defaultGridCarbon": 350,
    "regionHint": "US-CAL",
    "dailyAlertThreshold": 1000,
    "showInStatus": true
  }
}
```

---

## API Endpoints

### `GET /__openclaw__/api/green/summary`

Returns current carbon footprint summary.

```json
{
  "totalTraces": 1847,
  "totalCo2Grams": 12450.5,
  "totalWaterMl": 156000,
  "avgCo2PerTrace": 6.74,
  "avgConfidence": 0.32,
  "dateRange": {
    "start": "2026-01-15",
    "end": "2026-02-04"
  },
  "equivalents": {
    "carKm": 62.3,
    "phoneCharges": 1245,
    "treeDays": 0.83
  },
  "byProvider": {
    "anthropic": { "traces": 1500, "co2Grams": 10200 },
    "openai": { "traces": 347, "co2Grams": 2250 }
  }
}
```

### `GET /__openclaw__/api/green/config`

Returns current green configuration.

### `GET /__openclaw__/api/green/factors`

Returns all carbon factors with confidence levels.

### `GET /__openclaw__/api/green/timeseries?metric=co2&window=1d`

Returns time-series data for charting.

### `GET /__openclaw__/api/green/traces?limit=100`

Returns raw carbon traces.

---

## Dashboard UI

### Gateway Tab: "Green"

Added to Agent group in navigation:

```typescript
// navigation.ts
{ label: "Agent", tabs: ["skills", "nodes", "learning", "green"] }
```

### Dashboard Sections

1. **Header**
   - Total CO₂ (prominent, large number)
   - Confidence badge (high/medium/low)
   - Refresh button

2. **Summary Cards** (2×2 grid)
   - Total Carbon: "12.4 kg CO₂eq"
   - Water Usage: "156 L"
   - Average per Request: "6.7g"
   - Confidence: "32% (low)"

3. **Equivalents** (relatable metrics)
   - "Equivalent to driving 62 km"
   - "Or charging your phone 1,245 times"
   - "Offset by 1 tree for 20 hours"

4. **Trends Chart** (Canvas)
   - Daily CO₂ over past 30 days
   - Cumulative vs daily view toggle

5. **Provider Breakdown** (Table)
   | Provider | Requests | CO₂ | % of Total |
   |----------|----------|-----|------------|
   | Anthropic | 1,500 | 10.2 kg | 82% |
   | OpenAI | 347 | 2.3 kg | 18% |

6. **Model Breakdown** (Table)
   | Model | Requests | CO₂ | Avg/Request |
   |-------|----------|-----|-------------|
   | claude-sonnet-4 | 1,200 | 8.1 kg | 6.8g |
   | gpt-4o-mini | 347 | 2.3 kg | 6.6g |

7. **Confidence Disclaimer**
   > "Carbon estimates are based on academic research and industry benchmarks.
   > Actual emissions may vary. Confidence level: LOW (32%).
   > [Learn more about our methodology]"

---

## CLI Status Integration

```
$ openclaw green status

Environmental Impact  [PASSIVE]
  Grid carbon: 400 gCO₂/kWh (world avg)  |  Confidence: low (32%)

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

---

## Integration Points

### 1. Post-Run Capture Hook

In `src/agents/pi-embedded-runner/run.ts` (~line 2105):

```typescript
// After existing learning capture
if (params.config?.green?.enabled !== false) {
  captureAndStoreCarbonTrace({
    runId: params.runId,
    sessionId: params.sessionId,
    usage: normalizeUsage(attempt.usage),
    provider,
    model: modelId,
    durationMs: Date.now() - started,
    agentDir,
  });
}
```

### 2. Config Integration

In `src/config/types.openclaw.ts`:

```typescript
import type { GreenConfig } from "../green/types.js";

export type OpenClawConfig = {
  // ... existing
  green?: GreenConfig;
};
```

### 3. Gateway API Integration

Register handler in gateway HTTP chain alongside learning API.

---

## Equivalents Calculation

For relatability, convert CO₂ to common activities:

```typescript
const EQUIVALENTS = {
  // 1 km driving = ~120g CO₂ (average car)
  carKmPerGram: 1 / 120,

  // 1 phone charge = ~10g CO₂
  phoneChargesPerGram: 1 / 10,

  // 1 tree absorbs ~48g CO₂ per day
  treeDaysPerGram: 1 / 48,

  // 1 hour streaming = ~36g CO₂
  streamingHoursPerGram: 1 / 36,

  // 1 Google search = ~0.2g CO₂
  googleSearchesPerGram: 1 / 0.2,
};

function toEquivalents(co2Grams: number) {
  return {
    carKm: co2Grams * EQUIVALENTS.carKmPerGram,
    phoneCharges: Math.round(co2Grams * EQUIVALENTS.phoneChargesPerGram),
    treeDays: co2Grams * EQUIVALENTS.treeDaysPerGram,
    streamingHours: co2Grams * EQUIVALENTS.streamingHoursPerGram,
    googleSearches: Math.round(co2Grams * EQUIVALENTS.googleSearchesPerGram),
  };
}
```

---

## Real-Time Grid Carbon (Optional)

Integration with Electricity Maps API for accurate regional carbon intensity:

```typescript
async function getGridCarbonIntensity(region: string): Promise<number> {
  const response = await fetch(
    `https://api.electricitymap.org/v3/carbon-intensity/latest?zone=${region}`,
    { headers: { "auth-token": config.electricityMapsApiKey } }
  );
  const data = await response.json();
  return data.carbonIntensity; // gCO₂eq/kWh
}
```

Fallback to regional defaults when API unavailable:

```typescript
const REGIONAL_CARBON_DEFAULTS: Record<string, number> = {
  "US-CAL": 220,   // California (cleaner grid)
  "US-TEX": 400,   // Texas
  "US-NY": 280,    // New York
  "EU-DE": 350,    // Germany
  "EU-FR": 60,     // France (nuclear)
  "EU-PL": 650,    // Poland (coal)
  "WORLD": 400,    // World average
};
```

---

## Open Questions

### Data Accuracy
- [ ] Can we get official data from Anthropic/OpenAI?
- [ ] How to handle model version changes?
- [ ] Should we track embodied carbon in hardware?

### UX
- [ ] Gamification? Badges for low-carbon usage?
- [ ] Carbon budgets per session/day?
- [ ] Notifications when exceeding threshold?

### Privacy
- [ ] Is per-request tracking too granular?
- [ ] Should users opt-out entirely?

### Technical
- [ ] Cache Electricity Maps responses?
- [ ] Offline mode with stale factors?
- [ ] Export data for external analysis?

---

## Implementation Phases

### Phase 1: Foundation (Types + Storage)
- Create `src/green/types.ts`
- Create `src/green/store.ts` with SQLite schema
- Create `src/green/config.ts`
- Add `green?: GreenConfig` to OpenClawConfig

### Phase 2: Calculation Engine
- Create `src/green/carbon-factors.ts` with default factors
- Create `src/green/carbon-calculator.ts`
- Create `src/green/trace-capture.ts`
- Hook into post-run in `run.ts`

### Phase 3: API Layer
- Create `src/green/api.ts`
- Register routes in gateway
- Create `src/green/cli-status.ts`
- Add to `openclaw green status` command

### Phase 4: Dashboard UI
- Create `ui/src/ui/views/green.ts`
- Create `ui/src/ui/controllers/green.ts`
- Update `navigation.ts`
- Add charts and visualizations

### Phase 5: Polish
- Electricity Maps integration
- Equivalents calculation
- Daily summaries
- Comprehensive tests
- Documentation

---

## Prior Art / References

- **CodeCarbon** — Python library for ML carbon tracking
- **ML CO2 Impact** — Web calculator for training emissions
- **Electricity Maps** — Real-time grid carbon intensity API
- **Strubell et al. (2019)** — "Energy and Policy Considerations for Deep Learning in NLP"
- **Luccioni et al. (2024)** — "Power Hungry Processing: Watts Driving the Cost of AI Deployment"
- **Patterson et al. (2022)** — "Carbon Emissions and Large Neural Network Training"
- **Li et al. (2023)** — "Making AI Less Thirsty" (water usage)

---

*Green: Know your impact. Make informed choices. Build responsibly.*
