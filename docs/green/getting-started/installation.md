# Installation

The Green module is built into OpenClaw and enabled by default. No additional installation is required.

## Verify Installation

Check that green tracking is active:

```bash
openclaw green status
```

You should see output like:

```
Environmental Impact [PASSIVE]
  Grid carbon: 400 gCO₂/kWh (default)  |  Confidence: n/a

  Carbon: 0 g CO₂eq    Water: 0 mL    Requests: 0    Since: --

  No traces recorded yet. Run some requests to start tracking.
```

## Configuration

Green tracking can be configured in `openclaw.json`:

```json
{
  "green": {
    "enabled": true,
    "mode": "passive",
    "defaultGridCarbon": 400,
    "showInStatus": true
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable tracking entirely |
| `mode` | string | `"passive"` | `"disabled"`, `"passive"`, or `"active"` |
| `defaultGridCarbon` | number | `400` | Grid carbon intensity (gCO₂/kWh) |
| `factorOverrides` | object | `{}` | Override per-model carbon factors |
| `dailyAlertThreshold` | number | `null` | Alert when daily emissions exceed (grams) |
| `showInStatus` | boolean | `true` | Include in `openclaw status` output |

## Modes

### Passive Mode (Default)

Tracks all requests silently. Data available via CLI, API, and dashboard.

### Active Mode

Same as passive, plus:
- Emissions shown after each request
- Alerts when thresholds exceeded

### Disabled Mode

No tracking. Useful for privacy-sensitive deployments.

## Database Location

Carbon traces are stored in SQLite at:

```
~/.openclaw/green.db
```

This database contains:
- `carbon_traces` — Per-request emission records
- `carbon_targets` — SBTi reduction targets

## Next Steps

- [Quick Start](quick-start.md) — Run your first tracked request
- [Configuration](../guides/configuration.md) — Advanced configuration options
