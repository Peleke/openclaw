/**
 * Daily cadence system types.
 *
 * Signal-driven block scheduling: the bus emits typed signals,
 * sources produce them, responders react to them.
 */

/* ------------------------------------------------------------------ */
/*  Signals                                                           */
/* ------------------------------------------------------------------ */

export type SignalType =
  | "block_transition"
  | "block_nudge_ack"
  | "user_idle"
  | "user_active"
  | "morning_start"
  | "heartbeat_tick"
  | "learning_insight";

export interface Signal<T extends SignalType = SignalType> {
  type: T;
  ts: number;
  payload: SignalPayloadMap[T];
}

export interface SignalPayloadMap {
  block_transition: {
    from: Block | null;
    to: Block | null;
    planContent: string | null;
    tasks: Task[];
  };
  block_nudge_ack: {
    blockId: string;
    action: "started" | "skipped" | "timeout";
  };
  user_idle: {
    block: Block;
    idleMinutes: number;
  };
  user_active: {
    block: Block | null;
  };
  morning_start: {
    block: Block;
    tasks: Task[];
  };
  heartbeat_tick: {
    ts: number;
  };
  learning_insight: {
    insight: string;
    data: Record<string, unknown>;
  };
}

/* ------------------------------------------------------------------ */
/*  Blocks                                                            */
/* ------------------------------------------------------------------ */

export interface Block {
  id: string;
  start: string; // "HH:MM" 24h
  end: string;
  planPath?: string; // relative to vault
}

export interface Task {
  text: string;
  done: boolean;
}

/* ------------------------------------------------------------------ */
/*  Responders & Sources                                              */
/* ------------------------------------------------------------------ */

export type SignalHandler<T extends SignalType = SignalType> = (
  signal: Signal<T>,
) => void | Promise<void>;

export interface Responder<T extends SignalType = SignalType> {
  name: string;
  type: T;
  handle: SignalHandler<T>;
}

export interface Source {
  name: string;
  start(): void;
  stop(): void;
}

/* ------------------------------------------------------------------ */
/*  Nudge state                                                       */
/* ------------------------------------------------------------------ */

export interface NudgeState {
  blockId: string;
  nudgeCount: number;
  lastNudgeTs: number;
  acked: boolean;
}

/* ------------------------------------------------------------------ */
/*  Config (runtime shape — Zod schema validates separately)          */
/* ------------------------------------------------------------------ */

export interface CadenceConfig {
  enabled?: boolean;
  timezone?: string;
  vaultPath?: string;
  dailyNotePath?: string;
  channel?: string;
  to?: string;
  maxNudgesPerBlock?: number;
  nudgeBackoff?: string;
  blocks?: Block[];
}

export const CADENCE_DEFAULTS = {
  timezone: "America/New_York",
  maxNudgesPerBlock: 2,
  nudgeBackoff: "15m",
} as const;
