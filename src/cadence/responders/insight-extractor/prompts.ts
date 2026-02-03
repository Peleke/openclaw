/**
 * LLM prompts for insight extraction.
 *
 * Builds system and user prompts for extracting publishable insights
 * from journal content. Parses LLM responses into structured insights.
 */

export interface PillarConfig {
  id: string;
  name: string;
  keywords: string[];
}

export interface ParsedInsight {
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
}

/**
 * Build the system prompt for insight extraction.
 */
export function buildExtractionSystemPrompt(pillars: PillarConfig[]): string {
  const pillarSection =
    pillars.length > 0
      ? pillars.map((p) => `- **${p.id}** (${p.name}): ${p.keywords.join(", ")}`).join("\n")
      : "(No pillars defined)";

  return `You are an insight extraction assistant. Your job is to identify publishable insights from journal entries.

## Content Pillars

${pillarSection}

## Output Format

Return a JSON array of insights. Each insight should have:

- **topic**: A concise topic title (3-8 words)
- **pillar**: The pillar ID this belongs to, or null if unclear
- **hook**: An attention-grabbing opening line (tweet-length)
- **excerpt**: A 1-2 sentence summary of the key insight
- **scores**: Object with three 0-1 scores:
  - **topicClarity**: How clear and focused is the topic?
  - **publishReady**: How ready is this for publishing?
  - **novelty**: How fresh/unique is this perspective?
- **formats**: Array of suitable formats: "thread", "post", "essay", "video"

## Example Output

\`\`\`json
[
  {
    "topic": "Viking Navigation Without Compasses",
    "pillar": "norse",
    "hook": "Vikings crossed oceans without GPS or compasses. Here's how.",
    "excerpt": "Using sun stones and star patterns, Norse sailors navigated thousands of miles with remarkable accuracy.",
    "scores": {
      "topicClarity": 0.9,
      "publishReady": 0.7,
      "novelty": 0.8
    },
    "formats": ["thread", "post"]
  }
]
\`\`\`

## Guidelines

1. Only extract insights that are genuinely publishable
2. Skip personal/private content not meant for sharing
3. Prefer quality over quantity - fewer strong insights is better
4. If no publishable insights, return an empty array: []
5. Be conservative with publishReady scores - 0.7+ means nearly ready`;
}

export interface UserPromptOptions {
  content: string;
  pillars: PillarConfig[];
  pillarHint?: string;
}

/**
 * Build the user prompt for insight extraction.
 */
export function buildExtractionUserPrompt(options: UserPromptOptions): string {
  const { content, pillarHint } = options;

  let prompt = `Extract publishable insights from this journal entry:\n\n${content}`;

  if (pillarHint) {
    prompt += `\n\n---\n\nNote: The author has provided a hint that this content relates to the "${pillarHint}" pillar.`;
  }

  return prompt;
}

/**
 * Parse LLM response into structured insights.
 * Handles various response formats and malformed JSON gracefully.
 */
export function parseExtractionResponse(response: string): ParsedInsight[] {
  if (!response || response.trim().length === 0) {
    return [];
  }

  // Try to find JSON array in response
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  // Must be an array
  if (!Array.isArray(parsed)) {
    return [];
  }

  // Filter and normalize insights
  const insights: ParsedInsight[] = [];

  for (const item of parsed) {
    if (!isValidInsight(item)) {
      continue;
    }

    const insight: ParsedInsight = {
      topic: String(item.topic),
      pillar: item.pillar === null ? null : typeof item.pillar === "string" ? item.pillar : null,
      hook: String(item.hook),
      excerpt: String(item.excerpt),
      scores: normalizeScores(item.scores),
      formats: normalizeFormats(item.formats),
    };

    insights.push(insight);
  }

  return insights;
}

/**
 * Check if an item has all required insight fields.
 */
function isValidInsight(item: unknown): item is Record<string, unknown> {
  if (typeof item !== "object" || item === null) {
    return false;
  }

  const obj = item as Record<string, unknown>;

  // Required string fields
  if (typeof obj.topic !== "string" || obj.topic.length === 0) return false;
  if (typeof obj.hook !== "string") return false;
  if (typeof obj.excerpt !== "string") return false;

  // Required object fields
  if (typeof obj.scores !== "object" || obj.scores === null) return false;
  if (!Array.isArray(obj.formats)) return false;

  return true;
}

/**
 * Normalize scores to 0-1 range with defaults.
 */
function normalizeScores(scores: unknown): ParsedInsight["scores"] {
  const obj = (typeof scores === "object" && scores !== null ? scores : {}) as Record<
    string,
    unknown
  >;

  return {
    topicClarity: clampScore(obj.topicClarity),
    publishReady: clampScore(obj.publishReady),
    novelty: clampScore(obj.novelty),
  };
}

/**
 * Clamp a score value to 0-1 range.
 */
function clampScore(value: unknown): number {
  const num = Number(value);
  if (isNaN(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

/**
 * Filter formats to only include valid strings.
 */
function normalizeFormats(formats: unknown): string[] {
  if (!Array.isArray(formats)) return [];
  return formats.filter((f): f is string => typeof f === "string");
}
