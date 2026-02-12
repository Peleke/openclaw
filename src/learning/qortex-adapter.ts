/**
 * Domain adapter: bridges openclaw's prompt components (tools, skills, files)
 * with qortex's generic bandit arms.
 *
 * This module owns the translation between openclaw's hierarchical arm IDs
 * ("tool:fs:Read", "skill:coding:main", "file:workspace:foo.md") and qortex's
 * flat arm format ({ id, metadata, token_cost }).
 *
 * Reference detection stays here — it's domain-specific to openclaw.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";

import type { QortexLearningClient, QortexArm, QortexSelectResult } from "./qortex-client.js";
import { detectReference } from "./reference-detection.js";
import type { ArmId, ArmType, LearningConfig, SelectionContext, SelectionResult } from "./types.js";
import { buildArmId } from "./types.js";
import { log } from "./logger.js";

// ── Domain types ────────────────────────────────────────────────────

export type SkillEntry = {
  name: string;
  promptChars: number;
};

export type ContextFile = {
  path: string;
  content: string;
};

export type AdapterSelectionResult = {
  selection: SelectionResult;
  selectedTools: AgentTool[];
  selectedSkillNames: string[];
  selectedFilePaths: string[];
};

// ── Arm building ────────────────────────────────────────────────────

/** Build qortex arm candidates from openclaw's prompt components. */
export function buildCandidates(params: {
  tools: AgentTool[];
  skillEntries: SkillEntry[];
  contextFiles: ContextFile[];
}): QortexArm[] {
  const arms: QortexArm[] = [];

  for (const tool of params.tools) {
    const category = inferToolCategory(tool.name);
    const armId = buildArmId("tool", category, tool.name);
    const schemaChars = JSON.stringify(tool).length;
    arms.push({
      id: armId,
      metadata: { type: "tool", category, label: tool.name },
      token_cost: Math.ceil(schemaChars / 4),
    });
  }

  for (const entry of params.skillEntries) {
    const armId = buildArmId("skill", entry.name, "main");
    arms.push({
      id: armId,
      metadata: { type: "skill", category: entry.name, label: entry.name },
      token_cost: Math.ceil(entry.promptChars / 4),
    });
  }

  for (const file of params.contextFiles) {
    const armId = buildArmId("file", "workspace", file.path);
    arms.push({
      id: armId,
      metadata: { type: "file", category: "workspace", label: file.path },
      token_cost: Math.ceil(file.content.length / 4),
    });
  }

  return arms;
}

// ── Selection mapping ───────────────────────────────────────────────

/**
 * Run qortex selection and map results back to openclaw's domain types.
 *
 * When qortex is unavailable or returns null, includes all components
 * (passive/degraded mode).
 */
export async function selectViaQortex(params: {
  client: QortexLearningClient;
  config: LearningConfig;
  tools: AgentTool[];
  skillEntries: SkillEntry[];
  contextFiles: ContextFile[];
  context: SelectionContext;
}): Promise<AdapterSelectionResult> {
  const { client, config, tools, skillEntries, contextFiles, context } = params;
  const candidates = buildCandidates({ tools, skillEntries, contextFiles });
  const tokenBudget = config.tokenBudget ?? 8000;

  // Build qortex context with phase for experiment tracking
  const qortexContext: Record<string, unknown> = {};
  if (context.sessionKey) qortexContext.session_key = context.sessionKey;
  if (context.channel) qortexContext.channel = context.channel;
  if (context.provider) qortexContext.provider = context.provider;
  if (context.model) qortexContext.model = context.model;
  if (config.phase) qortexContext.phase = config.phase;

  const result = await client.select(candidates, {
    token_budget: tokenBudget,
    context: qortexContext,
  });

  if (!result) {
    // Qortex unavailable: include everything (degraded mode)
    return includeAll({ tools, skillEntries, contextFiles, tokenBudget });
  }

  return mapSelectionBack(result, { tools, skillEntries, contextFiles });
}

/** Map qortex's selection result back to openclaw's domain types. */
function mapSelectionBack(
  result: QortexSelectResult,
  components: {
    tools: AgentTool[];
    skillEntries: SkillEntry[];
    contextFiles: ContextFile[];
  },
): AdapterSelectionResult {
  const selectedSet = new Set(result.selected_arms);

  const selection: SelectionResult = {
    selectedArms: result.selected_arms,
    excludedArms: result.excluded_arms,
    isBaseline: result.is_baseline,
    totalTokenBudget: result.token_budget,
    usedTokens: result.used_tokens,
  };

  log.debug(
    `learning: qortex selected ${result.selected_arms.length} arms ` +
      `(${result.used_tokens}/${result.token_budget} tokens, baseline=${result.is_baseline})`,
  );

  return {
    selection,
    selectedTools: components.tools.filter((t) =>
      selectedSet.has(buildArmId("tool", inferToolCategory(t.name), t.name)),
    ),
    selectedSkillNames: components.skillEntries
      .filter((s) => selectedSet.has(buildArmId("skill", s.name, "main")))
      .map((s) => s.name),
    selectedFilePaths: components.contextFiles
      .filter((f) => selectedSet.has(buildArmId("file", "workspace", f.path)))
      .map((f) => f.path),
  };
}

/** Include all components (degraded / passive mode). */
function includeAll(params: {
  tools: AgentTool[];
  skillEntries: SkillEntry[];
  contextFiles: ContextFile[];
  tokenBudget: number;
}): AdapterSelectionResult {
  const allArmIds: ArmId[] = [
    ...params.tools.map((t) => buildArmId("tool", inferToolCategory(t.name), t.name)),
    ...params.skillEntries.map((s) => buildArmId("skill", s.name, "main")),
    ...params.contextFiles.map((f) => buildArmId("file", "workspace", f.path)),
  ];

  return {
    selection: {
      selectedArms: allArmIds,
      excludedArms: [],
      isBaseline: true,
      totalTokenBudget: params.tokenBudget,
      usedTokens: 0,
    },
    selectedTools: params.tools,
    selectedSkillNames: params.skillEntries.map((s) => s.name),
    selectedFilePaths: params.contextFiles.map((f) => f.path),
  };
}

// ── Post-run observation ────────────────────────────────────────────

/**
 * Observe outcomes for all arms in a completed run.
 *
 * For each arm that was included in the run, detects whether it was
 * referenced in the assistant's output and reports the outcome to qortex.
 *
 * Runs on fire-and-forget — errors are swallowed.
 */
export async function observeRunOutcomes(params: {
  client: QortexLearningClient;
  config: LearningConfig;
  selection: SelectionResult;
  assistantTexts: string[];
  toolMetas: Array<{ toolName: string; meta?: string }>;
  context?: Record<string, unknown>;
}): Promise<void> {
  const { client, config, selection, assistantTexts, toolMetas } = params;

  // Only observe in active phase
  if (config.phase !== "active") return;

  const qortexContext: Record<string, unknown> = { ...params.context };
  if (config.phase) qortexContext.phase = config.phase;

  // Observe each included arm
  const promises: Promise<unknown>[] = [];
  for (const armId of selection.selectedArms) {
    const armType = inferArmTypeFromId(armId);
    // For skills, the meaningful label is the category (skill name), not the id ("main").
    // Arm ID format: "type:category:id"
    const parts = armId.split(":");
    const armLabel =
      armType === "skill" ? (parts[1] ?? parts.slice(2).join(":")) : parts.slice(2).join(":");

    const referenced = detectReference({
      armId,
      armType,
      armLabel,
      assistantTexts,
      toolMetas,
    });

    const outcome = referenced ? "accepted" : "rejected";
    promises.push(
      client.observe(armId, outcome, {
        reward: referenced ? 1.0 : 0.0,
        context: qortexContext,
      }),
    );
  }

  await Promise.allSettled(promises);
}

// ── Helpers ─────────────────────────────────────────────────────────

function inferToolCategory(toolName: string): string {
  if (/^(bash|exec|shell|run)/i.test(toolName)) return "exec";
  if (/^(read|write|edit|glob|grep)/i.test(toolName)) return "fs";
  if (/^(memory|remember|recall)/i.test(toolName)) return "memory";
  if (/^(web|fetch|browse|search)/i.test(toolName)) return "web";
  if (/^(send|reply|message)/i.test(toolName)) return "messaging";
  return "other";
}

function inferArmTypeFromId(armId: string): ArmType {
  const type = armId.split(":")[0];
  if (
    type === "tool" ||
    type === "skill" ||
    type === "file" ||
    type === "memory" ||
    type === "section"
  ) {
    return type;
  }
  return "tool";
}
