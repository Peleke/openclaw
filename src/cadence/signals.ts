/**
 * OpenClaw signal definitions using Cadence.
 *
 * All signals emitted by the ambient agency system are defined here.
 * Use DefineSignals<M> for type-safe signal discrimination.
 */

import type { DefineSignals } from "@peleke.s/cadence";
import type { Block, Task } from "./types.js";

/**
 * Signal payload map — defines payload shape for each signal type.
 */
export type OpenClawPayloadMap = {
  /** File changed in watched directory */
  "file.changed": {
    path: string;
    event: "add" | "change" | "unlink";
  };

  /** Obsidian note was modified */
  "obsidian.note.modified": {
    path: string;
    content: string;
    frontmatter: Record<string, unknown>;
  };

  /** Task extracted from Obsidian note */
  "obsidian.task.found": {
    path: string;
    task: Task;
    lineNumber: number;
  };

  /** Time block transition */
  "block.transition": {
    from: Block | null;
    to: Block | null;
    planContent: string | null;
    tasks: Task[];
  };

  /** User acknowledged block nudge */
  "block.nudge.ack": {
    blockId: string;
    action: "started" | "skipped" | "timeout";
  };

  /** User has been idle */
  "user.idle": {
    block: Block | null;
    idleMinutes: number;
  };

  /** User became active */
  "user.active": {
    block: Block | null;
  };

  /** Morning routine started */
  "morning.start": {
    block: Block;
    tasks: Task[];
  };

  /** Periodic heartbeat */
  "heartbeat.tick": {
    ts: number;
  };

  /** Learning layer generated insight */
  "learning.insight": {
    insight: string;
    data: Record<string, unknown>;
  };

  /** Journal insight extracted (P1 content pipeline) */
  "journal.insight.extracted": {
    source: {
      signalType: string;
      signalId: string;
      path: string;
      contentHash: string;
    };
    insights: Array<{
      id: string;
      topic: string;
      pillar?: string;
      hook: string;
      excerpt: string;
      scores: {
        topicClarity: number;
        publishReady: number;
        novelty: number;
      };
      formats: string[];
      concepts?: Array<{
        name: string;
        type: "entity" | "concept" | "theme";
        confidence: number;
      }>;
    }>;
    extractedAt: number;
    extractorVersion: string;
  };

  /** Digest ready for delivery (batched insights) */
  "journal.digest.ready": {
    flushedAt: number;
    insights: Array<{
      id: string;
      topic: string;
      pillar?: string;
      hook: string;
      excerpt: string;
      scores: {
        topicClarity: number;
        publishReady: number;
        novelty: number;
      };
      formats: string[];
      sourcePath: string;
    }>;
    trigger: "count" | "time" | "manual";
  };

  /** Draft generated from insights (P1 content pipeline) */
  "draft.generated": {
    draftId: string;
    platform: "twitter" | "linkedin" | "blog";
    content: string;
    fromInsights: string[];
  };

  /** LinWheel drafts generated from ::linkedin note */
  "linwheel.drafts.generated": {
    noteFile: string;
    postsCreated: number;
    angles: string[];
  };

  /** Scheduled job fired (cron) */
  "cadence.cron.fired": {
    jobId: string;
    jobName: string;
    expr: string;
    firedAt: number;
    tz?: string;
  };
};

/**
 * OpenClaw signal union type.
 *
 * Use this as the generic parameter for SignalBus:
 * ```typescript
 * const bus = createSignalBus<OpenClawSignal>();
 * bus.on("file.changed", (signal) => { ... });
 * ```
 */
export type OpenClawSignal = DefineSignals<OpenClawPayloadMap>;

/**
 * Extract signal type string literals for type narrowing.
 */
export type OpenClawSignalType = OpenClawSignal["type"];
