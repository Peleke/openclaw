# Exports

Export learning data for offline analysis, reporting, or integration with external tools.

## JSON Export

### Command

```bash
openclaw learning export --format json
```

### Schema

```json
{
  "traces": [
    {
      "traceId": "tr_abc123",
      "runId": "run_def456",
      "sessionId": "sess_ghi789",
      "sessionKey": "my-session",
      "timestamp": 1707091200000,
      "provider": "anthropic",
      "model": "claude-sonnet-4",
      "channel": "telegram",
      "isBaseline": false,
      "context": {
        "sessionKey": "my-session",
        "channel": "telegram",
        "provider": "anthropic",
        "model": "claude-sonnet-4"
      },
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
        "cacheRead": 800,
        "total": 4600
      },
      "durationMs": 2800,
      "systemPromptChars": 12400,
      "aborted": false,
      "error": null
    }
  ],
  "posteriors": [
    {
      "armId": "tool:fs:Read",
      "alpha": 142.0,
      "beta": 12.0,
      "pulls": 151,
      "lastUpdated": 1707091200000
    }
  ]
}
```

### Trace Fields

| Field | Type | Description |
|-------|------|-------------|
| `traceId` | string | Unique trace identifier |
| `runId` | string | Run identifier |
| `sessionId` | string | Session identifier |
| `sessionKey` | string \| null | Session key (if set) |
| `timestamp` | number | Unix timestamp (ms) |
| `provider` | string \| null | AI provider |
| `model` | string \| null | Model name |
| `channel` | string \| null | Message channel |
| `isBaseline` | boolean | Whether this was a baseline run |
| `context` | object | Selection context |
| `arms` | array | Arm outcomes |
| `usage` | object \| null | Token usage |
| `durationMs` | number \| null | Request duration (ms) |
| `systemPromptChars` | number | System prompt size |
| `aborted` | boolean | Whether the run was aborted |
| `error` | string \| null | Error message (if any) |

### Posterior Fields

| Field | Type | Description |
|-------|------|-------------|
| `armId` | string | Arm identifier |
| `alpha` | number | Beta distribution alpha |
| `beta` | number | Beta distribution beta |
| `pulls` | number | Total observations |
| `lastUpdated` | number | Last update timestamp (ms) |

## CSV Export

### Command

```bash
openclaw learning export --format csv
```

### Traces CSV

**Header:**

```
traceId,runId,sessionId,timestamp,provider,model,channel,isBaseline,totalTokens,durationMs,aborted
```

**Sample rows:**

```csv
tr_abc123,run_def456,sess_ghi789,1707091200000,anthropic,claude-sonnet-4,telegram,0,4600,2800,0
tr_xyz789,run_uvw012,sess_ghi789,1707094800000,anthropic,claude-sonnet-4,telegram,1,5200,3100,0
```

### Posteriors CSV

**Header:**

```
armId,alpha,beta,mean,pulls,lastUpdated
```

**Sample rows:**

```csv
tool:fs:Read,142.0000,12.0000,0.9221,151,1707091200000
tool:exec:Bash,128.0000,15.0000,0.8951,140,1707091200000
file:workspace:old-notes.md,5.0000,35.0000,0.1250,37,1707004800000
```

## Selective Export

Export only traces or only posteriors:

```bash
# Posteriors only
openclaw learning export --format json --no-traces

# Traces only
openclaw learning export --format csv --no-posteriors
```

## Programmatic Access

Use the REST API directly for integration:

```bash
# Posteriors via API
curl http://localhost:18789/__openclaw__/api/learning/posteriors

# Traces via API (paginated)
curl "http://localhost:18789/__openclaw__/api/learning/traces?limit=100&offset=0"

# Summary statistics
curl http://localhost:18789/__openclaw__/api/learning/summary
```

See [API Reference](../guides/api-reference.md) for full endpoint documentation.

## Next Steps

- [Types Reference](types.md) — All type definitions
- [API Reference](../guides/api-reference.md) — REST API endpoints
- [CLI Reference](../guides/cli-reference.md) — All CLI commands
