# Signal Reference

Complete list of signal types defined in Cadence. Each signal has a `type`, `id` (UUID), `timestamp`, and a type-specific `payload`.

## Filesystem signals

### `obsidian.note.modified`

Emitted when a Markdown file changes in the watched vault.

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Absolute path to the modified file |
| `content` | `string` | Full file content after the edit |
| `frontmatter` | `Record<string, unknown>` | Parsed YAML frontmatter (empty object if none) |

**Source:** ObsidianWatcher

### `obsidian.task.found`

Emitted for each checkbox task extracted from a modified note.

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | File the task was found in |
| `text` | `string` | Task text (without the checkbox syntax) |
| `done` | `boolean` | Whether the checkbox is checked (`[x]` or `[X]`) |

**Source:** ObsidianWatcher (when `emitTasks` is enabled)

### `file.changed`

Generic file change event.

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Path to the changed file |

## Content pipeline signals

### `journal.insight.extracted`

Emitted after the LLM extracts publishable insights from journal content.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique insight ID |
| `topic` | `string` | 3-8 word topic summary |
| `pillar` | `string` | Content category (e.g., "tech", "business") |
| `hook` | `string` | Tweet-length opener |
| `excerpt` | `string` | 1-2 sentence summary |
| `scores.topicClarity` | `number` | 0-1 clarity score |
| `scores.publishReady` | `number` | 0-1 readiness score |
| `scores.novelty` | `number` | 0-1 novelty score |
| `formats` | `string[]` | Suggested formats (e.g., `["thread", "post", "essay"]`) |

**Source:** InsightExtractor responder

### `journal.digest.ready`

Emitted when a batch of insights is ready for delivery.

| Field | Type | Description |
|-------|------|-------------|
| `insights` | `Insight[]` | Array of extracted insights |
| `flushedAt` | `string` | ISO timestamp of the flush |
| `trigger` | `string` | What caused the flush: `"count"`, `"time"`, or `"cron"` |

**Source:** InsightDigest responder

### `draft.generated`

Emitted when a content draft is generated from insights.

| Field | Type | Description |
|-------|------|-------------|
| `insightId` | `string` | Source insight ID |
| `format` | `string` | Output format (e.g., "thread") |
| `content` | `string` | Draft content |

**Source:** Planned (not yet implemented)

### `linwheel.drafts.generated`

Emitted after the LinWheel Publisher generates LinkedIn drafts from a `::linkedin`-tagged note.

| Field | Type | Description |
|-------|------|-------------|
| `noteFile` | `string` | Path to the source Obsidian note |
| `postsCreated` | `number` | Number of drafts generated |
| `angles` | `string[]` | Angles used for reshape (e.g., `["field_note", "contrarian"]`) |

**Source:** LinWheelPublisher responder

## Scheduling signals

### `cadence.cron.fired`

Emitted when a scheduled job triggers.

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | `string` | Job identifier |
| `jobName` | `string` | Human-readable job name |
| `firedAt` | `string` | ISO timestamp |

**Source:** CronBridge

## Activity signals

### `block.transition`

Emitted when the current time block changes.

| Field | Type | Description |
|-------|------|-------------|
| `from` | `Block \| null` | Previous block (null if none) |
| `to` | `Block \| null` | New block (null if between blocks) |

### `block.nudge.ack`

Emitted when the user acknowledges a nudge.

| Field | Type | Description |
|-------|------|-------------|
| `blockId` | `string` | Block that was nudged |
| `acknowledgedAt` | `string` | ISO timestamp |

### `user.idle`

Emitted when the user becomes idle.

| Field | Type | Description |
|-------|------|-------------|
| `since` | `string` | ISO timestamp of last activity |

### `user.active`

Emitted when the user returns from idle.

| Field | Type | Description |
|-------|------|-------------|
| `resumedAt` | `string` | ISO timestamp |

### `morning.start`

Emitted when the morning routine begins.

| Field | Type | Description |
|-------|------|-------------|
| `date` | `string` | ISO date string |

### `heartbeat.tick`

Periodic heartbeat for health checks and time-based logic.

| Field | Type | Description |
|-------|------|-------------|
| `tick` | `number` | Monotonic counter |
| `timestamp` | `string` | ISO timestamp |

## Learning signals

### `learning.insight`

Emitted when the learning layer generates an insight about tool or prompt effectiveness.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Insight category |
| `message` | `string` | Human-readable insight |
| `data` | `Record<string, unknown>` | Structured insight data |

**Source:** Learning module
