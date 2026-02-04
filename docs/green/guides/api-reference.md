# API Reference

REST API endpoints for the Green module.

## Base URL

```
http://localhost:18789/__openclaw__/api/green
```

## Authentication

API uses the same authentication as other OpenClaw endpoints. Include credentials if gateway requires them.

## Endpoints

### GET /summary

Returns carbon footprint summary.

**Request:**
```bash
curl http://localhost:18789/__openclaw__/api/green/summary
```

**Response:**
```json
{
  "traceCount": 1847,
  "totalCo2Grams": 12450.5,
  "totalWaterMl": 156000,
  "avgCo2PerTrace": 6.74,
  "avgConfidence": 0.32,
  "totalTokens": 87500000,
  "intensityPerMillionTokens": 142.29,
  "intensityPerQuery": 6.74,
  "dateRange": {
    "start": "2025-01-15",
    "end": "2025-02-04"
  },
  "byProvider": {
    "anthropic": { "traces": 1500, "co2Grams": 10200.3 },
    "openai": { "traces": 347, "co2Grams": 2250.2 }
  },
  "equivalents": {
    "carKm": 62.3,
    "phoneCharges": 1245,
    "treeDays": 259.4,
    "streamingHours": 345.8,
    "googleSearches": 62252
  }
}
```

### GET /config

Returns current green configuration.

**Request:**
```bash
curl http://localhost:18789/__openclaw__/api/green/config
```

**Response:**
```json
{
  "enabled": true,
  "mode": "passive",
  "defaultGridCarbon": 400,
  "factorOverrides": {},
  "dailyAlertThreshold": null,
  "showInStatus": true
}
```

### GET /factors

Returns all carbon factors.

**Request:**
```bash
curl http://localhost:18789/__openclaw__/api/green/factors
```

**Response:**
```json
{
  "factors": [
    {
      "provider": "anthropic",
      "model": "claude-sonnet-4",
      "inputCo2PerMillionTokens": 150,
      "outputCo2PerMillionTokens": 450,
      "cacheReadCo2PerMillionTokens": 15,
      "waterMlPerMillionTokens": 3000,
      "confidence": 0.3,
      "source": "estimated"
    }
  ]
}
```

### GET /traces

Returns raw carbon traces.

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | `100` | Max traces to return |
| `offset` | number | `0` | Pagination offset |
| `provider` | string | all | Filter by provider |
| `model` | string | all | Filter by model |
| `since` | number | all | Filter by timestamp (ms) |

**Request:**
```bash
curl "http://localhost:18789/__openclaw__/api/green/traces?limit=10"
```

**Response:**
```json
{
  "traces": [
    {
      "traceId": "abc-123",
      "runId": "run-456",
      "timestamp": 1706918400000,
      "provider": "anthropic",
      "model": "claude-sonnet-4",
      "inputTokens": 1500,
      "outputTokens": 500,
      "cacheReadTokens": 0,
      "inputCo2Grams": 0.225,
      "outputCo2Grams": 0.225,
      "cacheCo2Grams": 0,
      "totalCo2Grams": 0.45,
      "waterMl": 6,
      "confidence": 0.3,
      "scope": 3,
      "category": 1,
      "calculationMethod": "average-data",
      "dataQualityScore": 3
    }
  ],
  "total": 1847,
  "limit": 10,
  "offset": 0
}
```

### GET /timeseries

Returns time-bucketed emissions data.

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `metric` | string | `co2` | Metric: `co2`, `water`, `traces` |
| `bucket` | string | `1d` | Bucket size: `1h`, `1d`, `1w`, `1M` |
| `since` | number | 30 days | Start timestamp (ms) |

**Request:**
```bash
curl "http://localhost:18789/__openclaw__/api/green/timeseries?metric=co2&bucket=1d"
```

**Response:**
```json
{
  "metric": "co2",
  "bucket": "1d",
  "data": [
    { "timestamp": 1706832000000, "value": 450.2 },
    { "timestamp": 1706918400000, "value": 523.8 }
  ]
}
```

### GET /intensity

Returns TCFD intensity metrics.

**Request:**
```bash
curl http://localhost:18789/__openclaw__/api/green/intensity
```

**Response:**
```json
{
  "totalTokens": 87500000,
  "totalTraces": 1847,
  "intensityPerMillionTokens": 142.29,
  "intensityPerQuery": 6.74,
  "uncertainty": {
    "lower": 0.7,
    "upper": 1.3
  }
}
```

### GET /targets

Returns SBTi targets and progress.

**Request:**
```bash
curl http://localhost:18789/__openclaw__/api/green/targets
```

**Response:**
```json
{
  "targets": [
    {
      "targetId": "target-123",
      "name": "Net Zero 2030",
      "baseYear": 2025,
      "baseYearEmissionsGrams": 50000,
      "targetYear": 2030,
      "targetReductionPercent": 50,
      "pathway": "1.5C",
      "createdAt": 1706918400000
    }
  ],
  "progress": [
    {
      "target": { /* target object */ },
      "currentYearEmissionsGrams": 12450,
      "progressPercent": 75.1,
      "onTrack": true,
      "projectedEndYear": 2028
    }
  ]
}
```

### GET /export/ghg-protocol

Export in GHG Protocol format.

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `period` | string | current year | e.g., `2025`, `2025-Q1` |

**Request:**
```bash
curl "http://localhost:18789/__openclaw__/api/green/export/ghg-protocol?period=2025-Q1"
```

**Response:** See [GHG Protocol Guide](../standards/ghg-protocol.md#export-format)

### GET /export/cdp

Export in CDP format.

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `year` | number | current year | Reporting year |

**Request:**
```bash
curl "http://localhost:18789/__openclaw__/api/green/export/cdp?year=2025"
```

**Response:** See [CDP Guide](../standards/cdp-climate.md#export-format)

### GET /export/tcfd

Export in TCFD format.

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `period` | string | current year | Reporting period |
| `baseYear` | number | none | Baseline year for comparison |

**Request:**
```bash
curl "http://localhost:18789/__openclaw__/api/green/export/tcfd?period=2025&baseYear=2024"
```

**Response:** See [TCFD Guide](../standards/tcfd.md#export-format)

## Error Responses

All endpoints return errors as:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | Endpoint not found |
| `INVALID_PARAMS` | 400 | Invalid query parameters |
| `INTERNAL_ERROR` | 500 | Server error |
| `DISABLED` | 503 | Green module disabled |
