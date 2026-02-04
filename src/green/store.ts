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
  CarbonTarget,
  TargetProgress,
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

      -- GHG Protocol compliance fields
      scope INTEGER NOT NULL DEFAULT 3,
      category INTEGER NOT NULL DEFAULT 1,
      calculation_method TEXT NOT NULL DEFAULT 'average-data',
      data_quality_score INTEGER NOT NULL DEFAULT 3,

      -- Regional grid carbon (for location-based reporting)
      region TEXT,
      region_grid_carbon REAL,

      duration_ms INTEGER,
      aborted INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_carbon_traces_session ON carbon_traces(session_key, timestamp);
    CREATE INDEX IF NOT EXISTS idx_carbon_traces_timestamp ON carbon_traces(timestamp);
    CREATE INDEX IF NOT EXISTS idx_carbon_traces_provider ON carbon_traces(provider);

    -- SBTi carbon targets table
    CREATE TABLE IF NOT EXISTS carbon_targets (
      target_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_year INTEGER NOT NULL,
      base_year_emissions_grams REAL NOT NULL,
      target_year INTEGER NOT NULL,
      target_reduction_percent REAL NOT NULL,
      pathway TEXT NOT NULL DEFAULT '1.5C',
      created_at INTEGER NOT NULL
    );
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
       scope, category, calculation_method, data_quality_score,
       region, region_grid_carbon,
       duration_ms, aborted, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    trace.scope,
    trace.category,
    trace.calculationMethod,
    trace.dataQualityScore,
    trace.region ?? null,
    trace.regionGridCarbon ?? null,
    trace.durationMs ?? null,
    trace.aborted ? 1 : 0,
    trace.error ?? null,
  );
}

export function listCarbonTraces(
  db: DatabaseSync,
  opts?: {
    limit?: number;
    offset?: number;
    provider?: string;
    model?: string;
    since?: number;
  },
): { traces: CarbonTrace[]; total: number } {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  // Build dynamic WHERE clause
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts?.provider) {
    conditions.push("provider = ?");
    params.push(opts.provider);
  }
  if (opts?.model) {
    conditions.push("model = ?");
    params.push(opts.model);
  }
  if (opts?.since) {
    conditions.push("timestamp >= ?");
    params.push(opts.since);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count with filters
  const countRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM carbon_traces ${whereClause}`)
    .get(...params) as { cnt: number };
  const total = countRow.cnt;

  // Query with filters
  const rows = db
    .prepare(`SELECT * FROM carbon_traces ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Array<Record<string, unknown>>;

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
    scope: row.scope as number as 3,
    category: row.category as number as 1,
    calculationMethod: row.calculation_method as string as CarbonTrace["calculationMethod"],
    dataQualityScore: row.data_quality_score as number as CarbonTrace["dataQualityScore"],
    region: (row.region as string) ?? undefined,
    regionGridCarbon: (row.region_grid_carbon as number) ?? undefined,
    durationMs: (row.duration_ms as number) ?? undefined,
    aborted: row.aborted === 1,
    error: (row.error as string) ?? undefined,
  };
}

// -- Aggregations --

// Calculate ISO 14064 uncertainty bounds from confidence (inline to avoid circular dep)
function confidenceToUncertaintyBounds(confidence: number): { lower: number; upper: number } {
  if (confidence >= 0.7) return { lower: 0.85, upper: 1.15 }; // ±15%
  if (confidence >= 0.5) return { lower: 0.7, upper: 1.3 }; // ±30%
  if (confidence >= 0.3) return { lower: 0.5, upper: 1.5 }; // ±50%
  return { lower: 0.0, upper: 2.0 }; // ±100%
}

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
        MAX(timestamp) as max_ts,
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens), 0) as total_tokens
      FROM carbon_traces`,
    )
    .get() as Record<string, unknown>;

  const traceCount = row.trace_count as number;
  const totalCo2Grams = row.total_co2 as number;
  const totalTokens = row.total_tokens as number;
  const avgConfidence = (row.avg_confidence as number) ?? 0;

  // Calculate TCFD intensity metrics
  const intensityPerMillionTokens = totalTokens > 0 ? (totalCo2Grams / totalTokens) * 1_000_000 : 0;
  const intensityPerQuery = traceCount > 0 ? totalCo2Grams / traceCount : 0;

  // Calculate ISO 14064 uncertainty bounds
  const uncertainty = confidenceToUncertaintyBounds(avgConfidence);

  return {
    traceCount,
    totalCo2Grams,
    totalWaterMl: row.total_water as number,
    avgCo2PerTrace: (row.avg_co2 as number) ?? 0,
    avgConfidence,
    minTimestamp: (row.min_ts as number) ?? null,
    maxTimestamp: (row.max_ts as number) ?? null,
    totalTokens,
    intensityPerMillionTokens,
    intensityPerQuery,
    uncertaintyLower: uncertainty.lower,
    uncertaintyUpper: uncertainty.upper,
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

// -- Period-based queries --

export function getCarbonSummaryForPeriod(
  db: DatabaseSync,
  startTs: number,
  endTs: number,
): CarbonSummary {
  const row = db
    .prepare(
      `SELECT
        COUNT(*) as trace_count,
        COALESCE(SUM(total_co2_grams), 0) as total_co2,
        COALESCE(SUM(water_ml), 0) as total_water,
        AVG(total_co2_grams) as avg_co2,
        AVG(factor_confidence) as avg_confidence,
        MIN(timestamp) as min_ts,
        MAX(timestamp) as max_ts,
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens), 0) as total_tokens
      FROM carbon_traces
      WHERE timestamp >= ? AND timestamp <= ?`,
    )
    .get(startTs, endTs) as Record<string, unknown>;

  const traceCount = row.trace_count as number;
  const totalCo2Grams = row.total_co2 as number;
  const totalTokens = row.total_tokens as number;
  const avgConfidence = (row.avg_confidence as number) ?? 0;

  const intensityPerMillionTokens = totalTokens > 0 ? (totalCo2Grams / totalTokens) * 1_000_000 : 0;
  const intensityPerQuery = traceCount > 0 ? totalCo2Grams / traceCount : 0;
  const uncertainty = confidenceToUncertaintyBounds(avgConfidence);

  return {
    traceCount,
    totalCo2Grams,
    totalWaterMl: row.total_water as number,
    avgCo2PerTrace: (row.avg_co2 as number) ?? 0,
    avgConfidence,
    minTimestamp: (row.min_ts as number) ?? null,
    maxTimestamp: (row.max_ts as number) ?? null,
    totalTokens,
    intensityPerMillionTokens,
    intensityPerQuery,
    uncertaintyLower: uncertainty.lower,
    uncertaintyUpper: uncertainty.upper,
  };
}

export function getEmissionsForYear(db: DatabaseSync, year: number): number {
  const startTs = new Date(year, 0, 1).getTime();
  const endTs = new Date(year + 1, 0, 1).getTime() - 1;
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(total_co2_grams), 0) as total_co2 FROM carbon_traces WHERE timestamp >= ? AND timestamp <= ?`,
    )
    .get(startTs, endTs) as { total_co2: number };
  return row.total_co2;
}

// -- Carbon Targets CRUD --

function rowToTarget(row: Record<string, unknown>): CarbonTarget {
  return {
    targetId: row.target_id as string,
    name: row.name as string,
    baseYear: row.base_year as number,
    baseYearEmissionsGrams: row.base_year_emissions_grams as number,
    targetYear: row.target_year as number,
    targetReductionPercent: row.target_reduction_percent as number,
    pathway: row.pathway as CarbonTarget["pathway"],
    createdAt: row.created_at as number,
  };
}

export function insertCarbonTarget(db: DatabaseSync, target: CarbonTarget): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO carbon_targets
      (target_id, name, base_year, base_year_emissions_grams, target_year, target_reduction_percent, pathway, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    target.targetId,
    target.name,
    target.baseYear,
    target.baseYearEmissionsGrams,
    target.targetYear,
    target.targetReductionPercent,
    target.pathway,
    target.createdAt,
  );
}

export function listCarbonTargets(db: DatabaseSync): CarbonTarget[] {
  const rows = db.prepare("SELECT * FROM carbon_targets ORDER BY created_at DESC").all() as Array<
    Record<string, unknown>
  >;
  return rows.map(rowToTarget);
}

export function getCarbonTarget(db: DatabaseSync, targetId: string): CarbonTarget | null {
  const row = db.prepare("SELECT * FROM carbon_targets WHERE target_id = ?").get(targetId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToTarget(row) : null;
}

export function deleteCarbonTarget(db: DatabaseSync, targetId: string): boolean {
  const result = db.prepare("DELETE FROM carbon_targets WHERE target_id = ?").run(targetId);
  return result.changes > 0;
}

export function getTargetProgress(db: DatabaseSync, targetId: string): TargetProgress | null {
  const target = getCarbonTarget(db, targetId);
  if (!target) return null;

  const currentYear = new Date().getFullYear();
  const currentYearEmissions = getEmissionsForYear(db, currentYear);

  // Calculate progress toward target
  const targetEmissions = target.baseYearEmissionsGrams * (1 - target.targetReductionPercent / 100);
  const yearsElapsed = currentYear - target.baseYear;
  const totalYears = target.targetYear - target.baseYear;

  // Linear progress calculation
  const expectedProgress = totalYears > 0 ? yearsElapsed / totalYears : 0;
  const expectedEmissions =
    target.baseYearEmissionsGrams -
    expectedProgress * (target.baseYearEmissionsGrams - targetEmissions);

  // Calculate actual progress percentage
  const actualReduction = target.baseYearEmissionsGrams - currentYearEmissions;
  const requiredReduction = target.baseYearEmissionsGrams - targetEmissions;
  const progressPercent = requiredReduction > 0 ? (actualReduction / requiredReduction) * 100 : 0;

  // Determine if on track
  const onTrack = currentYearEmissions <= expectedEmissions;

  // Project when target will be met at current rate
  let projectedEndYear: number | null = null;
  if (yearsElapsed > 0 && target.baseYearEmissionsGrams > 0) {
    const annualReduction = (target.baseYearEmissionsGrams - currentYearEmissions) / yearsElapsed;
    if (annualReduction > 0) {
      const remainingReduction = currentYearEmissions - targetEmissions;
      const yearsNeeded = remainingReduction / annualReduction;
      projectedEndYear = Math.ceil(currentYear + yearsNeeded);
    }
  }

  return {
    target,
    currentYearEmissionsGrams: currentYearEmissions,
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    onTrack,
    projectedEndYear,
  };
}
