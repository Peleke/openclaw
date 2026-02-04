# Dashboard Guide

The Green tab in the Gateway UI provides a visual overview of your environmental impact.

## Accessing the Dashboard

1. Start the gateway:
   ```bash
   openclaw gateway run
   ```

2. Open the Control UI:
   ```
   http://localhost:18789
   ```

3. Click the **Green** tab (leaf icon) in the sidebar

## Dashboard Sections

### Summary Cards

The top row shows key metrics at a glance:

| Card | Description |
|------|-------------|
| **Total Carbon** | Cumulative CO₂eq emissions |
| **Total Water** | Cumulative water usage |
| **Avg per Request** | Mean emissions per API call |
| **Confidence** | Average data quality score |

### Equivalents

Relatable comparisons to understand scale:

- **Car kilometers** — Distance driven with equivalent emissions
- **Phone charges** — Number of smartphone charges
- **Tree days** — Days of CO₂ absorption by one tree

### Provider Breakdown

Pie chart showing emissions by provider:

- Each slice represents a provider (Anthropic, OpenAI, etc.)
- Hover for exact values
- Click to filter traces

### Model Comparison

Table ranking models by efficiency:

| Column | Description |
|--------|-------------|
| Model | Model identifier |
| Requests | Number of API calls |
| Total CO₂ | Cumulative emissions |
| Avg/Request | Mean emissions per call |

Lower avg/request = more efficient model.

### Intensity Metrics

TCFD-style normalized metrics:

- **Per Million Tokens** — Efficiency benchmark
- **Per API Call** — Usage benchmark
- **Uncertainty Range** — Data quality indicator

### Target Progress

If SBTi targets are configured:

- Progress bar toward reduction goal
- On-track/behind status
- Projected completion date

## Interactivity

### Refresh

Click the refresh button (↻) to reload data.

### Time Range

Select period for analysis:
- Last 24 hours
- Last 7 days
- Last 30 days
- All time
- Custom range

### Export

Click "Export" to download:
- Raw JSON
- GHG Protocol format
- CDP format
- TCFD format

## Color Coding

| Color | Meaning |
|-------|---------|
| Green | Good / on track |
| Yellow | Warning / attention needed |
| Red | High impact / behind target |
| Gray | No data / unknown |

## Confidence Indicators

Data quality shown as badges:

| Badge | Confidence | Meaning |
|-------|------------|---------|
| ● High | ≥70% | Provider data available |
| ● Medium | ≥50% | Research-based estimates |
| ● Low | ≥30% | Model extrapolation |
| ● Very Low | <30% | Fallback estimates |

## Troubleshooting

### "No data available"

The Green tab shows no data when:
- No requests have been made yet
- Green tracking is disabled
- Database is empty or inaccessible

**Fix:** Run some requests and refresh.

### "Loading..." indefinitely

The dashboard may hang if:
- Gateway is restarting
- Database is locked
- Network connection lost

**Fix:** Refresh the page or restart the gateway.

### Data seems wrong

If numbers don't match CLI output:
- Dashboard may be cached — click refresh
- Time range may differ — check filter
- Some traces may be excluded — check filters

## API Access

The dashboard uses the same API as the CLI:

```bash
# Same data as dashboard summary
curl http://localhost:18789/__openclaw__/api/green/summary

# Same data as intensity panel
curl http://localhost:18789/__openclaw__/api/green/intensity
```

See [API Reference](api-reference.md) for full documentation.
