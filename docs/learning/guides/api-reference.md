# API Reference

The Learning module exposes a JSON API through the gateway HTTP server.

## Base URL

```
http://localhost:18789/__openclaw__/api/learning/
```

Most endpoints accept `GET` requests. The `/reset` and `/reward` endpoints accept `POST`. CORS is enabled via `Access-Control-Allow-Origin` (default `*`, configurable with `OPENCLAW_CORS_ORIGIN` environment variable).

## Endpoints

### `GET /dashboard`

Serves the self-contained HTML dashboard (Chart.js from CDN, dark theme, auto-refresh).

```bash
curl http://localhost:18789/__openclaw__/api/learning/dashboard
```

**Response:** HTML page (Content-Type: `text/html`).

This endpoint does not require the learning database — the HTML is generated on-the-fly and fetches data from the other API endpoints client-side.

### `POST /reset`

Reset all arm posteriors back to uninformative priors Beta(1,1). Optionally reset only specific arms.

```bash
# Reset all arms
curl -X POST http://localhost:18789/__openclaw__/api/learning/reset

# Reset specific arms only
curl -X POST http://localhost:18789/__openclaw__/api/learning/reset \
  -H "Content-Type: application/json" \
  -d '{"arm_ids": ["tool:web:web_search", "skill:coding:main"]}'
```

**Request body (optional):**

| Field | Type | Description |
|-------|------|-------------|
| `arm_ids` | string[] | Specific arms to reset (omit to reset all) |

**Response:**

```json
{
  "learner": "openclaw",
  "reset_count": 18,
  "arm_ids": ["tool:fs:Read", "tool:exec:Bash", "..."]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `learner` | string | Learner name in qortex |
| `reset_count` | number | Number of arms that were reset |
| `arm_ids` | string[] | IDs of the reset arms |

### `POST /reward`

Manually submit a reward observation for a specific arm. Useful for lagged or deferred feedback that could not be captured automatically.

```bash
# Record a positive reward (accepted)
curl -X POST http://localhost:18789/__openclaw__/api/learning/reward \
  -H "Content-Type: application/json" \
  -d '{"arm_id": "tool:web:web_search", "outcome": "accepted", "reward": 1.0}'

# Record a negative reward (rejected)
curl -X POST http://localhost:18789/__openclaw__/api/learning/reward \
  -H "Content-Type: application/json" \
  -d '{"arm_id": "tool:web:web_search", "outcome": "rejected", "reward": 0.0}'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `arm_id` | string | Yes | Full arm ID (e.g., `tool:web:web_search`) |
| `outcome` | string | No | `"accepted"` or `"rejected"` (default: `"accepted"`) |
| `reward` | number | No | Reward value; defaults to `1.0` for accepted, `0.0` for rejected |
| `reason` | string | No | Human-readable reason for the observation |

**Response:**

```json
{
  "ok": true,
  "arm_id": "tool:web:web_search"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Whether the reward was recorded |
| `arm_id` | string | The arm that received the reward |

### `GET /summary`

Returns aggregate statistics and baseline comparison.

```bash
curl http://localhost:18789/__openclaw__/api/learning/summary
```

**Response:**

```json
{
  "traceCount": 247,
  "armCount": 18,
  "minTimestamp": 1705334400000,
  "maxTimestamp": 1707091200000,
  "totalTokens": 1284000,
  "baseline": {
    "baselineRuns": 24,
    "selectedRuns": 223,
    "baselineAvgTokens": 5200,
    "selectedAvgTokens": 4560,
    "tokenSavingsPercent": 12.3,
    "baselineAvgDuration": 3200,
    "selectedAvgDuration": 2800
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `traceCount` | number | Total number of run traces |
| `armCount` | number | Total number of arm posteriors |
| `minTimestamp` | number \| null | Earliest trace timestamp (ms) |
| `maxTimestamp` | number \| null | Latest trace timestamp (ms) |
| `totalTokens` | number | Sum of all token usage |
| `baseline.baselineRuns` | number | Count of baseline runs |
| `baseline.selectedRuns` | number | Count of Thompson-selected runs |
| `baseline.baselineAvgTokens` | number \| null | Average tokens per baseline run |
| `baseline.selectedAvgTokens` | number \| null | Average tokens per selected run |
| `baseline.tokenSavingsPercent` | number \| null | Token savings percentage |
| `baseline.baselineAvgDuration` | number \| null | Average duration (ms) for baseline runs |
| `baseline.selectedAvgDuration` | number \| null | Average duration (ms) for selected runs |

### `GET /config`

Returns the current learning layer configuration.

```bash
curl http://localhost:18789/__openclaw__/api/learning/config
```

**Response:**

```json
{
  "enabled": true,
  "phase": "passive",
  "strategy": "thompson",
  "tokenBudget": 8000,
  "baselineRate": 0.1,
  "minPulls": 5,
  "seedArmIds": [
    "tool:fs:Read",
    "tool:fs:Write",
    "tool:fs:Edit",
    "tool:exec:Bash",
    "tool:fs:Glob",
    "tool:fs:Grep"
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Whether learning is enabled |
| `phase` | string | Current phase (`"passive"` or `"active"`) |
| `strategy` | string | Selection strategy (`"thompson"`) |
| `tokenBudget` | number | Max tokens for prompt components |
| `baselineRate` | number | Fraction of baseline runs |
| `minPulls` | number | Minimum pulls before exclusion |
| `seedArmIds` | string[] | Arms that are never excluded |

### `GET /posteriors`

Returns all arm posteriors sorted by mean (descending).

```bash
curl http://localhost:18789/__openclaw__/api/learning/posteriors
```

**Response:**

```json
[
  {
    "armId": "tool:fs:Read",
    "alpha": 142.0,
    "beta": 12.0,
    "mean": 0.922,
    "pulls": 151,
    "lastUpdated": 1707091200000,
    "isSeed": true,
    "isUnderexplored": false,
    "credibleInterval": {
      "lower": 0.879,
      "upper": 0.965
    },
    "confidence": "high"
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `armId` | string | Arm identifier |
| `alpha` | number | Beta distribution alpha parameter |
| `beta` | number | Beta distribution beta parameter |
| `mean` | number | Posterior mean (`alpha / (alpha + beta)`) |
| `pulls` | number | Total observations |
| `lastUpdated` | number | Last update timestamp (ms) |
| `isSeed` | boolean | Whether this is a seed arm |
| `isUnderexplored` | boolean | Whether pulls < minPulls |
| `credibleInterval` | object | 95% credible interval `{lower, upper}` |
| `confidence` | string | `"low"`, `"medium"`, or `"high"` |

### `GET /traces`

Returns paginated run traces (newest first).

```bash
curl "http://localhost:18789/__openclaw__/api/learning/traces?limit=10&offset=0"
```

**Parameters:**

| Parameter | Default | Max | Description |
|-----------|---------|-----|-------------|
| `limit` | `100` | `1000` | Number of traces to return |
| `offset` | `0` | — | Number of traces to skip |

**Response:**

```json
{
  "traces": [
    {
      "traceId": "tr_abc123",
      "runId": "run_def456",
      "sessionId": "sess_ghi789",
      "timestamp": 1707091200000,
      "provider": "anthropic",
      "model": "claude-sonnet-4",
      "isBaseline": false,
      "arms": [
        {
          "armId": "tool:fs:Read",
          "included": true,
          "referenced": true,
          "tokenCost": 245
        }
      ],
      "usage": {
        "input": 3200,
        "output": 1400,
        "total": 4600
      },
      "durationMs": 2800,
      "systemPromptChars": 12400,
      "aborted": false
    }
  ],
  "total": 247
}
```

### `GET /timeseries`

Returns time-bucketed data for charts.

```bash
# Token usage over time
curl "http://localhost:18789/__openclaw__/api/learning/timeseries?metric=tokens&window=1h"

# Convergence (per-arm posterior means over time)
curl "http://localhost:18789/__openclaw__/api/learning/timeseries?metric=convergence&window=1h"
```

**Parameters:**

| Parameter | Default | Options | Description |
|-----------|---------|---------|-------------|
| `metric` | `tokens` | `tokens`, `convergence` | Which metric to return |
| `window` | `1h` | `1h`, `1d` | Time bucket width |

**Response (tokens):**

```json
{
  "buckets": [
    { "t": 1707004800000, "value": 4800.5 },
    { "t": 1707008400000, "value": 4650.2 }
  ]
}
```

**Response (convergence):**

```json
{
  "buckets": [
    { "t": 1707004800000, "value": 0.85, "armId": "tool:fs:Read" },
    { "t": 1707004800000, "value": 0.72, "armId": "tool:exec:Bash" }
  ]
}
```

## Error Responses

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{"error": "arm_id (string) is required"}` | Missing `arm_id` on `/reward` |
| `404` | `{"error": "Unknown learning API route"}` | Invalid route |
| `405` | `Method Not Allowed` | Wrong HTTP method for route |
| `503` | `{"error": "Learning backend (qortex) not available"}` | Qortex backend not reachable |
| `503` | `{"error": "Reset failed ..."}` | Reset operation failed |
| `503` | `{"error": "Reward observation failed ..."}` | Reward observation failed |

## Next Steps

- [Dashboard Guide](dashboard.md) — Visual dashboard walkthrough
- [CLI Reference](cli-reference.md) — CLI commands that consume these endpoints
- [Exports](../reference/exports.md) — Export formats (JSON, CSV)
