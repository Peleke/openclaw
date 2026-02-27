/**
 * LLM prompts for GitHub activity synthesis.
 *
 * Takes structured GitHub scan data and produces a narrative
 * engineering log suitable for LinkedIn publishing.
 */

import type { RepoScanResult } from "./types.js";

/**
 * System prompt for the synthesis LLM call.
 */
export function buildSynthesisSystemPrompt(): string {
  return `You are writing source material for a LinkedIn content pipeline. Your output will be fed into an AI reshape engine that decomposes it into angle-specific LinkedIn posts. You are NOT writing LinkedIn posts — you are writing beat-rich source notes.

Write in first person as the author (a technical founder building in public).

Structure your output as 3-5 BEATS. Each beat is a discrete story unit (2-4 sentences) that captures one moment, decision, struggle, or insight. The reshape engine picks different beats for different post angles, so each beat should stand alone as interesting material.

Beat types that work best (include at least 3 different types):
- SHIPPING BEAT: Concrete "I did X" with numbers (PRs merged, files changed, tests passing)
- ARCHITECTURE BEAT: A technical decision explained simply enough for a senior non-specialist
- STRUGGLE BEAT: Something that went wrong, took longer than expected, or challenged an assumption. Be specific about the failure. This is the most important beat — LinkedIn posts with tension outperform everything else.
- INSIGHT BEAT: A lesson or contrarian take. "The thing nobody tells you" or "what I wish I knew"
- CONNECTION BEAT: Link this work to a bigger trend, an open question, or a surprising parallel from another domain

Prose constraints:
- Specifics over abstractions. "3 PRs across 2 repos" not "made good progress"
- Active voice. "I shipped" not "the feature was shipped"
- One idea per sentence
- Name tools and technologies explicitly (TypeScript, Obsidian, overlayfs — not "a language" or "a tool")
- NO LinkedIn formatting (no short-line tricks, no emojis, no hashtags)
- NO markdown headers (the reshape engine handles structure)
- NO frontmatter or YAML
- NO code blocks wrapping the response
- End with an open thread: a question, a "what's next," or an unresolved tension
- 300-800 words ideal. Never exceed 1200.
- Write natural flowing prose, not bullet points`;
}

/**
 * Build the user prompt from scan results.
 */
export function buildSynthesisUserPrompt(repos: RepoScanResult[], scanDate: string): string {
  const sections: string[] = [`GitHub Activity for ${scanDate}`, ""];

  for (const repo of repos) {
    const parts: string[] = [`## ${repo.fullName}`];

    if (repo.mergedPRs.length > 0) {
      parts.push("### Merged PRs");
      for (const pr of repo.mergedPRs) {
        parts.push(`- #${pr.number}: ${pr.title} (${pr.url})`);
      }
    }

    if (repo.openPRs.length > 0) {
      parts.push("### Open PRs");
      for (const pr of repo.openPRs) {
        parts.push(`- #${pr.number}: ${pr.title} (${pr.url})`);
      }
    }

    if (repo.buildlogEntries.length > 0) {
      parts.push("### Buildlog Entries");
      for (const entry of repo.buildlogEntries) {
        parts.push(`- ${entry.name}:`);
        parts.push(`  ${entry.content}`);
      }
    }

    sections.push(parts.join("\n"));
  }

  sections.push(
    "",
    "Write 3-5 beats from this activity. Lead with the most impactful shipping beat. Include at least one struggle or surprise (something that went wrong or was counterintuitive). End with an open thread — a question or unresolved tension. Do NOT write a laundry list of commits. Pick the 1-2 most interesting threads and tell their story with specific details.",
  );

  return sections.join("\n");
}

/**
 * Parse the LLM response. The response IS the markdown — no JSON parsing needed.
 * Returns null if the response is too short to be useful.
 */
export function parseSynthesisResponse(response: string): string | null {
  const trimmed = response.trim();

  // Strip code fences if the LLM wraps output in them
  const unwrapped = trimmed
    .replace(/^```(?:markdown|md)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  if (unwrapped.length < 50) {
    return null;
  }

  return unwrapped;
}
