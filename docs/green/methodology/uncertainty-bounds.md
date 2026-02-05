# Uncertainty Bounds Methodology

Quantifying and reporting uncertainty in emission estimates.

## Why Uncertainty Matters

Emission estimates are approximations. Reporting without uncertainty:
- Implies false precision
- Violates ISO 14064 requirements
- Reduces credibility

Proper uncertainty reporting:
- Enables informed decision-making
- Supports third-party verification
- Meets compliance standards

## Sources of Uncertainty

### 1. Emission Factor Uncertainty

Factors are estimates, not measurements:

| Source | Typical Uncertainty |
|--------|---------------------|
| Provider-specific | ±10-15% |
| Academic research | ±25-35% |
| Model extrapolation | ±40-60% |
| Fallback estimates | ±80-100% |

### 2. Activity Data Uncertainty

Token counts from API responses:

| Source | Uncertainty |
|--------|-------------|
| Verified API response | ±1% |
| Estimated from text | ±5-10% |
| Unknown | ±20% |

OpenClaw uses API-reported tokens: **±1%** uncertainty.

### 3. Grid Carbon Uncertainty

Grid intensity varies:

| Source | Uncertainty |
|--------|-------------|
| Real-time API | ±5% |
| Regional average | ±20% |
| World average | ±30% |

OpenClaw default (400 gCO₂/kWh): **±30%** uncertainty.

## Calculation Method

### Combined Uncertainty

Using root sum of squares (RSS):

```
Combined = √(EF² + AD² + GC²)
```

Where:
- EF = Emission factor uncertainty
- AD = Activity data uncertainty
- GC = Grid carbon uncertainty

Example:
```
Combined = √(35² + 1² + 30²)
        = √(1225 + 1 + 900)
        = √2126
        = 46%
```

### Simplified Approach

OpenClaw uses confidence-based mapping for simplicity:

```typescript
function confidenceToUncertainty(confidence: number) {
  if (confidence >= 0.7) return { lower: 0.85, upper: 1.15 }; // ±15%
  if (confidence >= 0.5) return { lower: 0.70, upper: 1.30 }; // ±30%
  if (confidence >= 0.3) return { lower: 0.50, upper: 1.50 }; // ±50%
  return { lower: 0.00, upper: 2.00 };                         // ±100%
}
```

## Reporting

### Point Estimate with Range

```
12.45 kg CO₂eq (8.7 - 16.2 kg, ±30%)
```

### Confidence Interval

```
12.45 kg CO₂eq
95% CI: 8.7 - 16.2 kg
```

### As Percentage

```
12.45 ± 3.7 kg CO₂eq (±30%)
```

## CLI Output

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

## Export Formats

### GHG Protocol

```json
{
  "scope3Category1": {
    "emissions_tCO2eq": 0.01245,
    "uncertainty_percent": 30
  }
}
```

### ISO 14064

```json
{
  "emissions": {
    "scope3Cat1_tCO2eq": 0.01245,
    "uncertainty_tCO2eq": 0.00374
  }
}
```

### TCFD

```json
{
  "uncertainty": {
    "lower": 0.70,
    "upper": 1.30
  }
}
```

## ISO 14064 Requirements

ISO 14064-1:2018 requires:

1. **Identify** uncertainty sources
2. **Quantify** where possible
3. **Report** overall uncertainty
4. **Explain** methodology

### Required Documentation

```markdown
## Uncertainty Assessment

### Sources
1. Emission factors: No supplier-specific data (±35%)
2. Activity data: API-reported token counts (±1%)
3. Grid carbon: World average used (±30%)

### Methodology
Combined using root sum of squares:
√(35² + 1² + 30²) = 46%

Simplified to ±50% based on confidence mapping.

### Overall Uncertainty
Emissions: 12.45 kg CO₂eq
Uncertainty: ±50% (6.2 - 18.7 kg)
```

## Verification

Third-party verifiers assess uncertainty:

| Level | Materiality | Requirements |
|-------|-------------|--------------|
| Limited | Higher | Plausibility check |
| Reasonable | Lower | Detailed testing |

Most Scope 3 Cat 1 emissions verified at **limited assurance**.

## Reducing Uncertainty

### Short Term

1. Use consistent methodology
2. Document all assumptions
3. Track changes over time

### Medium Term

1. Engage providers for data
2. Apply regional grid factors
3. Implement real-time monitoring

### Long Term

1. Industry standardization
2. Provider disclosure requirements
3. Direct measurement capabilities

## Best Practices

1. **Always report uncertainty** — Never imply false precision
2. **Use conservative estimates** — Upper bound, not best case
3. **Document methodology** — Enable verification
4. **Update regularly** — Improve as data improves
5. **Be consistent** — Same methodology year over year
