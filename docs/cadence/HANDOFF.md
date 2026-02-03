# Cadence + P1 Handoff

> Last updated: 2026-02-03
> Status: Ready for smoke test

## What's Done

### Cadence Core (`@peleke.s/cadence`)
- ✅ Published to npm as `@peleke.s/cadence@0.1.0`
- ✅ Repo: https://github.com/Peleke/cadence
- ✅ 41 tests, 97% coverage
- ✅ Trusted publishing configured (OIDC, no secrets needed)

### OpenClaw Integration (C2)
- ✅ `@peleke.s/cadence` dependency added
- ✅ Signal types defined in `src/cadence/signals.ts`
- ✅ `OpenClawBus` wrapper with lifecycle (`src/cadence/bus.ts`)
- ✅ `ObsidianWatcherSource` (`src/cadence/sources/obsidian-watcher.ts`)
- ✅ Gateway lifecycle wired (start/stop)
- ✅ Responder framework (`src/cadence/responders/`)
- ✅ Task logger responder as example

### Issues Created
| Issue | Description | Repo |
|-------|-------------|------|
| #19 | Smoke test - prove Obsidian watcher works | openclaw |
| #20 | Twitter/X thread formatter | openclaw |
| #21 | Insight extractor responder (P1 keystone) | openclaw |
| #79 | LinWheel Agent API | linwheel |

---

## Immediate Next Step: Smoke Test

### Prerequisites
1. An Obsidian vault path
2. OpenClaw built (`pnpm build`)

### Run Smoke Test

```bash
cd /Users/peleke/Documents/Projects/openclaw
VAULT_PATH=/path/to/your/vault pnpm tsx scripts/cadence-smoke-test.ts
```

Expected output:
```
🔥 Cadence Smoke Test

Vault: /path/to/your/vault
Test file: /path/to/your/vault/_cadence-smoke-test.md

Starting watcher...
✅ Watcher started

Creating test file...
✅ Test file created

Waiting for signals (3s)...

📡 Signal: obsidian.note.modified
   Path: /path/to/your/vault/_cadence-smoke-test.md
   Frontmatter keys: title, tags
📡 Signal: obsidian.task.found
   ⬜ First task (incomplete) (line 9)
📡 Signal: obsidian.task.found
   ✅ Second task (complete) (line 10)
📡 Signal: obsidian.task.found
   ⬜ Third task (incomplete) (line 11)

--- Results ---
Note signals: 1
Task signals: 3

✅ SMOKE TEST PASSED

Cleaning up...
✅ Test file removed
```

### If Smoke Test Passes

1. Close #19 with PR
2. Enable in your config:
   ```yaml
   # ~/.openclaw/config.yaml
   cadence:
     enabled: true
     vaultPath: /Users/peleke/path/to/vault
   ```
3. Start gateway, edit a .md file in vault, check logs for signals

---

## P1 Pipeline Overview

```
Journal edit in Obsidian
         │
         ▼
obsidian.note.modified (signal)
         │
         ▼
Insight Extractor (#21) ← BUILD THIS NEXT
         │
         ▼
journal.insight.extracted (signal)
         │
         ├─────────────────┬─────────────────┐
         ▼                 ▼                 ▼
    LinWheel          Twitter           Video Script
    Adapter           Formatter         Formatter
    (#79)             (#20)             (future)
         │                 │                 │
         ▼                 ▼                 ▼
    LinkedIn          X threads         IG/TikTok
    (auto via         (manual for       scripts
    LinWheel)         now)              (manual)
```

---

## Build Order

1. **Smoke test** (#19) — Prove Cadence works
2. **Insight extractor** (#21) — The keystone
3. **LinWheel adapter** (#79) — LinkedIn pipeline
4. **Twitter formatter** (#20) — X threads

Items 3 & 4 can be parallel once #21 works.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/cadence/signals.ts` | Signal type definitions |
| `src/cadence/bus.ts` | OpenClawBus wrapper |
| `src/cadence/sources/obsidian-watcher.ts` | Vault file watcher |
| `src/cadence/responders/index.ts` | Responder framework |
| `src/cadence/responders/task-logger.ts` | Example responder |
| `src/gateway/server-cadence.ts` | Gateway lifecycle integration |
| `scripts/cadence-smoke-test.ts` | Smoke test script |

---

## Config Reference

```yaml
cadence:
  enabled: true                    # Master switch
  vaultPath: /path/to/vault        # Obsidian vault
  timezone: America/New_York       # For time-based signals
  # Future:
  # insights:
  #   enabled: true
  #   journalPaths: ["Journal/**"]
```

Environment:
- `CADENCE_DEBUG=1` — Verbose signal logging

---

## Questions for Next Session

1. What vault path to use for smoke test?
2. Any specific journal file patterns to watch?
3. LLM provider preference for insight extraction (existing OpenClaw infra?)

---

Good night. Pick up at smoke test.
