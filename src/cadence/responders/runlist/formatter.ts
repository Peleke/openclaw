/**
 * Runlist message formatter.
 *
 * Formats morning ping and nightly recap messages for Telegram.
 * No emoji. No motivation. Just the list and what's stale.
 */

import type { RunletSummary, TaskCompletion, RunletTask } from "./types.js";

/**
 * Format the morning ping message.
 *
 * Example:
 * ```
 * Morning. 3 Do First, 2 Block Time, 1 Batch.
 * Top: LinkedIn outreach (5 convos).
 * Carried from yesterday: Atlanta meetup search.
 * ```
 */
export function formatMorningPing(summary: RunletSummary): string {
  const { counts, top_task, carried, focus } = summary;

  const parts: string[] = [];

  // Line 1: counts
  const countParts: string[] = [];
  if (counts.do_first > 0) countParts.push(`${counts.do_first} Do First`);
  if (counts.block_time > 0) countParts.push(`${counts.block_time} Block Time`);
  if (counts.batch > 0) countParts.push(`${counts.batch} Batch`);

  if (countParts.length === 0) {
    parts.push(`Morning. Nothing on the list. Focus: ${focus}.`);
    return parts.join("\n");
  }

  parts.push(`Morning. ${countParts.join(", ")}. Focus: ${focus}.`);

  // Line 2: top task
  if (top_task) {
    parts.push(`Top: ${top_task}.`);
  }

  // Line 3: carries
  if (carried.length > 0) {
    parts.push(`Carried from yesterday: ${carried.join(", ")}.`);
  }

  return parts.join("\n");
}

/**
 * Format the nightly recap message.
 *
 * Example:
 * ```
 * Nightly. 4/6 done.
 * Unchecked: Discord servers, Atlanta meetups.
 * Atlanta meetups carried 3x — block time tomorrow or kill it.
 * ```
 */
export function formatNightlyRecap(
  summary: RunletSummary,
  completion: TaskCompletion,
  forcedDecisions: RunletTask[],
): string {
  const total = completion.done.length + completion.pending.length;
  const parts: string[] = [];

  // Line 1: completion rate
  if (total === 0) {
    parts.push("Nightly. No tasks tracked today.");
    return parts.join("\n");
  }

  parts.push(`Nightly. ${completion.done.length}/${total} done.`);

  // Line 2: unchecked items
  if (completion.pending.length > 0) {
    const unchecked = completion.pending.slice(0, 5); // Cap at 5 for readability
    const suffix = completion.pending.length > 5 ? ` (+${completion.pending.length - 5} more)` : "";
    parts.push(`Unchecked: ${unchecked.join(", ")}${suffix}.`);
  }

  // Line 3+: forced decisions (3-carry rule)
  for (const task of forcedDecisions) {
    parts.push(`${task.description} carried 3x — block time tomorrow or kill it.`);
  }

  return parts.join("\n");
}
