# Regional Grid Carbon

Location-based vs market-based accounting for AI emissions.

## Overview

Grid carbon intensity varies significantly by region:

| Region | gCO₂/kWh | Notes |
|--------|----------|-------|
| France | 60 | Nuclear-heavy |
| California | 220 | Renewables + gas |
| UK | 250 | Wind + gas |
| Germany | 350 | Mixed |
| US Average | 380 | Varied |
| World Average | 400 | Default |
| Poland | 650 | Coal-heavy |
| China (coal regions) | 800+ | Coal-dominant |

Using accurate regional data can significantly improve estimate accuracy.

## Current Implementation

### Default: World Average

OpenClaw uses 400 gCO₂/kWh by default:

```json
{
  "green": {
    "defaultGridCarbon": 400
  }
}
```

This is conservative (higher than hyperscaler averages).

### Manual Configuration

Set regional value if known:

```json
{
  "green": {
    "defaultGridCarbon": 220
  }
}
```

## Accounting Methods

### Location-Based

Uses grid average where electricity is consumed:

```
CO₂ = Energy × Regional_Grid_Average
```

**Pros**:
- Reflects actual grid mix
- Simple to understand
- Required by some standards

**Cons**:
- Doesn't reflect provider choices
- Provider location often unknown

### Market-Based

Uses contractual instruments (RECs, PPAs):

```
CO₂ = Energy × Contractual_Factor
```

**Pros**:
- Reflects provider renewable purchases
- Incentivizes clean energy procurement

**Cons**:
- Requires provider disclosure
- RECs may not reflect actual consumption

## Provider Renewable Claims

Major cloud providers claim significant renewable energy:

| Provider | Claim | Verification |
|----------|-------|--------------|
| Google Cloud | 100% matched | Annual reports |
| Azure | 100% by 2025 | Commitments |
| AWS | 100% by 2025 | Commitments |

**Important**: These are aggregate claims. Actual inference may occur in any region.

## Why Default is Conservative

We use 400 gCO₂/kWh because:

1. **Unknown location** — Can't verify where inference runs
2. **Time variance** — Grid carbon changes hourly
3. **Renewable matching** — Annual matching ≠ 24/7 clean
4. **Transmission losses** — Often excluded from claims

Using world average ensures we don't underestimate.

## Future: Real-Time Grid Data

### Electricity Maps API

[Electricity Maps](https://www.electricitymaps.com/) provides real-time grid carbon:

```typescript
// Future implementation
async function getGridCarbon(region: string): Promise<number> {
  const response = await fetch(
    `https://api.electricitymap.org/v3/carbon-intensity/latest?zone=${region}`,
    { headers: { "auth-token": apiKey } }
  );
  return response.json().carbonIntensity;
}
```

**Status**: Stub implemented, requires paid API access.

### EPA eGRID

[EPA eGRID](https://www.epa.gov/egrid) provides US regional data:

| Region | gCO₂/kWh |
|--------|----------|
| CAMX (California) | 225 |
| ERCT (Texas) | 380 |
| NYUP (NY Upstate) | 115 |
| RFCW (Midwest) | 450 |

**Status**: Static data available, mapping to cloud regions needed.

### IEA Emission Factors

[IEA](https://www.iea.org/) provides country-level data:

| Country | gCO₂/kWh |
|---------|----------|
| France | 56 |
| UK | 231 |
| Germany | 350 |
| Japan | 457 |
| Australia | 517 |

**Status**: Paid data source, annual updates.

## Cloud Region Mapping

Map cloud regions to grid regions:

```typescript
const REGION_GRID_MAP: Record<string, number> = {
  // AWS
  "us-east-1": 380,      // Virginia
  "us-west-2": 220,      // Oregon (hydro)
  "eu-west-1": 350,      // Ireland
  "eu-central-1": 350,   // Frankfurt

  // Google Cloud
  "us-central1": 400,    // Iowa
  "us-west1": 220,       // Oregon
  "europe-west1": 250,   // Belgium

  // Azure
  "eastus": 380,
  "westus2": 220,
  "westeurope": 350,
};
```

**Challenge**: Providers don't disclose which region serves each request.

## Configuration Examples

### US West Coast Deployment

```json
{
  "green": {
    "defaultGridCarbon": 220
  }
}
```

### European Deployment

```json
{
  "green": {
    "defaultGridCarbon": 300
  }
}
```

### Conservative (Unknown)

```json
{
  "green": {
    "defaultGridCarbon": 400
  }
}
```

## Compliance Implications

### GHG Protocol

Both methods allowed:
- Location-based for Scope 2
- Market-based with contractual proof
- Scope 3: Supplier's method if available

### SBTi

Prefers market-based for renewable claims:
- Must have contractual instruments
- Annual matching minimum
- 24/7 matching encouraged

### TCFD

Report both if material:
- Location-based as primary
- Market-based as supplementary

## Recommendations

### Today

1. Use default (400) if location unknown
2. Configure regional value if you know the data center
3. Document your assumption

### When Data Available

1. Enable real-time API
2. Use location-based for accuracy
3. Apply market-based if provider discloses

### For Reporting

1. State which method used
2. Document grid carbon assumption
3. Note limitations
