/**
 * Content filtering for insight extraction.
 *
 * - Magic string detection (::publish)
 * - Minimum content length validation
 * - Path-based filtering (skip test files, dot files)
 */

import path from "node:path";
import type { FilterConfig, FilterResult } from "./types.js";

/**
 * Check if a line is a Markdown heading (# Title, ## Subtitle, etc.)
 * A heading must start with one or more # followed by a space or end of line.
 */
function isMarkdownHeading(line: string): boolean {
  const trimmed = line.trim();
  // Match: one or more #, then either space+content or end of string
  return /^#+(\s|$)/.test(trimmed);
}

/**
 * Check if content should be extracted based on magic string and length.
 *
 * Magic string location:
 * - If line 1 is a Markdown heading (# Title), check line 2 for magic string
 * - Otherwise, check line 1 for magic string
 *
 * The magic string can either:
 * - Be on its own line: "::publish\n\nContent here"
 * - Have immediate content: "::publishContent follows immediately"
 */
export function shouldExtract(content: string, config: FilterConfig): FilterResult {
  const lines = content.split("\n");

  // Determine which line should have the magic string
  let magicLineIndex = 0;
  const hasHeadingOnLine0 = lines[0] && isMarkdownHeading(lines[0]);
  if (hasHeadingOnLine0) {
    magicLineIndex = 1;
  }

  // Check for magic string (must start the line)
  const magicLine = lines[magicLineIndex] ?? "";
  const trimmedMagicLine = magicLine.trim();

  if (!trimmedMagicLine.startsWith(config.magicString)) {
    return {
      shouldExtract: false,
      reason: "Missing magic string",
    };
  }

  // Extract content after magic string
  const afterMagicOnSameLine = trimmedMagicLine.slice(config.magicString.length);
  const remainingLines = lines.slice(magicLineIndex + 1);

  // Build content array
  const contentParts: string[] = [];

  // Include title if we had a heading
  if (hasHeadingOnLine0) {
    contentParts.push(lines[0]);
  }

  // Include content after magic string on same line (if any)
  if (afterMagicOnSameLine) {
    contentParts.push(afterMagicOnSameLine);
  }

  // Include remaining lines
  contentParts.push(...remainingLines);

  // Join and strip leading whitespace
  const strippedContent = contentParts.join("\n").replace(/^[\s]*/, "");

  // Check minimum length
  if (strippedContent.length < config.minContentLength) {
    return {
      shouldExtract: false,
      reason: `Content too short (${strippedContent.length} < ${config.minContentLength})`,
    };
  }

  return { shouldExtract: true, content: strippedContent };
}

/**
 * Extract pillar hint from frontmatter.
 * Returns undefined if no valid pillar hint found.
 */
export function extractPillarHint(frontmatter: Record<string, unknown>): string | undefined {
  const pillar = frontmatter.pillar;

  // Must be a non-empty string
  if (typeof pillar !== "string") {
    return undefined;
  }

  const trimmed = pillar.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

/**
 * Check if a path should be skipped from extraction.
 * Skips:
 * - _cadence-* files (test files)
 * - _debug-* files (debug files)
 * - .* files (dot files)
 */
export function shouldSkipPath(filePath: string): boolean {
  if (!filePath) {
    return false;
  }

  const basename = path.basename(filePath);

  // Skip _cadence-* test files
  if (basename.startsWith("_cadence-")) {
    return true;
  }

  // Skip _debug-* files
  if (basename.startsWith("_debug-")) {
    return true;
  }

  // Skip dot files
  if (basename.startsWith(".")) {
    return true;
  }

  return false;
}
