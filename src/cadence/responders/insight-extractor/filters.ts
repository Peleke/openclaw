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
 * Check if content should be extracted based on magic string and length.
 *
 * Magic string location:
 * - If line 1 is a heading (# Title), check line 2 for magic string
 * - Otherwise, check line 1 for magic string
 */
export function shouldExtract(content: string, config: FilterConfig): FilterResult {
  const lines = content.split("\n");

  // Determine which line should have the magic string
  let magicLineIndex = 0;
  if (lines[0]?.trim().startsWith("#")) {
    // Line 1 is a heading, magic string should be on line 2
    magicLineIndex = 1;
  }

  // Check for magic string
  const magicLine = lines[magicLineIndex]?.trim();
  if (magicLine !== config.magicString) {
    return {
      shouldExtract: false,
      reason:
        magicLineIndex === 0
          ? "Missing magic string on first line"
          : "Missing magic string on line after title",
    };
  }

  // Get content after magic string line (keep the title if present)
  const contentLines = [
    ...(magicLineIndex === 1 ? [lines[0]] : []), // Keep title if it exists
    ...lines.slice(magicLineIndex + 1),
  ];
  const strippedContent = contentLines.join("\n").replace(/^[\s]*/, "");

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
