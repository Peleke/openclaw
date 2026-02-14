# CLI Reference

Complete reference for all `openclaw learning` commands.

## Overview

```bash
openclaw learning <command> [options]
```

## Commands

### `learning status`

Display learning layer summary with posteriors and baseline comparison.

```bash
openclaw learning status [--host <host>] [--port <port>]
```

When the gateway is reachable, data is fetched from the gateway API (live data). If the gateway is unreachable, falls back to the local SQLite database.

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--host` | `127.0.0.1` | Gateway host (or set `OPENCLAW_GATEWAY_HOST`) |
| `--port` | `18789` | Gateway port |

**Output:**

- Phase badge (PASSIVE or ACTIVE)
- Config summary (budget, baseline rate, min pulls)
- Trace count, arm count, total tokens, date range
- Run distribution (baseline vs. selected, with percentages)
- Token savings (percentage reduction vs. baseline)
- Top 5 arms (highest posterior mean)
- Bottom 5 arms (candidates for exclusion)

**Example output:**

```
Learning Layer Status  [PASSIVE]
  Budget: 8,000  |  Baseline: 10%  |  Min pulls: 5

  Traces: 247    Arms: 18    Tokens: 1,284,000    Range: 1/15/2025 – 2/5/2025

Run Distribution
  Baseline: 24 (9.7%)    Selected: 223 (90.3%)
  Token Savings: +12.3% (baseline avg: 5200, selected avg: 4560)

Top Arms (highest posterior mean)
  Arm               Mean     Pulls    Last Updated
  tool:fs:Read      0.923       187    2/5/2025
  tool:exec:Bash    0.891       165    2/5/2025
  tool:fs:Edit      0.845       142    2/4/2025
  tool:fs:Grep      0.812       128    2/4/2025
  tool:fs:Write     0.798       119    2/3/2025

Bottom Arms (candidates for exclusion)
  Arm                          Mean     Pulls    Last Updated
  file:workspace:old-notes.md  0.124       31    2/1/2025
  memory:project:legacy-api    0.187       22    1/30/2025
  skill:debug:verbose          0.234       18    1/29/2025
  file:workspace:scratch.ts    0.267       15    1/28/2025
  memory:project:draft-spec    0.312       12    1/27/2025
```

### `learning reset`

Reset all arm posteriors back to uninformative priors Beta(1,1).

```bash
openclaw learning reset [--host <host>] [--port <port>] [--confirm]
```

This is a destructive operation -- all learned data is lost. The bandit starts fresh as if no observations had been recorded. Use this when:

- You have significantly changed your tool inventory or skills
- Poisoned data has skewed posteriors (e.g., a bug caused incorrect reward signals)
- You want to re-run the learning phase from scratch after a major config change

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--host` | `127.0.0.1` | Gateway host (or set `OPENCLAW_GATEWAY_HOST`) |
| `--port` | `18789` | Gateway port |
| `--confirm` | — | Skip the confirmation prompt |

Without `--confirm`, you will be prompted to confirm before the reset proceeds.

**Example:**

```bash
$ openclaw learning reset
? Reset all arm posteriors to Beta(1,1)? (Y/n) Y
Reset 18 arm(s) for learner "openclaw".
```

```bash
# Non-interactive (CI, scripts)
openclaw learning reset --confirm
```

### `learning export`

Export traces and posteriors to stdout.

```bash
openclaw learning export [options]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--format` | `json` | Export format: `json` or `csv` |
| `--traces` | `true` | Include run traces in export |
| `--posteriors` | `true` | Include arm posteriors in export |

**Examples:**

```bash
# Full JSON export
openclaw learning export --format json

# CSV posteriors only
openclaw learning export --format csv --no-traces

# JSON traces only
openclaw learning export --format json --no-posteriors

# Pipe to file
openclaw learning export --format json > learning-data.json
```

### `learning dashboard`

Print the URL of the Learning dashboard.

```bash
openclaw learning dashboard [--host <host>] [--port <port>]
```

The gateway serves the dashboard HTML on-the-fly at `/__openclaw__/api/learning/dashboard`. No files are written to disk.

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--host` | `127.0.0.1` | Gateway host (or set `OPENCLAW_GATEWAY_HOST`) |
| `--port` | `18789` | Gateway port |

**Example:**

```bash
$ openclaw learning dashboard
Dashboard: http://localhost:18789/__openclaw__/api/learning/dashboard
```

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
# Check learning layer status
openclaw learning status

# Open the dashboard for visual analysis
openclaw learning dashboard

# Export data for offline analysis
openclaw learning export --format json > daily-snapshot.json
```

### Monitoring Convergence

```bash
# Watch posterior means stabilize over time
openclaw learning status

# Check if bottom arms have enough pulls for confident exclusion
# Look for "high" confidence in the posteriors table on the dashboard
openclaw learning dashboard

# When ready, switch to active mode in openclaw.json
# Then monitor token savings
openclaw learning status
```

### Resetting After Config Changes

```bash
# You've added several new tools and removed old ones.
# Existing posteriors no longer reflect the current inventory.

# Reset all posteriors to Beta(1,1)
openclaw learning reset --confirm

# Verify the reset
openclaw learning status
# Should show 0 traces and all arms at mean 0.500
```

### Remote Gateway

```bash
# Point at a remote gateway
openclaw learning status --host 10.0.0.5 --port 9999

# Or set the environment variable
export OPENCLAW_GATEWAY_HOST=10.0.0.5
openclaw learning status
openclaw learning dashboard
```
