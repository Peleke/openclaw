/**
 * Insight Digest types.
 *
 * Architecture note: The scheduler interface is designed to be "clock-pluggable"
 * so we can later swap in biological timing models (circadian rhythm, ultradian
 * cycles, HippoRAG-style memory consolidation windows, etc.).
 */

export interface DigestConfig {
  /** Minimum insights before triggering a flush (default: 5) */
  minInsightsToFlush: number;

  /** Force flush after this many hours even if under count (default: 12) */
  maxHoursBetweenFlushes: number;

  /** Don't disturb start time in HH:MM format (default: "22:00") */
  quietHoursStart: string;

  /** Don't disturb end time in HH:MM format (default: "08:00") */
  quietHoursEnd: string;

  /** Timezone for quiet hours calculation (default: "America/New_York") */
  timezone: string;

  /** Hours to wait before surfacing insights from recent edits (default: 4) */
  cooldownHours: number;

  /** Path to JSONL queue file */
  storePath: string;

  /** Interval in ms between flush checks (default: 60000 = 1 minute) */
  checkIntervalMs: number;
}

export const DEFAULT_DIGEST_CONFIG: DigestConfig = {
  minInsightsToFlush: 5,
  maxHoursBetweenFlushes: 12,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  timezone: "America/New_York",
  cooldownHours: 4,
  storePath: "", // Resolved at runtime to ~/.openclaw/cadence/digest-queue.jsonl
  checkIntervalMs: 60_000,
};

export interface QueuedInsight {
  /** Unique ID from extracted insight */
  id: string;

  /** When this insight was added to the queue */
  queuedAt: number;

  /** ID of the parent signal that produced this insight */
  sourceSignalId: string;

  /** Original file path the insight came from */
  sourcePath: string;

  /** Insight topic */
  topic: string;

  /** Content pillar (optional) */
  pillar?: string;

  /** Hook/teaser text */
  hook: string;

  /** Excerpt from source */
  excerpt: string;

  /** Quality scores */
  scores: {
    topicClarity: number;
    publishReady: number;
    novelty: number;
  };

  /** Suggested output formats */
  formats: string[];
}

export interface DigestFlush {
  /** When the flush occurred */
  flushedAt: number;

  /** Insights included in this flush */
  insights: QueuedInsight[];

  /** What triggered this flush */
  trigger: "count" | "time" | "manual";
}

export type FlushTrigger = "count" | "time" | null;

export interface FlushDecision {
  should: boolean;
  trigger: FlushTrigger;
}

/**
 * Clock interface for timing decisions.
 *
 * This abstraction allows swapping in different timing models:
 * - SimpleScheduler: Basic quiet hours + interval checks
 * - CircadianClock: Follows natural alertness cycles
 * - UltradianClock: 90-minute focus/rest cycles
 * - ConsolidationClock: HippoRAG-style memory consolidation windows
 */
export interface DigestClock {
  /** Check if current time is in a "quiet" period (no notifications) */
  isQuietPeriod(): boolean;

  /** Get milliseconds until next active window */
  msUntilNextWindow(): number;

  /** Get current time (for testability) */
  now(): number;
}

/**
 * Queue state persisted to JSONL.
 */
export interface QueueState {
  /** Last time a flush occurred (0 if never) */
  lastFlushAt: number;

  /** Queued insights awaiting flush */
  insights: QueuedInsight[];
}
