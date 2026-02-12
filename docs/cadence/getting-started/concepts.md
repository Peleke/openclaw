# Core Concepts

Cadence is built on three primitives: signals, sources, and responders. They compose through a central bus.

## Signals

A signal is a typed event describing something that happened. Every signal has:

- **type** — A dotted string like `obsidian.note.modified` or `cadence.cron.fired`
- **id** — A unique UUID
- **timestamp** — When the event occurred
- **payload** — Type-specific data

Signals are fire-and-forget. A source emits a signal onto the bus and moves on. The bus delivers it to every responder that subscribed to that signal type.

Cadence defines 17 signal types across five categories: filesystem, scheduling, content pipeline, activity tracking, and learning. See the [Signal Reference](../reference/signals.md) for the full catalog.

### Example signal

```typescript
{
  type: "obsidian.note.modified",
  id: "a1b2c3d4-...",
  timestamp: "2025-01-15T10:30:00Z",
  payload: {
    path: "/vault/journal/2025-01-15.md",
    content: "# Today\n\n::publish\n\nSome insight...",
    frontmatter: { tags: ["tech"] }
  }
}
```

## Sources

A source watches an external system and emits signals when something changes. Sources implement a start/stop lifecycle managed by the bus.

### Shipped sources

**ObsidianWatcher** — Monitors an Obsidian vault directory using filesystem events. When a `.md` file changes, it reads the content, parses any YAML frontmatter, and emits `obsidian.note.modified`. Optionally extracts checkbox tasks and emits `obsidian.task.found` for each one.

- Ignores `.obsidian/` metadata and `node_modules/`
- Waits 300ms after the last write event before reading (file stabilization)
- Configurable exclude patterns

**CronBridge** — Fires signals on a schedule. Define jobs with cron-style times (e.g., `"21:00"` for a nightly digest) and the bridge emits `cadence.cron.fired` with the job metadata. Timezone-aware.

### Writing a custom source

A source is any object with `start()` and `stop()` methods that emits signals via the bus:

```typescript
const mySource = {
  name: "my-source",
  async start(emit) {
    // Set up your watcher, poll, or subscription
    // Call emit(signal) when events occur
  },
  async stop() {
    // Clean up
  }
};

bus.addSource(mySource);
```

## Responders

A responder subscribes to one or more signal types and runs a handler when those signals arrive. Responders are where the actual work happens — calling an LLM, writing to a file, sending a message.

### Shipped responders

**InsightExtractor** — Subscribes to `obsidian.note.modified`. Filters for the `::publish` marker, debounces rapid edits (2 seconds), batches files, sends content to an LLM for extraction, and emits `journal.insight.extracted` with structured insight data (topic, hook, excerpt, quality scores, suggested formats).

**InsightDigest** — Subscribes to `journal.insight.extracted`. Queues insights in a local JSONL file. Periodically checks flush conditions: minimum insight count, maximum time since last flush, quiet hours, and cooldown period. When conditions are met, emits `journal.digest.ready` with the batch.

**TelegramNotifier** — Subscribes to `journal.digest.ready`. Formats the batch as a readable Markdown message and sends it via OpenClaw's Telegram integration.

**TaskLogger** — Subscribes to `obsidian.task.found`. Logs extracted tasks to the console. A minimal example responder.

### Handler execution

Handlers run **sequentially** within the bus. If signal A arrives while handler B is running, A waits. This eliminates race conditions at the cost of throughput — appropriate for the event volumes Cadence handles (dozens per day, not thousands per second).

If a handler throws, the bus catches the error, logs it, and continues processing the next handler. One broken responder never takes down the pipeline.

## The bus

The bus connects sources to responders. It:

- Accepts signals from sources
- Routes signals to responders by type
- Manages source lifecycle (start/stop)
- Provides debug middleware for logging all signal traffic
- Runs handlers sequentially with error isolation

The bus is initialized as a singleton during gateway startup and destroyed on shutdown. In-memory transport only — signals don't survive a restart.

```
Sources ──emit──→ [Bus] ──deliver──→ Responders
                    ↑
              debug middleware
              (logs all signals)
```

## Composing pipelines

Responders can emit signals too. This is how pipelines chain:

1. ObsidianWatcher emits `obsidian.note.modified`
2. InsightExtractor handles it, emits `journal.insight.extracted`
3. InsightDigest handles that, emits `journal.digest.ready`
4. TelegramNotifier handles that, delivers the message

Each responder is independent. You can swap TelegramNotifier for a Discord notifier without touching the extraction or digest logic. You can add a second responder to `journal.insight.extracted` that logs insights to a database alongside the digest queue.

## Next steps

- [Quick Start](quick-start.md) — Set up the P1 pipeline
- [Configuration](../guides/configuration.md) — All config options
- [Signal Reference](../reference/signals.md) — Every signal type and its payload
