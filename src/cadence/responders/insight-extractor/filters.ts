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
 */
export function shouldExtract(content: string, config: FilterConfig): FilterResult {
  // Check for magic string at start
  if (!content.startsWith(config.magicString)) {
    return { shouldExtract: false, reason: "Missing magic string" };
  }

  // Strip magic string and leading whitespace
  const afterMagic = content.slice(config.magicString.length);
  const strippedContent = afterMagic.replace(/^[\s]*/, "");

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
