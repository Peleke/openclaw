/**
 * Detects whether an arm was actually "used" (referenced) in the assistant's output.
 */

import type { ArmType } from "./types.js";

export function detectReference(params: {
  armId: string;
  armType: ArmType;
  armLabel: string;
  assistantTexts: string[];
  toolMetas: Array<{ toolName: string; meta?: string }>;
}): boolean {
  const { armType, armLabel, assistantTexts, toolMetas } = params;

  switch (armType) {
    case "tool": {
      // Extract tool name from arm ID "tool:<category>:<name>"
      const toolName = params.armId.split(":").slice(2).join(":");
      return toolMetas.some((tm) => tm.toolName === toolName);
    }
    case "skill": {
      // Skill referenced if any tool meta references it or assistant text mentions it
      const skillName = armLabel.toLowerCase();
      return (
        toolMetas.some((tm) => tm.meta?.toLowerCase().includes(skillName)) ||
        assistantTexts.some((t) => t.toLowerCase().includes(skillName))
      );
    }
    case "file": {
      // File referenced if filename appears in assistant text
      const filename = armLabel.toLowerCase();
      return assistantTexts.some((t) => t.toLowerCase().includes(filename));
    }
    case "memory": {
      // Memory referenced if a substantial substring (20+ chars) appears in output
      if (armLabel.length < 20) {
        return assistantTexts.some((t) => t.includes(armLabel));
      }
      const snippet = armLabel.slice(0, 60).toLowerCase();
      return assistantTexts.some((t) => t.toLowerCase().includes(snippet));
    }
    case "section": {
      // Structural sections are always "used" when included
      return true;
    }
    default:
      return false;
  }
}
