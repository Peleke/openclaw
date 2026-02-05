# Dashboard

The Learning dashboard is a self-contained HTML page served on-the-fly by the gateway. No files are written to disk.

## Opening the Dashboard

```bash
openclaw learning dashboard
```

This prints the dashboard URL:

```
Dashboard: http://localhost:18789/__openclaw__/api/learning/dashboard
```

Open the URL in your browser.

### Custom Host and Port

```bash
openclaw learning dashboard --host 10.0.0.5 --port 9999
```

Or set the environment variable:

```bash
export OPENCLAW_GATEWAY_HOST=10.0.0.5
openclaw learning dashboard
```

## Dashboard Sections

### Summary Cards

Five stat cards at the top:

| Card | Description |
|------|-------------|
| **Traces** | Total number of run traces recorded |
| **Arms** | Total number of arm posteriors |
| **Total Tokens** | Sum of all token usage across runs |
| **Token Savings** | Percentage reduction vs. baseline runs (green = positive, red = negative) |
| **Date Range** | Time span of recorded traces |

### Convergence Chart

Line chart showing per-arm posterior means over time. Each arm gets a colored line. Arms that converge to high means are valuable; arms that converge to low means are candidates for exclusion.

**Data source:** `GET /timeseries?metric=convergence&window=1h`

### Baseline vs Selected

Bar chart comparing baseline runs and selected runs on two metrics:

- **Avg Tokens** — Average token usage per run
- **Avg Duration (s)** — Average response time

Lower values for selected runs indicate the learning layer is saving tokens and reducing latency.

**Data source:** `GET /summary` (baseline object)

### Token Usage Over Time

Area chart showing average tokens per run over time buckets. A downward trend after switching to active mode indicates successful optimization.

**Data source:** `GET /timeseries?metric=tokens&window=1h`

### Run Distribution

Doughnut chart showing the proportion of baseline vs. selected runs. Should roughly match the configured `baselineRate` (default 10% baseline, 90% selected).

**Data source:** `GET /summary` (baseline object)

### Reference Heatmap

Canvas-rendered grid showing arm outcomes across recent traces:

| Color | Meaning |
|-------|---------|
| Green (`#2FBF71`) | Arm was included and referenced (success) |
| Dark green (`#2a4a3e`) | Arm was included but not referenced (failure) |
| Dark red (`#4a2a3e`) | Arm was explicitly excluded |
| Background (`#1a1a2e`) | Arm not present in this trace |

Rows are arms, columns are recent traces (up to 50). This gives a visual summary of which arms are consistently referenced.

**Data source:** `GET /posteriors` + `GET /traces?limit=50`

### Posteriors Table

Table showing all arm posteriors with:

| Column | Description |
|--------|-------------|
| **Arm** | Arm ID with badges (SEED for seed arms, EXPLORE for underexplored) |
| **Mean** | Posterior mean (3 decimal places) |
| **Credible Interval (95%)** | Visual bar + numeric range |
| **Pulls** | Total observations |
| **Confidence** | Low (red), Medium (yellow), or High (green) |

Sorted by mean descending. Shows up to 20 arms.

**Data source:** `GET /posteriors`

## Auto-Refresh

The dashboard automatically refreshes every 30 seconds. All six API endpoints are fetched in parallel on each refresh cycle.

## Theme

The dashboard uses a dark theme with these primary colors:

| Color | Hex | Usage |
|-------|-----|-------|
| Background | `#1a1a2e` | Page background |
| Card background | `#16213e` | Stat cards, chart boxes, tables |
| Accent | `#FF5A2D` | Primary data color, stat values |
| Success | `#2FBF71` | Positive savings, referenced arms, seed badges |
| Warning | `#FFB020` | Underexplored badges, medium confidence |
| Error | `#E23D2D` | Negative savings, low confidence |
| Muted | `#8B7F77` | Labels, axis ticks, secondary text |

## Troubleshooting

### No Data Displayed

- Ensure the gateway is running: `openclaw gateway run`
- Check that learning is enabled: `openclaw learning status`
- Generate some traces by sending agent messages

### Charts Not Rendering

- Ensure the browser can reach `cdn.jsdelivr.net` (Chart.js is loaded from CDN)
- Check the browser console for JavaScript errors
- Try a hard refresh (Cmd/Ctrl + Shift + R)

### API Errors

- If the dashboard shows empty data, open the browser dev tools Network tab
- Check if API requests to `/__openclaw__/api/learning/*` return 200
- A 503 response means the learning database is not initialized yet

### API Endpoints Reference

| Dashboard Section | API Endpoint |
|-------------------|-------------|
| Config / Mode badge | `GET /config` |
| Summary cards | `GET /summary` |
| Convergence chart | `GET /timeseries?metric=convergence&window=1h` |
| Token usage chart | `GET /timeseries?metric=tokens&window=1h` |
| Baseline comparison | `GET /summary` (baseline field) |
| Run distribution | `GET /summary` (baseline field) |
| Reference heatmap | `GET /posteriors` + `GET /traces?limit=50` |
| Posteriors table | `GET /posteriors` |

## Next Steps

- [API Reference](api-reference.md) — Full endpoint documentation
- [CLI Reference](cli-reference.md) — CLI commands
- [Configuration](configuration.md) — Tune dashboard behavior via config
