/**
 * Build system prompt guidance for excluded tools.
 *
 * When the learning bandit excludes tools, the model needs to know so it can
 * explain to users when they request unavailable capabilities instead of
 * silently producing an empty response.
 */

import { parseArmId } from "./types.js";

/**
 * Build a system prompt fragment listing excluded tool names.
 * Returns null if no tools were excluded (nothing to inject).
 */
export function buildExcludedToolsGuidance(excludedArms?: string[]): string | null {
  if (!excludedArms || excludedArms.length === 0) return null;

  // Extract human-readable names from excluded arm IDs (only tool-type arms)
  const excludedToolNames: string[] = [];
  for (const armId of excludedArms) {
    const parsed = parseArmId(armId);
    if (parsed?.type === "tool") {
      excludedToolNames.push(parsed.id);
    }
  }

  if (excludedToolNames.length === 0) return null;

  return (
    `Note: The following tools are currently unavailable: ${excludedToolNames.join(", ")}. ` +
    `If the user requests a capability that requires an unavailable tool, ` +
    `briefly explain that the capability is temporarily unavailable and suggest alternatives or ask them to try again later.`
  );
}
