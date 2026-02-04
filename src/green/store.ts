/**
 * SQLite storage for green (environmental impact) layer data.
 * Database at ~/.openclaw/green/green.db
 */

import type { DatabaseSync } from "node:sqlite";
import { requireNodeSqlite } from "../memory/sqlite.js";
import fs from "node:fs";
import path from "node:path";
import type {
  CarbonTrace,
  CarbonSummary,
  CarbonTimeseriesBucket,
  ProviderBreakdown,
} from "./types.js";

// -- Schema --

export function ensureGreenSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS carbon_traces (
      trace_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_key TEXT,
      timestamp INTEGER NOT NULL,
      provider TEXT,
      model TEXT,
      channel TEXT,

      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,

      input_co2_grams REAL NOT NULL DEFAULT 0,
      output_co2_grams REAL NOT NULL DEFAULT 0,
      cache_co2_grams REAL NOT NULL DEFAULT 0,
      total_co2_grams REAL NOT NULL DEFAULT 0,

      water_ml REAL NOT NULL DEFAULT 0,

      factor_confidence REAL NOT NULL DEFAULT 0,
      factor_source TEXT NOT NULL DEFAULT 'fallback',
      grid_carbon_used REAL NOT NULL DEFAULT 400,

      duration_ms INTEGER,
      aborted INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_carbon_traces_session ON carbon_traces(session_key, timestamp);
    CREATE INDEX IF NOT EXISTS idx_carbon_traces_timestamp ON carbon_traces(timestamp);
    CREATE INDEX IF NOT EXISTS idx_carbon_traces_provider ON carbon_traces(provider);
  `);
}

// -- DB lifecycle --

export function openGreenDb(agentDir: string): DatabaseSync {
  const { DatabaseSync: DB } = requireNodeSqlite();
  const dir = path.join(agentDir, "green");
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "green.db");
  const db = new DB(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 3000;");
  ensureGreenSchema(db);
  return db;
}

// -- Trace CRUD --

export function insertCarbonTrace(db: DatabaseSync, trace: CarbonTrace): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO carbon_traces
      (trace_id, run_id, session_id, session_key, timestamp, provider, model, channel,
       input_tokens, output_tokens, cache_read_tokens,
       input_co2_grams, output_co2_grams, cache_co2_grams, total_co2_grams,
       water_ml, factor_confidence, factor_source, grid_carbon_used,
       duration_ms, aborted, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    trace.inputTokens,
    trace.outputTokens,
    trace.cacheReadTokens,
    trace.inputCo2Grams,
    trace.outputCo2Grams,
    trace.cacheCo2Grams,
    trace.totalCo2Grams,
    trace.waterMl,
    trace.factorConfidence,
    trace.factorSource,
    trace.gridCarbonUsed,
    trace.durationMs ?? null,
    trace.aborted ? 1 : 0,
    trace.error ?? null,
  );
}

export function listCarbonTraces(
  db: DatabaseSync,
  opts?: { limit?: number; offset?: number },
): { traces: CarbonTrace[]; total: number } {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const total = countCarbonTraces(db);
  const rows = db
    .prepare("SELECT * FROM carbon_traces ORDER BY timestamp DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as Array<Record<string, unknown>>;
  return { traces: rows.map(rowToTrace), total };
}

export function countCarbonTraces(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM carbon_traces").get() as { cnt: number };
  return row.cnt;
}

function rowToTrace(row: Record<string, unknown>): CarbonTrace {
  return {
    traceId: row.trace_id as string,
    runId: row.run_id as string,
    sessionId: row.session_id as string,
    sessionKey: (row.session_key as string) ?? undefined,
    timestamp: row.timestamp as number,
    provider: (row.provider as string) ?? undefined,
    model: (row.model as string) ?? undefined,
    channel: (row.channel as string) ?? undefined,
    inputTokens: row.input_tokens as number,
    outputTokens: row.output_tokens as number,
    cacheReadTokens: row.cache_read_tokens as number,
    inputCo2Grams: row.input_co2_grams as number,
    outputCo2Grams: row.output_co2_grams as number,
    cacheCo2Grams: row.cache_co2_grams as number,
    totalCo2Grams: row.total_co2_grams as number,
    waterMl: row.water_ml as number,
    factorConfidence: row.factor_confidence as number,
    factorSource: row.factor_source as string as CarbonTrace["factorSource"],
    gridCarbonUsed: row.grid_carbon_used as number,
    durationMs: (row.duration_ms as number) ?? undefined,
    aborted: row.aborted === 1,
    error: (row.error as string) ?? undefined,
  };
}

// -- Aggregations --

export function getCarbonSummary(db: DatabaseSync): CarbonSummary {
  const row = db
    .prepare(
      `SELECT
        COUNT(*) as trace_count,
        COALESCE(SUM(total_co2_grams), 0) as total_co2,
        COALESCE(SUM(water_ml), 0) as total_water,
        AVG(total_co2_grams) as avg_co2,
        AVG(factor_confidence) as avg_confidence,
        MIN(timestamp) as min_ts,
        MAX(timestamp) as max_ts
      FROM carbon_traces`,
    )
    .get() as Record<string, unknown>;

  return {
    traceCount: row.trace_count as number,
    totalCo2Grams: row.total_co2 as number,
    totalWaterMl: row.total_water as number,
    avgCo2PerTrace: (row.avg_co2 as number) ?? 0,
    avgConfidence: (row.avg_confidence as number) ?? 0,
    minTimestamp: (row.min_ts as number) ?? null,
    maxTimestamp: (row.max_ts as number) ?? null,
  };
}

export function getProviderBreakdown(db: DatabaseSync): ProviderBreakdown[] {
  const rows = db
    .prepare(
      `SELECT
        provider,
        COUNT(*) as trace_count,
        SUM(total_co2_grams) as total_co2
      FROM carbon_traces
      WHERE provider IS NOT NULL
      GROUP BY provider
      ORDER BY total_co2 DESC`,
    )
    .all() as Array<Record<string, unknown>>;

  const total = rows.reduce((sum, r) => sum + (r.total_co2 as number), 0);

  return rows.map((r) => ({
    provider: r.provider as string,
    traceCount: r.trace_count as number,
    totalCo2Grams: r.total_co2 as number,
    percentage: total > 0 ? ((r.total_co2 as number) / total) * 100 : 0,
  }));
}

export function getCarbonTimeseries(db: DatabaseSync, windowMs: number): CarbonTimeseriesBucket[] {
  const rows = db
    .prepare(
      `SELECT
        CAST(timestamp / ? AS INTEGER) * ? as bucket,
        SUM(total_co2_grams) as total_co2,
        COUNT(*) as trace_count
      FROM carbon_traces
      GROUP BY bucket
      ORDER BY bucket ASC`,
    )
    .all(windowMs, windowMs) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    t: r.bucket as number,
    co2Grams: r.total_co2 as number,
    traceCount: r.trace_count as number,
  }));
}
