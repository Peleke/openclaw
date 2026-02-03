/**
 * Insight Extractor types.
 */

export interface PillarConfig {
  id: string;
  name: string;
  keywords: string[];
}

export interface ExtractedInsight {
  id: string;
  topic: string;
  pillar: string | null;
  hook: string;
  excerpt: string;
  scores: {
    topicClarity: number;
    publishReady: number;
    novelty: number;
  };
  formats: string[];
  concepts?: Array<{
    name: string;
    type: "entity" | "concept" | "theme";
    confidence: number;
  }>;
}

export interface FilterConfig {
  magicString: string;
  minContentLength: number;
}

export interface FilterResult {
  shouldExtract: boolean;
  content?: string;
  reason?: string;
}

export interface ExtractorConfig {
  /** Content pillars for categorization */
  pillars: PillarConfig[];

  /** Magic string to trigger extraction (default: "::publish") */
  magicString: string;

  /** Minimum content length after magic string (default: 50) */
  minContentLength: number;

  /** Debounce delay for file changes in ms (default: 2000) */
  debounceMs: number;

  /** Max batch size for LLM calls (default: 5) */
  maxBatchSize: number;

  /** Min delay between batches in ms (default: 1000) */
  minBatchDelayMs: number;

  /** LLM model to use (default: "claude-3-haiku") */
  model?: string;
}

export const DEFAULT_EXTRACTOR_CONFIG: ExtractorConfig = {
  pillars: [],
  magicString: "::publish",
  minContentLength: 50,
  debounceMs: 2000,
  maxBatchSize: 5,
  minBatchDelayMs: 1000,
};
