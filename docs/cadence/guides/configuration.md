# Configuration

Cadence is configured via `~/.openclaw/cadence.json`. The gateway reads this file at startup.

## Full config reference

```json
{
  "enabled": true,
  "vaultPath": "/path/to/obsidian/vault",

  "delivery": {
    "channel": "telegram",
    "telegramChatId": "123456789"
  },

  "pillars": [
    { "id": "tech", "name": "Technology", "keywords": ["code", "architecture"] },
    { "id": "business", "name": "Business", "keywords": ["strategy", "growth"] },
    { "id": "life", "name": "Life", "keywords": ["health", "habits"] }
  ],

  "llm": {
    "provider": "anthropic",
    "model": "claude-3-5-haiku-latest"
  },

  "extraction": {
    "publishTag": "::publish"
  },

  "digest": {
    "minToFlush": 5,
    "maxHoursBetween": 12,
    "cooldownHours": 4,
    "quietHoursStart": "22:00",
    "quietHoursEnd": "08:00"
  },

  "schedule": {
    "enabled": true,
    "nightlyDigest": "21:00",
    "morningStandup": "08:00",
    "timezone": "America/New_York"
  }
}
```

## Top-level options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `false` | Whether Cadence starts with the gateway |
| `vaultPath` | `string` | — | Absolute path to the Obsidian vault to watch |

## Delivery

Controls where digests are sent.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `delivery.channel` | `"telegram" \| "discord" \| "log"` | `"log"` | Delivery channel |
| `delivery.telegramChatId` | `string` | — | Telegram chat ID (required when channel is `"telegram"`) |

## Pillars

Content categories used by the insight extractor to classify extracted insights. Each pillar has:

| Key | Type | Description |
|-----|------|-------------|
| `id` | `string` | Short identifier (used in output) |
| `name` | `string` | Human-readable name |
| `keywords` | `string[]` | Optional keywords to help classification |

Default pillars: `tech`, `business`, `life`.

## LLM

Controls the model used for insight extraction.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `llm.provider` | `"anthropic" \| "openai"` | `"anthropic"` | LLM provider |
| `llm.model` | `string` | `"claude-3-5-haiku-latest"` | Model identifier |

The LLM adapter uses OpenClaw's configured API keys. No additional key setup is needed if your gateway already has a working model provider.

## Extraction

Controls how the insight extractor filters and processes content.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `extraction.publishTag` | `string` | `"::publish"` | Marker string that flags content for extraction |

The extractor only processes files containing this marker. Files without it are ignored, even if they change in the watched vault.

Additional internal defaults (not currently exposed in config):

- **Minimum content length:** 50 characters
- **Debounce window:** 2 seconds after last edit
- **Max batch size:** 5 files per LLM call
- **Min batch delay:** 1 second between batches

## Digest

Controls how insights are batched and when digests are flushed.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `digest.minToFlush` | `number` | `5` | Minimum insights before auto-flush |
| `digest.maxHoursBetween` | `number` | `12` | Maximum hours between flushes |
| `digest.cooldownHours` | `number` | `4` | Hours an insight must age before it can be flushed |
| `digest.quietHoursStart` | `string` | `"22:00"` | Start of quiet hours (no auto-flush) |
| `digest.quietHoursEnd` | `string` | `"08:00"` | End of quiet hours |

### Flush triggers

A digest flushes when any of these conditions are met:

1. **Count trigger:** Queued insights >= `minToFlush`, all past cooldown, not in quiet hours
2. **Time trigger:** Hours since last flush >= `maxHoursBetween`, at least one insight past cooldown, not in quiet hours
3. **Cron trigger:** A scheduled job fires — bypasses quiet hours and cooldown entirely

### Quiet hours

During quiet hours (default 22:00-08:00), automatic flushes are suppressed. Scheduled cron jobs override this — if you set `nightlyDigest: "21:00"`, that flush happens even though 21:00 is close to quiet hours, because cron triggers bypass all filters.

### Cooldown

Freshly extracted insights wait `cooldownHours` before they can be auto-flushed. This prevents showing you insights from content you just wrote. Cron-triggered flushes ignore cooldown.

## Schedule

Controls time-based triggers via the CronBridge source.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `schedule.enabled` | `boolean` | `false` | Whether scheduled jobs are active |
| `schedule.nightlyDigest` | `string` | — | Time for nightly digest flush (e.g., `"21:00"`) |
| `schedule.morningStandup` | `string` | — | Time for morning signal (e.g., `"08:00"`) |
| `schedule.timezone` | `string` | `"America/New_York"` | Timezone for all schedule times |

Times are in 24-hour `"HH:MM"` format.

## Storage

The digest queue is stored at `~/.openclaw/cadence/digest-queue.jsonl`. This is an append-only JSONL file with line types: `insight`, `dequeue`, `flush`, `clear`. The file is fault-tolerant — malformed lines are skipped on read.

## Environment variables

| Variable | Description |
|----------|-------------|
| `CADENCE_DEBUG=1` | Enable verbose signal logging on stderr |

## Legacy config

Older versions used cadence fields directly in the main OpenClaw config (`~/.openclaw/openclaw.json`) under the `cadence` key. The P1 pipeline uses the dedicated `cadence.json` file instead. Both are read at startup; `cadence.json` takes precedence for P1 options.
