/**
 * SQLite storage for learning layer data.
 * Separate DB at ~/.openclaw/learning/learning.db
 */

import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { RunTrace, ArmPosterior } from "./types.js";

// -- Schema --

export function ensureLearningSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS run_traces (
      trace_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_key TEXT,
      timestamp INTEGER NOT NULL,
      provider TEXT,
      model TEXT,
      channel TEXT,
      is_baseline INTEGER NOT NULL DEFAULT 0,
      context_json TEXT NOT NULL,
      arms_json TEXT NOT NULL,
      usage_json TEXT,
      duration_ms INTEGER,
      system_prompt_chars INTEGER,
      aborted INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_traces_session ON run_traces(session_key, timestamp);
    CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON run_traces(timestamp);
    CREATE INDEX IF NOT EXISTS idx_traces_baseline ON run_traces(is_baseline);

    CREATE TABLE IF NOT EXISTS arm_posteriors (
      arm_id TEXT PRIMARY KEY,
      alpha REAL NOT NULL DEFAULT 1.0,
      beta REAL NOT NULL DEFAULT 1.0,
      pulls INTEGER NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL
    );
  `);
}

// -- DB lifecycle --

export function openLearningDb(agentDir: string): DatabaseSync {
  const { DatabaseSync: DB } = require("node:sqlite") as typeof import("node:sqlite");
  const dir = path.join(agentDir, "learning");
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "learning.db");
  const db = new DB(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 3000;");
  ensureLearningSchema(db);
  return db;
}

// -- Trace CRUD --

export function insertRunTrace(db: DatabaseSync, trace: RunTrace): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO run_traces
      (trace_id, run_id, session_id, session_key, timestamp, provider, model, channel,
       is_baseline, context_json, arms_json, usage_json, duration_ms,
       system_prompt_chars, aborted, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    trace.traceId,
    trace.runId,
    trace.sessionId,
    trace.sessionKey ?? null,
    trace.timestamp,
    trace.provider ?? null,
    trace.model ?? null,
    trace.channel ?? null,
    trace.isBaseline ? 1 : 0,
    JSON.stringify(trace.context),
    JSON.stringify(trace.arms),
    trace.usage ? JSON.stringify(trace.usage) : null,
    trace.durationMs ?? null,
    trace.systemPromptChars,
    trace.aborted ? 1 : 0,
    trace.error ?? null,
  );
}

export function listRunTraces(
  db: DatabaseSync,
  opts?: { limit?: number; sessionKey?: string },
): RunTrace[] {
  const limit = opts?.limit ?? 100;
  let sql = "SELECT * FROM run_traces";
  const params: (string | number)[] = [];
  if (opts?.sessionKey) {
    sql += " WHERE session_key = ?";
    params.push(opts.sessionKey);
  }
  sql += " ORDER BY timestamp DESC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToTrace);
}

export function getRunTrace(db: DatabaseSync, traceId: string): RunTrace | null {
  const row = db.prepare("SELECT * FROM run_traces WHERE trace_id = ?").get(traceId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToTrace(row) : null;
}

function rowToTrace(row: Record<string, unknown>): RunTrace {
  return {
    traceId: row.trace_id as string,
    runId: row.run_id as string,
    sessionId: row.session_id as string,
    sessionKey: (row.session_key as string) ?? undefined,
    timestamp: row.timestamp as number,
    provider: (row.provider as string) ?? undefined,
    model: (row.model as string) ?? undefined,
    channel: (row.channel as string) ?? undefined,
    isBaseline: row.is_baseline === 1,
    context: JSON.parse(row.context_json as string),
    arms: JSON.parse(row.arms_json as string),
    usage: row.usage_json ? JSON.parse(row.usage_json as string) : undefined,
    durationMs: (row.duration_ms as number) ?? undefined,
    systemPromptChars: row.system_prompt_chars as number,
    aborted: row.aborted === 1,
    error: (row.error as string) ?? undefined,
  };
}

// -- Posterior CRUD --

export function loadPosteriors(db: DatabaseSync): Map<string, ArmPosterior> {
  const rows = db.prepare("SELECT * FROM arm_posteriors").all() as Array<Record<string, unknown>>;
  const map = new Map<string, ArmPosterior>();
  for (const row of rows) {
    const p: ArmPosterior = {
      armId: row.arm_id as string,
      alpha: row.alpha as number,
      beta: row.beta as number,
      pulls: row.pulls as number,
      lastUpdated: row.last_updated as number,
    };
    map.set(p.armId, p);
  }
  return map;
}

export function savePosterior(db: DatabaseSync, p: ArmPosterior): void {
  db.prepare(`
    INSERT OR REPLACE INTO arm_posteriors (arm_id, alpha, beta, pulls, last_updated)
    VALUES (?, ?, ?, ?, ?)
  `).run(p.armId, p.alpha, p.beta, p.pulls, p.lastUpdated);
}

export function countTraces(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM run_traces").get() as { cnt: number };
  return row.cnt;
}
