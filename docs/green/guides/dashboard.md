# Dashboard Guide

The Green module includes a standalone dashboard for visualizing your environmental impact data.

## Generating the Dashboard

Run the dashboard command to generate the visualization:

```bash
openclaw green dashboard
```

This creates `~/.openclaw/canvas/green/index.html` and prints the URL to access it.

**Output:**
```
Dashboard written to /Users/you/.openclaw/canvas/green/index.html
Open: http://localhost:18789/__openclaw__/canvas/green/
```

## Accessing the Dashboard

### Via Gateway (Recommended)

1. Ensure the gateway is running:
   ```bash
   openclaw gateway run
   ```

2. Open the dashboard URL in your browser:
   ```
   http://localhost:18789/__openclaw__/canvas/green/
   ```

### Via Local File

You can also open the HTML file directly in a browser. Note that API calls will fail without the gateway running, but you can still preview the UI structure.

## Dashboard Sections

### Summary Cards

The top row displays key metrics at a glance:

| Card | Description |
|------|-------------|
| **Total CO₂** | Cumulative CO₂eq emissions (g or kg) |
| **Total Water** | Cumulative water usage (mL or L) |
| **Requests** | Total number of API traces |
| **Avg/Request** | Mean emissions per API call |
| **Confidence** | Average data quality (High/Medium/Low) |

### Real-World Equivalents

Relatable comparisons to understand your footprint:

- **Car travel** — Equivalent kilometers driven
- **Phone charges** — Number of smartphone charges
- **Tree absorption** — Days of CO₂ absorption by one tree
- **Google searches** — Equivalent search queries

### Emissions Over Time

Line chart showing daily CO₂ emissions:

- X-axis: Dates
- Y-axis: grams CO₂eq
- Filled area under the curve
- Uses data from `GET /timeseries?bucket=1d`

### Provider Breakdown

Doughnut chart showing emissions by provider:

- Each slice represents a provider (Anthropic, OpenAI, etc.)
- Color-coded for easy identification
- Hover for exact values and percentages

### Carbon Intensity (TCFD Metrics)

Normalized intensity metrics:

| Metric | Description |
|--------|-------------|
| **Per million tokens** | gCO₂eq efficiency benchmark |
| **Per API call** | gCO₂eq usage benchmark |
| **Uncertainty range** | Data quality indicator (±%) |

### Emission Reduction Targets (SBTi)

If you've configured targets, displays:

- Progress bars toward reduction goals
- On-track (green) / Behind (amber) status
- Target details (base year → target year, reduction %)

### Recent Traces

Table of the latest 20 API traces:

| Column | Description |
|--------|-------------|
| Time | Timestamp of the request |
| Provider | AI provider (anthropic, openai, etc.) |
| Model | Model identifier |
| Tokens | Total input + output tokens |
| CO₂ (g) | Carbon emissions for this trace |
| Confidence | Data quality badge |

## Auto-Refresh

The dashboard automatically refreshes every 30 seconds. You can also manually refresh the browser.

## Theme

The dashboard uses a dark theme matching the gateway control-ui:

- Background: `#1a1a2e`
- Cards: `#16213e`
- Accent: `#2FBF71` (green)
- Warning: `#FFB020` (amber)
- Error: `#E23D2D` (red)

## Remote Access

If you have Tailscale configured, the dashboard command automatically detects your Tailnet IP and generates a remote-accessible URL:

```
Open: http://100.x.x.x:18789/__openclaw__/canvas/green/
```

## CLI Options

```bash
openclaw green dashboard [--port <port>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--port` | `18789` | Gateway port for API calls |

## Troubleshooting

### "No data" everywhere

- Ensure you've made some API requests through OpenClaw
- Check that green tracking is enabled: `openclaw green status`
- Verify the gateway is running on the expected port

### Charts not rendering

- Ensure you have internet access (Chart.js loads from CDN)
- Check browser console for JavaScript errors
- Try hard-refreshing the page (Cmd+Shift+R)

### API errors in console

- Verify the gateway is running: `openclaw gateway run`
- Check the port matches: default is `18789`
- Ensure the green API is responding: `curl localhost:18789/__openclaw__/api/green/summary`

## API Endpoints Used

The dashboard fetches data from these endpoints:

| Endpoint | Section |
|----------|---------|
| `GET /config` | Status badge |
| `GET /summary` | Cards, equivalents, providers |
| `GET /timeseries?bucket=1d` | Emissions chart |
| `GET /intensity` | Intensity panel |
| `GET /targets` | Target progress |
| `GET /traces?limit=20` | Recent traces table |

See [API Reference](api-reference.md) for full documentation.
