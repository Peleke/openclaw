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
  return `You are a technical writer who synthesizes daily GitHub activity into a concise, narrative engineering log.

Your output will be published on LinkedIn, so write in first person, with a conversational but professional tone.

Guidelines:
- Lead with the most impactful work (shipped features, merged PRs, architecture decisions)
- Group related work across repos when it tells a coherent story
- Include specific technical details that demonstrate craft (not vague platitudes)
- Reference PR numbers and repo names naturally
- If buildlog entries exist, weave their insights into the narrative
- Keep it under 800 words
- Use markdown formatting (headers, bold, lists) for readability
- Do NOT include frontmatter or YAML headers
- Do NOT wrap the response in code blocks`;
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
    "Synthesize this into a narrative engineering log. Focus on the story of what was built and why it matters.",
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
