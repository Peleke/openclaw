/**
 * Pre-run selection hook for Thompson Sampling.
 *
 * Called before buildEmbeddedSystemPrompt() to select which arms to include
 * in the prompt based on learned posteriors.
 */

import type { DatabaseSync } from "node:sqlite";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type {
  LearningConfig,
  Arm,
  ArmId,
  SelectionResult,
  SelectionContext,
  ArmType,
} from "./types.js";
import { buildArmId } from "./types.js";
import { loadPosteriors } from "./store.js";
import { ThompsonStrategy, SEED_ARM_IDS } from "./strategy.js";
import { log } from "./logger.js";

export type SkillEntry = {
  name: string;
  promptChars: number;
};

export type ContextFile = {
  path: string;
  content: string;
};

export type PreRunSelectionParams = {
  db: DatabaseSync;
  config: LearningConfig;
  tools: AgentTool[];
  skillEntries: SkillEntry[];
  contextFiles: ContextFile[];
  context: SelectionContext;
};

export type PreRunSelectionResult = {
  selection: SelectionResult;
  selectedTools: AgentTool[];
  selectedSkillNames: string[];
  selectedFilePaths: string[];
};

/**
 * Select prompt components using Thompson Sampling.
 *
 * In passive mode or when disabled, returns all components.
 * In active mode, uses Thompson Sampling to select arms.
 */
export function selectPromptComponents(params: PreRunSelectionParams): PreRunSelectionResult {
  const { db, config, tools, skillEntries, contextFiles, context } = params;

  // Build arm inventory from all available components
  const arms = buildArmInventory({ tools, skillEntries, contextFiles });

  // Load current posteriors from SQLite
  const posteriors = loadPosteriors(db);

  // Create Thompson Sampling strategy
  const strategy = new ThompsonStrategy({
    baselineRate: config.baselineRate ?? 0.1,
    minPulls: config.minPulls ?? 5,
    seedArmIds: SEED_ARM_IDS,
  });

  // Run selection
  const tokenBudget = config.tokenBudget ?? 8000;
  const selection = strategy.select({ arms, posteriors, context, tokenBudget });
  const selectedSet = new Set(selection.selectedArms);

  log.debug(
    `learning: selected ${selection.selectedArms.length}/${arms.length} arms ` +
      `(${selection.usedTokens}/${tokenBudget} tokens, baseline=${selection.isBaseline})`,
  );

  // Filter components based on selection
  return {
    selection,
    selectedTools: tools.filter((t) => selectedSet.has(buildToolArmId(t))),
    selectedSkillNames: skillEntries
      .filter((s) => selectedSet.has(buildArmId("skill", s.name, "main")))
      .map((s) => s.name),
    selectedFilePaths: contextFiles
      .filter((f) => selectedSet.has(buildArmId("file", "workspace", f.path)))
      .map((f) => f.path),
  };
}

/**
 * Build arm inventory from tools, skills, and context files.
 */
function buildArmInventory(params: {
  tools: AgentTool[];
  skillEntries: SkillEntry[];
  contextFiles: ContextFile[];
}): Arm[] {
  const arms: Arm[] = [];

  // Tools
  for (const tool of params.tools) {
    const category = inferToolCategory(tool.name);
    const schemaChars = JSON.stringify(tool).length;
    arms.push({
      id: buildArmId("tool", category, tool.name),
      type: "tool",
      category,
      label: tool.name,
      tokenCost: Math.ceil(schemaChars / 4),
    });
  }

  // Skills
  for (const entry of params.skillEntries) {
    arms.push({
      id: buildArmId("skill", entry.name, "main"),
      type: "skill",
      category: entry.name,
      label: entry.name,
      tokenCost: Math.ceil(entry.promptChars / 4),
    });
  }

  // Context files
  for (const file of params.contextFiles) {
    arms.push({
      id: buildArmId("file", "workspace", file.path),
      type: "file",
      category: "workspace",
      label: file.path,
      tokenCost: Math.ceil(file.content.length / 4),
    });
  }

  return arms;
}

/**
 * Build arm ID for a tool.
 */
function buildToolArmId(tool: AgentTool): ArmId {
  const category = inferToolCategory(tool.name);
  return buildArmId("tool", category, tool.name);
}

/**
 * Infer tool category from tool name.
 */
function inferToolCategory(toolName: string): string {
  if (/^(bash|exec|shell|run)/i.test(toolName)) return "exec";
  if (/^(read|write|edit|glob|grep)/i.test(toolName)) return "fs";
  if (/^(memory|remember|recall)/i.test(toolName)) return "memory";
  if (/^(web|fetch|browse|search)/i.test(toolName)) return "web";
  if (/^(send|reply|message)/i.test(toolName)) return "messaging";
  return "other";
}

/**
 * Infer arm source for prior selection.
 */
export function inferArmSource(armType: ArmType): "curated" | "learned" {
  return armType === "file" ? "learned" : "curated";
}
