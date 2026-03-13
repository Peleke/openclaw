/**
 * Runlist file parser.
 *
 * Extracts RUNLET_SUMMARY JSON from HTML comments and
 * parses markdown checkbox state for completion tracking.
 */

import type { RunletSummary, TaskCompletion, RunletTask } from "./types.js";

/**
 * Extract and parse RUNLET_SUMMARY JSON from a runlist markdown file.
 *
 * Looks for:
 * ```
 * <!-- RUNLET_SUMMARY
 * { ... }
 * -->
 * ```
 */
export function parseRunletSummary(content: string): RunletSummary | null {
  const match = content.match(/<!--\s*RUNLET_SUMMARY\s*\n([\s\S]*?)\n\s*-->/);
  if (!match) return null;

  try {
    return JSON.parse(match[1]) as RunletSummary;
  } catch {
    return null;
  }
}

/**
 * Parse checked/unchecked tasks from markdown checkboxes.
 *
 * Matches `- [x]` (done) and `- [ ]` (pending) lines.
 * Strips entry point sub-items and focus tags.
 */
export function parseTaskCompletion(content: string): TaskCompletion {
  const done: string[] = [];
  const pending: string[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip entry point lines (indented italic sub-items)
    if (trimmed.startsWith("- *Entry point:") || trimmed.startsWith("*Entry point:")) {
      continue;
    }

    // Skip killed items (strikethrough)
    if (trimmed.startsWith("- ~~")) {
      continue;
    }

    const doneMatch = trimmed.match(/^- \[x\]\s+(.+)/i);
    if (doneMatch) {
      done.push(cleanTaskText(doneMatch[1]));
      continue;
    }

    const pendingMatch = trimmed.match(/^- \[ \]\s+(.+)/);
    if (pendingMatch) {
      pending.push(cleanTaskText(pendingMatch[1]));
      continue;
    }
  }

  return { done, pending };
}

/**
 * Find tasks that have been carried 3+ times (forced decision needed).
 */
export function findForcedDecisions(tasks: RunletTask[]): RunletTask[] {
  // Tasks with carried_from set are carries. The 3-carry rule
  // promotes them to kill with a flag in the markdown. We detect
  // these by checking for "carried 3x" in the kill quadrant tasks.
  // But we can also detect from the summary: if a task is in kill
  // quadrant and has carried_from set, it's a forced decision.
  return tasks.filter((t) => t.quadrant === "kill" && t.carried_from !== null);
}

/**
 * Strip focus tags like [H], [M], [C] and trailing whitespace.
 */
function cleanTaskText(text: string): string {
  return text.replace(/\s*\[[A-Z]\]\s*/g, " ").trim();
}
