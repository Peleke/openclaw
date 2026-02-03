# Implementation Plan: Wiring P1 Cadence Responders into the OpenClaw Gateway

> Issue #28 | Branch: `feat/cadence-gateway-integration`

## Executive Summary

Integrate the P1 Content Pipeline (insight extraction and delivery) into the OpenClaw gateway for persistent operation. Transition from the dogfood CLI script (`scripts/cadence.ts`) to automatic startup with the gateway.

---

## Current State

**`src/gateway/server-cadence.ts`** currently only:
- Initializes the `OpenClawBus` singleton
- Adds the `ObsidianWatcherSource` if `cadence.vaultPath` is set
- Returns a `stop()` function for cleanup

**Gap:** Does not wire up P1 responders (extractor, digest, telegram, cron).

---

## Implementation Phases

### Phase 1: Extend `server-cadence.ts`

#### 1.1 Add Imports

```typescript
import { loadCadenceConfig, getScheduledJobs, getConfigPath } from "../cadence/config.js";
import { createCronBridge } from "../cadence/sources/cron-bridge.js";
import { createInsightExtractorResponder } from "../cadence/responders/insight-extractor/index.js";
import { createInsightDigestResponder } from "../cadence/responders/insight-digest/index.js";
import { createTelegramNotifierResponder } from "../cadence/responders/telegram-notifier.js";
import { createOpenClawLLMAdapter } from "../cadence/llm/openclaw-adapter.js";
import { registerResponders } from "../cadence/responders/index.js";
```

#### 1.2 Create `setupP1ContentPipeline()` Helper

```typescript
async function setupP1ContentPipeline(log: SubsystemLogger): Promise<{
  sources: Source<OpenClawSignal>[];
  responders: Responder[];
} | null> {
  const p1Config = await loadCadenceConfig();

  if (!p1Config.enabled || !p1Config.vaultPath) {
    return null;
  }

  const sources = [];
  const responders = [];

  // LLM Provider
  const llmProvider = createOpenClawLLMAdapter({
    defaultProvider: p1Config.llm.provider,
    defaultModel: p1Config.llm.model,
  });

  // Insight Extractor
  responders.push(createInsightExtractorResponder({
    config: { pillars: p1Config.pillars, magicString: p1Config.extraction.publishTag },
    llm: llmProvider,
  }));

  // Insight Digest
  responders.push(createInsightDigestResponder({
    config: { /* from p1Config.digest */ },
    cronTriggerJobIds: ["nightly-digest", "morning-standup", "manual-trigger"],
  }));

  // Telegram Notifier
  if (p1Config.delivery.channel === "telegram" && p1Config.delivery.telegramChatId) {
    responders.push(createTelegramNotifierResponder({
      telegramChatId: p1Config.delivery.telegramChatId,
      deliverDigests: true,
    }));
  }

  // Cron Bridge
  const jobs = getScheduledJobs(p1Config);
  if (jobs.length > 0) {
    sources.push(createCronBridge({ jobs }));
  }

  return { sources, responders };
}
```

#### 1.3 Wire into `startGatewayCadence()`

```typescript
// After existing obsidian watcher setup...

const p1 = await setupP1ContentPipeline(log);
if (p1) {
  for (const source of p1.sources) {
    openClawBus.addSource(source);
  }
  registerResponders(openClawBus.bus, p1.responders);
  log.info(`cadence: P1 pipeline ready (${p1.responders.length} responders)`);
}
```

#### 1.4 Add Manual Trigger File Watcher

```typescript
function setupManualTriggerWatcher(triggerPath: string, bus: SignalBus, log: SubsystemLogger) {
  watchFile(triggerPath, { interval: 1000 }, async () => {
    log.info("cadence: manual trigger detected");
    await bus.emit({ type: "cadence.cron.fired", /* ... */ });
    unlinkSync(triggerPath);
  });
  return () => unwatchFile(triggerPath);
}
```

---

### Phase 2: Gateway Methods (Optional Enhancement)

Add WebSocket methods for CLI integration:

**`src/gateway/server-methods/cadence.ts`:**
```typescript
export function createCadenceHandlers() {
  return {
    "cadence.trigger": async () => { /* emit manual trigger */ },
    "cadence.status": async () => { /* return pipeline status */ },
  };
}
```

**`src/gateway/server-methods-list.ts`:**
```typescript
// Add to BASE_METHODS:
"cadence.trigger",
"cadence.status",
```

---

### Phase 3: Update Exports

**`src/cadence/index.ts`:**
```typescript
export { loadCadenceConfig, getScheduledJobs, getConfigPath } from "./config.js";
export { createCronBridge } from "./sources/cron-bridge.js";
export { createInsightExtractorResponder } from "./responders/insight-extractor/index.js";
export { createInsightDigestResponder } from "./responders/insight-digest/index.js";
export { createTelegramNotifierResponder } from "./responders/telegram-notifier.js";
export { createOpenClawLLMAdapter } from "./llm/openclaw-adapter.js";
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/gateway/server-cadence.ts` | Add P1 pipeline setup, trigger watcher |
| `src/gateway/server-methods/cadence.ts` | NEW: Gateway handlers |
| `src/gateway/server-methods-list.ts` | Add cadence methods |
| `src/gateway/server.impl.ts` | Register cadence handlers |
| `src/cadence/index.ts` | Add P1 exports |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| P1 config missing | Skip P1, base cadence works |
| vaultPath not set | Skip P1, log warning |
| Telegram not configured | Skip notifier, log warning |
| LLM auth failure | Skip extractor, log error |

---

## Testing

1. **Unit:** `server-cadence.test.ts` for setup/teardown
2. **Integration:** Full pipeline signal chain
3. **Manual:** Gateway start → Obsidian edit → Telegram delivery

---

## Acceptance Criteria

- [ ] Gateway starts P1 pipeline when `cadence.enabled = true` in `~/.openclaw/cadence.json`
- [ ] Scheduled digests fire at configured times
- [ ] Manual trigger works via file touch or gateway method
- [ ] Graceful degradation when config incomplete
- [ ] Clean shutdown on gateway stop
