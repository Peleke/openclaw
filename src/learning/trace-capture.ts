/**
 * Post-run hook: converts an embedded run attempt result into a RunTrace
 * and persists it to the learning DB.
 */

import crypto from "node:crypto";
import type { SessionSystemPromptReport } from "../config/sessions/types.js";
import type { NormalizedUsage } from "../agents/usage.js";
import type { RunTrace, ArmOutcome, Arm } from "./types.js";
import { buildArmId } from "./types.js";
import { detectReference } from "./reference-detection.js";
import { insertRunTrace, openLearningDb } from "./store.js";
import { log } from "./logger.js";

/** Extract arms from a system prompt report. */
export function extractArms(report: SessionSystemPromptReport): Arm[] {
  const arms: Arm[] = [];

  // Tools
  for (const entry of report.tools.entries) {
    const category = inferToolCategory(entry.name);
    arms.push({
      id: buildArmId("tool", category, entry.name),
      type: "tool",
      category,
      label: entry.name,
      tokenCost: Math.ceil(entry.schemaChars / 4),
    });
  }

  // Skills
  for (const entry of report.skills.entries) {
    arms.push({
      id: buildArmId("skill", entry.name, "main"),
      type: "skill",
      category: entry.name,
      label: entry.name,
      tokenCost: Math.ceil(entry.blockChars / 4),
    });
  }

  // Injected workspace files
  for (const entry of report.injectedWorkspaceFiles) {
    if (entry.missing) continue;
    arms.push({
      id: buildArmId("file", "workspace", entry.name),
      type: "file",
      category: "workspace",
      label: entry.name,
      tokenCost: Math.ceil(entry.injectedChars / 4),
    });
  }

  return arms;
}

function inferToolCategory(toolName: string): string {
  if (/^(bash|exec|shell|run)/i.test(toolName)) return "exec";
  if (/^(read|write|edit|glob|grep)/i.test(toolName)) return "fs";
  if (/^(memory|remember|recall)/i.test(toolName)) return "memory";
  if (/^(web|fetch|browse|search)/i.test(toolName)) return "web";
  if (/^(send|reply|message)/i.test(toolName)) return "messaging";
  return "other";
}

export function captureRunTrace(params: {
  runId: string;
  sessionId: string;
  sessionKey?: string;
  report: SessionSystemPromptReport;
  assistantTexts: string[];
  toolMetas: Array<{ toolName: string; meta?: string }>;
  usage?: NormalizedUsage;
  durationMs: number;
  channel?: string;
  provider?: string;
  model?: string;
  isBaseline: boolean;
  aborted: boolean;
  error?: string;
}): RunTrace {
  const arms = extractArms(params.report);

  const armOutcomes: ArmOutcome[] = arms.map((arm) => ({
    armId: arm.id,
    included: true, // In passive phase, all arms are included
    referenced: detectReference({
      armId: arm.id,
      armType: arm.type,
      armLabel: arm.label,
      assistantTexts: params.assistantTexts,
      toolMetas: params.toolMetas,
    }),
    tokenCost: arm.tokenCost,
  }));

  return {
    traceId: crypto.randomUUID(),
    runId: params.runId,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    timestamp: Date.now(),
    provider: params.provider,
    model: params.model,
    channel: params.channel,
    isBaseline: params.isBaseline,
    context: {
      sessionKey: params.sessionKey,
      channel: params.channel,
      provider: params.provider,
      model: params.model,
      promptLength: params.report.systemPrompt.chars,
    },
    arms: armOutcomes,
    usage: params.usage,
    durationMs: params.durationMs,
    systemPromptChars: params.report.systemPrompt.chars,
    aborted: params.aborted,
    error: params.error,
  };
}

/**
 * One-shot: capture trace and store it. Called from the post-run hook.
 * Swallows errors to avoid disrupting the main run flow.
 */
export function captureAndStoreTrace(params: {
  runId: string;
  sessionId: string;
  sessionKey?: string;
  report: SessionSystemPromptReport;
  assistantTexts: string[];
  toolMetas: Array<{ toolName: string; meta?: string }>;
  usage?: NormalizedUsage;
  durationMs: number;
  channel?: string;
  provider?: string;
  model?: string;
  isBaseline: boolean;
  aborted: boolean;
  error?: string;
  agentDir: string;
}): RunTrace | null {
  try {
    const trace = captureRunTrace(params);
    const db = openLearningDb(params.agentDir);
    try {
      insertRunTrace(db, trace);
    } finally {
      db.close();
    }
    log.debug(`learning: captured trace ${trace.traceId} (${trace.arms.length} arms)`);
    return trace;
  } catch (err) {
    log.debug(`learning: trace capture failed: ${err}`);
    return null;
  }
}
