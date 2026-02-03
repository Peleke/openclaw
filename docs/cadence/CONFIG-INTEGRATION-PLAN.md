# Cadence P1 Config Integration Plan

> Full `openclaw config` integration for the Content Pipeline

## TL;DR

**Current (dogfood):** Edit `~/.openclaw/cadence.json` + run `bun scripts/cadence.ts start`

**Target:** `openclaw cadence setup` wizard → gateway auto-starts pipeline

---

## Implementation Phases

### Phase 1: Schema (1 session)
- Extend `CadenceConfig` in `src/cadence/types.ts` with `insights` nested config
- Add `CadenceSchema` to `src/config/zod-schema.ts`
- Define defaults

### Phase 2: CLI Foundation (1 session)
- Create `src/cli/cadence-cli.ts`
- Commands: `setup`, `status`, `trigger`, `test`, `logs`

### Phase 3: Setup Wizard (2 sessions)
- Interactive setup following `configure.wizard.ts` pattern
- Vault path, timezone, delivery channel, pillars, schedule
- Integrate with existing Telegram channel detection

### Phase 4: Status & Trigger (1 session)
- `openclaw cadence status` - show config + queue state
- `openclaw cadence trigger` - manual "give me insights"

### Phase 5: Gateway Integration (1 session)
- Update `src/gateway/server-cadence.ts` to use unified config
- Auto-start all responders when `cadence.enabled`

### Phase 6: Migration (1 session)
- Migrate `~/.openclaw/cadence.json` → `~/.openclaw/openclaw.json`
- Deprecation warnings

---

## Target Config Schema

```typescript
export interface CadenceConfig {
  enabled?: boolean;
  timezone?: string;
  vaultPath?: string;

  insights?: {
    enabled?: boolean;
    pillars?: Array<{ id: string; name: string; keywords?: string[] }>;

    extraction?: {
      publishTag?: string;      // "::publish"
      minContentLength?: number;
      model?: string;
    };

    digest?: {
      minToFlush?: number;      // 5
      maxHoursBetween?: number; // 12
      cooldownHours?: number;   // 4
      quietHoursStart?: string; // "22:00"
      quietHoursEnd?: string;   // "08:00"
    };

    delivery?: {
      channel?: "telegram" | "discord" | "log";
      telegramChatId?: string;
    };

    schedule?: {
      enabled?: boolean;
      nightlyDigest?: string;   // "21:00"
      morningStandup?: string;  // "08:00"
    };
  };
}
```

---

## Target CLI Commands

```bash
# Interactive setup
openclaw cadence setup

# Check status
openclaw cadence status

# Manual trigger
openclaw cadence trigger

# Quick config tweaks
openclaw config set cadence.insights.digest.minToFlush 3
openclaw config set cadence.insights.schedule.nightlyDigest "20:30"
```

---

## User Experience Flow

**First-time:**
```
$ openclaw cadence setup

┌─────────────────────────────────────────┐
│  Cadence Setup                          │
│  Extract insights from your journals    │
└─────────────────────────────────────────┘

? Where is your Obsidian vault?
  > /Users/peleke/Documents/Obsidian/Main

? How should insights be delivered?
  ● Telegram (recommended)

? Select Telegram chat:
  > My Chat (123456789)

? Enable scheduled digests?
  ● Yes - Nightly at 9pm

✓ Cadence configured!
```

**Daily:**
```bash
# Gateway runs in background (daemon/menu bar)
# User writes in Obsidian with ::publish tag
# At 9pm, Telegram delivers digest

# Or manually:
$ openclaw cadence trigger
```

---

## Critical Files

| File | Purpose |
|------|---------|
| `src/cadence/types.ts` | Extend CadenceConfig |
| `src/config/zod-schema.ts` | Add validation schema |
| `src/gateway/server-cadence.ts` | Wire responders from config |
| `src/commands/cadence-setup.ts` | Setup wizard (new) |
| `src/cli/cadence-cli.ts` | CLI registration (new) |

---

## Estimated Effort

~6-8 focused sessions to complete full integration.

Current dogfood approach (`scripts/cadence.ts`) works for immediate use while this is built out.
