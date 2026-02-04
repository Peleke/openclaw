/**
 * Post-run hook: captures carbon trace and persists to green DB.
 */

import crypto from "node:crypto";
import type { NormalizedUsage } from "../agents/usage.js";
import type { CarbonTrace } from "./types.js";
import { calculateCarbon } from "./carbon-calculator.js";
import { insertCarbonTrace, openGreenDb } from "./store.js";
import { log } from "./logger.js";

export type CaptureGreenTraceParams = {
  runId: string;
  sessionId: string;
  sessionKey?: string;
  usage?: NormalizedUsage;
  durationMs: number;
  channel?: string;
  provider?: string;
  model?: string;
  aborted: boolean;
  error?: string;
  agentDir: string;
  gridCarbon?: number;
};

export function captureGreenTrace(params: CaptureGreenTraceParams): CarbonTrace {
  const { usage, provider, model } = params;

  const calc = calculateCarbon(
    {
      input: usage?.input,
      output: usage?.output,
      cacheRead: usage?.cacheRead,
    },
    provider,
    model,
  );

  return {
    traceId: crypto.randomUUID(),
    runId: params.runId,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    timestamp: Date.now(),
    provider: params.provider,
    model: params.model,
    channel: params.channel,
    inputTokens: usage?.input ?? 0,
    outputTokens: usage?.output ?? 0,
    cacheReadTokens: usage?.cacheRead ?? 0,
    inputCo2Grams: calc.inputCo2Grams,
    outputCo2Grams: calc.outputCo2Grams,
    cacheCo2Grams: calc.cacheCo2Grams,
    totalCo2Grams: calc.totalCo2Grams,
    waterMl: calc.waterMl,
    factorConfidence: calc.factor.confidence,
    factorSource: calc.factor.source,
    gridCarbonUsed: params.gridCarbon ?? 400,
    durationMs: params.durationMs,
    aborted: params.aborted,
    error: params.error,
  };
}

/**
 * One-shot: capture trace and store it. Called from post-run hook.
 * Swallows errors to avoid disrupting the main run flow.
 */
export function captureAndStoreGreenTrace(params: CaptureGreenTraceParams): CarbonTrace | null {
  try {
    const trace = captureGreenTrace(params);
    const db = openGreenDb(params.agentDir);
    try {
      insertCarbonTrace(db, trace);
    } finally {
      db.close();
    }
    log.debug(`green: captured trace ${trace.traceId} (${trace.totalCo2Grams.toFixed(2)}g CO2)`);
    return trace;
  } catch (err) {
    log.debug(`green: trace capture failed: ${String(err)}`);
    return null;
  }
}
