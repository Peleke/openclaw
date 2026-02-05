# CLI Reference

Complete reference for all `openclaw green` commands.

## Overview

```bash
openclaw green <command> [options]
```

## Commands

### `green status`

Display environmental impact summary.

```bash
openclaw green status [--host <host>] [--port <port>]
```

When the gateway is reachable, data is fetched from the gateway API (live data). If the gateway is unreachable, falls back to the local SQLite database.

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--host` | `127.0.0.1` | Gateway host (or set `OPENCLAW_GATEWAY_HOST`) |
| `--port` | `18789` | Gateway port |

**Output:**
- Grid carbon intensity
- Total carbon emissions
- Total water usage
- Request count
- Date range
- Equivalents (car km, phone charges, tree days)
- Provider breakdown
- Top models by carbon

### `green intensity`

Display TCFD intensity metrics.

```bash
openclaw green intensity
```

**Output:**
- CO₂ per million tokens
- CO₂ per API call
- Uncertainty range

### `green factors`

List all carbon factors.

```bash
openclaw green factors [--provider <name>]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--provider` | Filter by provider name |

**Output:**
- Provider/model combinations
- Factor values (input, output, cache)
- Confidence scores
- Factor sources

### `green export`

Export carbon data for reporting.

```bash
openclaw green export [options]
```

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--format` | `json` | Export format: `json`, `ghg-protocol`, `cdp`, `tcfd` |
| `--period` | current year | Reporting period (e.g., `2025`, `2025-Q1`) |
| `--baseline` | none | Baseline year for comparison (TCFD only) |
| `--limit` | `1000` | Max traces for JSON export |

**Examples:**

```bash
# Raw JSON export
openclaw green export --format json --limit 500

# GHG Protocol format
openclaw green export --format ghg-protocol --period 2025-Q1

# CDP Climate format
openclaw green export --format cdp --period 2025

# TCFD with baseline
openclaw green export --format tcfd --period 2025 --baseline 2024
```

### `green targets`

List emission reduction targets.

```bash
openclaw green targets
```

**Output:**
- Target name and timeline
- Reduction percentage
- Progress percentage
- On-track status

### `green targets:add`

Create a new emission reduction target.

```bash
openclaw green targets:add [options]
```

**Required Options:**
| Option | Description |
|--------|-------------|
| `--name` | Target name (e.g., "Net Zero 2030") |
| `--base-year` | Baseline year for emissions |
| `--target-year` | Year to achieve target |
| `--reduction` | Reduction percentage (e.g., `50` for 50%) |

**Optional:**
| Option | Default | Description |
|--------|---------|-------------|
| `--pathway` | `1.5C` | SBTi pathway: `1.5C`, `well-below-2C`, `2C` |

**Example:**

```bash
openclaw green targets:add \
  --name "Net Zero 2030" \
  --base-year 2025 \
  --target-year 2030 \
  --reduction 50 \
  --pathway 1.5C
```

### `green targets:remove`

Delete an emission reduction target.

```bash
openclaw green targets:remove --id <target-id>
```

**Options:**
| Option | Description |
|--------|-------------|
| `--id` | Target ID to remove |

### `green dashboard`

Print the URL of the Green dashboard.

```bash
openclaw green dashboard [--host <host>] [--port <port>]
```

The gateway serves the dashboard HTML on-the-fly at `/__openclaw__/api/green/dashboard`. No files are written to disk.

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--host` | `127.0.0.1` | Gateway host (or set `OPENCLAW_GATEWAY_HOST`) |
| `--port` | `18789` | Gateway port |

See the [Dashboard Guide](dashboard.md) for details on dashboard sections, themes, and troubleshooting.

## Global Options

| Option | Description |
|--------|-------------|
| `--help` | Show help for command |

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments |

## Examples

### Daily Workflow

```bash
# Morning: Check yesterday's impact
openclaw green status

# Export weekly report
openclaw green export --format ghg-protocol --period 2025-W05

# Check progress toward targets
openclaw green targets
```

### Quarterly Reporting

```bash
# Generate GHG Protocol report
openclaw green export --format ghg-protocol --period 2025-Q1 > q1-ghg.json

# Generate CDP report
openclaw green export --format cdp --period 2025 > annual-cdp.json

# Generate TCFD report with year-over-year comparison
openclaw green export --format tcfd --period 2025 --baseline 2024 > tcfd.json
```

### Model Comparison

```bash
# See which models are most efficient
openclaw green status | grep -A 10 "Top Models"

# Get detailed factors
openclaw green factors --provider anthropic
```
