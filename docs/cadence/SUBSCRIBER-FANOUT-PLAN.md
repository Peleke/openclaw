# Subscriber/Fan-out Pattern for Cadence Digests

> Issue #29 (to be created) | Future work after gateway integration

## Summary

Generalize the `TelegramNotifierResponder` into a subscriber/fan-out pattern so digests can be delivered to multiple destinations (Telegram, Discord, webhooks, log, etc.).

---

## Current State

`src/cadence/responders/telegram-notifier.ts` listens for `journal.digest.ready` and sends to a single Telegram chat. This is limiting.

---

## Proposed Architecture

### 1. DeliverySubscriber Interface

```typescript
// src/cadence/delivery/types.ts
export interface DeliverySubscriber {
  id: string;
  name: string;
  channel: "telegram" | "discord" | "webhook" | "log" | string;
  deliver(digest: DigestPayload): Promise<DeliveryResult>;
  healthCheck?(): Promise<{ ok: boolean; error?: string }>;
}

export interface DigestPayload {
  flushedAt: number;
  insights: Array<{
    id: string;
    topic: string;
    pillar?: string;
    hook: string;
    excerpt: string;
    scores: { topicClarity: number; publishReady: number; novelty: number };
    formats: string[];
    sourcePath: string;
  }>;
  trigger: "count" | "time" | "manual";
}

export interface DeliveryResult {
  success: boolean;
  subscriberId: string;
  channel: string;
  messageId?: string;
  error?: string;
  timestamp: number;
}
```

### 2. DeliveryRegistry

```typescript
// src/cadence/delivery/registry.ts
export interface DeliveryRegistry {
  register(subscriber: DeliverySubscriber): void;
  unregister(id: string): boolean;
  getAll(): DeliverySubscriber[];
  get(id: string): DeliverySubscriber | undefined;
  getByChannel(channel: string): DeliverySubscriber[];
  clear(): void;
}
```

### 3. DigestFanoutResponder

```typescript
// src/cadence/responders/digest-fanout.ts
export function createDigestFanoutResponder(
  registry: DeliveryRegistry,
  config?: {
    continueOnError?: boolean;
    concurrency?: number;
    deliveryTimeoutMs?: number;
    onComplete?: (results: DeliveryResult[]) => void;
  },
): Responder;
```

### 4. Built-in Subscribers

- `createTelegramSubscriber(config)` - wraps `sendMessageTelegram`
- `createDiscordSubscriber(config)` - wraps `sendMessageDiscord`
- `createWebhookSubscriber(config)` - generic HTTP POST
- `createLogSubscriber(config)` - debug/log output

---

## File Structure

```
src/cadence/delivery/
├── types.ts
├── registry.ts
├── registry.test.ts
├── subscribers/
│   ├── telegram.ts
│   ├── discord.ts
│   ├── webhook.ts
│   └── log.ts
└── index.ts

src/cadence/responders/
├── digest-fanout.ts
└── digest-fanout.test.ts
```

---

## Config Integration

```typescript
// Updated CadenceP1Config
export interface CadenceP1Config {
  // ... existing fields

  /** Multiple delivery subscribers */
  subscribers: Array<{
    id: string;
    channel: "telegram" | "discord" | "webhook" | "log";
    enabled: boolean;
    config: TelegramConfig | DiscordConfig | WebhookConfig | LogConfig;
  }>;

  /** @deprecated Use subscribers instead */
  delivery?: { ... };
}
```

---

## Migration Path

1. **Phase 1**: Add new infrastructure (non-breaking)
2. **Phase 2**: Create subscriber adapters
3. **Phase 3**: Update config with backward compatibility
4. **Phase 4**: Deprecate `TelegramNotifierResponder`

---

## Design Decisions

- **Concurrent delivery**: Use `Promise.allSettled` for resilience
- **No filtering in v1**: Keep simple, add later if needed
- **Retry left to subscribers**: They can implement internally
- **Emit `journal.digest.delivered`**: For optional auditing

---

## Implementation Order

1. `types.ts` - interfaces
2. `registry.ts` + tests
3. `subscribers/log.ts` - simplest for testing
4. `digest-fanout.ts` + tests
5. `subscribers/telegram.ts` - extract from current
6. `subscribers/discord.ts`
7. `subscribers/webhook.ts`
8. Config integration
9. Migration helper
