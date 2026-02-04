# Configuration

Configure the Green module via `openclaw.json`.

## Basic Configuration

```json
{
  "green": {
    "enabled": true,
    "mode": "passive"
  }
}
```

## Full Configuration

```json
{
  "green": {
    "enabled": true,
    "mode": "passive",
    "defaultGridCarbon": 400,
    "factorOverrides": {
      "anthropic:claude-sonnet-4": {
        "inputCo2PerMillionTokens": 120,
        "outputCo2PerMillionTokens": 360,
        "confidence": 0.5
      }
    },
    "dailyAlertThreshold": 1000,
    "showInStatus": true
  }
}
```

## Options Reference

### `enabled`

| Type | Default | Description |
|------|---------|-------------|
| `boolean` | `true` | Enable or disable tracking entirely |

When `false`, no carbon traces are recorded.

### `mode`

| Type | Default | Description |
|------|---------|-------------|
| `string` | `"passive"` | Tracking mode |

**Values:**

| Mode | Description |
|------|-------------|
| `"disabled"` | No tracking (same as `enabled: false`) |
| `"passive"` | Silent tracking, data available via CLI/API |
| `"active"` | Shows emissions after each request |

### `defaultGridCarbon`

| Type | Default | Description |
|------|---------|-------------|
| `number` | `400` | Grid carbon intensity (gCO₂/kWh) |

This value is used when regional grid data is unavailable.

**Reference values:**

| Region | gCO₂/kWh | Notes |
|--------|----------|-------|
| World average | 400 | Default |
| US average | 380 | EPA eGRID |
| California | 220 | Cleaner grid |
| France | 60 | Nuclear-heavy |
| Poland | 650 | Coal-heavy |
| Germany | 350 | Mixed |

### `factorOverrides`

| Type | Default | Description |
|------|---------|-------------|
| `object` | `{}` | Override carbon factors per model |

Use to provide custom factors when you have better data:

```json
{
  "factorOverrides": {
    "provider:model": {
      "inputCo2PerMillionTokens": 100,
      "outputCo2PerMillionTokens": 300,
      "cacheReadCo2PerMillionTokens": 10,
      "waterMlPerMillionTokens": 2000,
      "confidence": 0.8,
      "source": "measured"
    }
  }
}
```

### `dailyAlertThreshold`

| Type | Default | Description |
|------|---------|-------------|
| `number` | `null` | Alert threshold in grams CO₂ per day |

When set, alerts trigger if daily emissions exceed this value (active mode only).

```json
{
  "dailyAlertThreshold": 1000
}
```

### `showInStatus`

| Type | Default | Description |
|------|---------|-------------|
| `boolean` | `true` | Include green summary in `openclaw status` |

## Environment Variables

Configuration can also be set via environment:

| Variable | Config Path | Description |
|----------|-------------|-------------|
| `OPENCLAW_GREEN_ENABLED` | `green.enabled` | Enable tracking |
| `OPENCLAW_GREEN_MODE` | `green.mode` | Tracking mode |
| `OPENCLAW_GREEN_GRID_CARBON` | `green.defaultGridCarbon` | Grid intensity |

## Config Precedence

1. Environment variables (highest)
2. `openclaw.json` in working directory
3. `~/.openclaw/openclaw.json`
4. Default values (lowest)

## Validation

Invalid configuration is logged but doesn't crash:

```
[WARN] green.mode: invalid value "aggressive", using "passive"
[WARN] green.defaultGridCarbon: must be positive, using 400
```

## Examples

### Minimal (Defaults)

```json
{
  "green": {}
}
```

Uses all defaults: enabled, passive mode, 400 gCO₂/kWh.

### Privacy-Conscious

```json
{
  "green": {
    "enabled": false
  }
}
```

No tracking at all.

### Active Monitoring

```json
{
  "green": {
    "mode": "active",
    "dailyAlertThreshold": 500
  }
}
```

Shows emissions after each request, alerts if >500g/day.

### European Deployment

```json
{
  "green": {
    "defaultGridCarbon": 300
  }
}
```

Uses EU average grid carbon.

### With Custom Factors

```json
{
  "green": {
    "factorOverrides": {
      "anthropic:claude-sonnet-4": {
        "inputCo2PerMillionTokens": 100,
        "outputCo2PerMillionTokens": 300,
        "confidence": 0.7,
        "source": "research"
      }
    }
  }
}
```

Custom factors for a specific model.
