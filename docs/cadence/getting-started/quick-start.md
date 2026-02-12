# Quick Start

Get the P1 content pipeline running in 5 minutes. By the end, edits to your Obsidian vault will produce insight digests delivered to Telegram.

## Prerequisites

- OpenClaw gateway running
- An Obsidian vault (any directory of `.md` files works)
- A Telegram bot connected to OpenClaw (see the Telegram channel docs)
- An Anthropic or OpenAI API key configured in OpenClaw

## 1. Create the config file

Create `~/.openclaw/cadence.json`:

```json
{
  "enabled": true,
  "vaultPath": "/path/to/your/obsidian/vault",
  "delivery": {
    "channel": "telegram",
    "telegramChatId": "YOUR_CHAT_ID"
  },
  "pillars": [
    { "id": "tech", "name": "Technology", "keywords": ["code", "architecture", "infra"] },
    { "id": "business", "name": "Business", "keywords": ["strategy", "growth", "revenue"] },
    { "id": "life", "name": "Life", "keywords": ["health", "habits", "learning"] }
  ],
  "llm": {
    "provider": "anthropic",
    "model": "claude-3-5-haiku-latest"
  },
  "schedule": {
    "enabled": true,
    "nightlyDigest": "21:00",
    "timezone": "America/New_York"
  }
}
```

Replace `vaultPath` with your vault's absolute path and `telegramChatId` with your Telegram chat ID.

## 2. Restart the gateway

Cadence loads at gateway startup. Restart to pick up the new config.

## 3. Write a journal entry

Open any `.md` file in your vault and add the `::publish` marker anywhere in the content:

```markdown
# Today's observations

::publish

Spent the morning refactoring the auth middleware. The key insight:
stateless JWT validation at the edge eliminates 40% of round-trips
to the session store. This pattern generalizes to any middleware
that currently calls a backing service for validation.
```

The `::publish` marker tells the insight extractor that this content is worth extracting from. Without it, file changes are ignored.

## 4. Wait for the digest

After writing, the pipeline:

1. **Detects** the file change (within seconds)
2. **Debounces** rapid edits (waits 2 seconds for you to stop typing)
3. **Extracts** insights via LLM (topic, hook, excerpt, scores)
4. **Queues** the insight in a local JSONL file
5. **Flushes** when conditions are met (enough insights, enough time, or the nightly schedule fires)
6. **Delivers** a formatted digest to your Telegram

For testing, the nightly schedule at 21:00 will flush all queued insights regardless of count or cooldown.

## 5. Check the digest

Your Telegram message will look like:

```
Your Insight Digest

1 publishable insight(s) from today's journaling:

  Stateless JWT Edge Validation [tech]
   "Stateless JWT validation at the edge eliminates 40% of round-trips..."
   Ready: 85% | Formats: thread, post

Reply to draft any of these
```

## What just happened

The Obsidian watcher (a **source**) detected your file edit and emitted an `obsidian.note.modified` **signal**. The insight extractor (a **responder**) filtered for the `::publish` marker, sent the content to an LLM, and emitted a `journal.insight.extracted` signal. The digest responder (another **responder**) queued the insight and flushed it on schedule. The Telegram notifier (a third **responder**) formatted and delivered the message.

No polling. No manual commands. The gateway reacted to an event.

## Next steps

- [Core Concepts](concepts.md) — Understand signals, sources, and responders
- [Configuration](../guides/configuration.md) — Tune extraction, digest timing, quiet hours
- [Signal Reference](../reference/signals.md) — All 17 signal types
