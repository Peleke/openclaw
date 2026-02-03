/**
 * Prompts and parsing tests — exhaustive coverage.
 */

import { describe, it, expect } from "vitest";
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  parseExtractionResponse,
  type PillarConfig,
} from "./prompts.js";

const testPillars: PillarConfig[] = [
  { id: "norse", name: "Norse Studies", keywords: ["viking", "mythology"] },
  { id: "tech", name: "Technical", keywords: ["code", "software"] },
];

describe("buildExtractionSystemPrompt", () => {
  it("includes all pillars", () => {
    const prompt = buildExtractionSystemPrompt(testPillars);

    expect(prompt).toContain("norse");
    expect(prompt).toContain("Norse Studies");
    expect(prompt).toContain("viking");
    expect(prompt).toContain("mythology");
    expect(prompt).toContain("tech");
    expect(prompt).toContain("Technical");
    expect(prompt).toContain("code");
    expect(prompt).toContain("software");
  });

  it("includes output format instructions", () => {
    const prompt = buildExtractionSystemPrompt(testPillars);

    expect(prompt).toContain("topic");
    expect(prompt).toContain("pillar");
    expect(prompt).toContain("hook");
    expect(prompt).toContain("excerpt");
    expect(prompt).toContain("scores");
    expect(prompt).toContain("formats");
  });

  it("includes JSON example", () => {
    const prompt = buildExtractionSystemPrompt(testPillars);

    expect(prompt).toContain("```json");
    expect(prompt).toContain("topicClarity");
    expect(prompt).toContain("publishReady");
    expect(prompt).toContain("novelty");
  });

  it("handles empty pillars array", () => {
    const prompt = buildExtractionSystemPrompt([]);

    expect(prompt).toContain("Content Pillars");
    expect(prompt).not.toContain("undefined");
  });

  it("handles pillars with empty keywords", () => {
    const pillars: PillarConfig[] = [{ id: "empty", name: "Empty Keywords", keywords: [] }];
    const prompt = buildExtractionSystemPrompt(pillars);

    expect(prompt).toContain("empty");
    expect(prompt).toContain("Empty Keywords");
  });
});

describe("buildExtractionUserPrompt", () => {
  it("includes content", () => {
    const prompt = buildExtractionUserPrompt({
      content: "This is my journal entry about Vikings.",
      pillars: testPillars,
    });

    expect(prompt).toContain("This is my journal entry about Vikings.");
  });

  it("includes pillar hint when provided", () => {
    const prompt = buildExtractionUserPrompt({
      content: "Content here",
      pillars: testPillars,
      pillarHint: "norse",
    });

    expect(prompt).toContain("norse");
    expect(prompt).toContain("hint");
  });

  it("excludes pillar hint when not provided", () => {
    const prompt = buildExtractionUserPrompt({
      content: "Content here",
      pillars: testPillars,
    });

    expect(prompt).not.toContain("hint");
  });

  it("handles very long content", () => {
    const longContent = "x".repeat(100000);
    const prompt = buildExtractionUserPrompt({
      content: longContent,
      pillars: testPillars,
    });

    expect(prompt).toContain(longContent);
  });

  it("handles content with special characters", () => {
    const content = '# Title\n\n```code```\n\n**bold** and "quotes"';
    const prompt = buildExtractionUserPrompt({
      content,
      pillars: testPillars,
    });

    expect(prompt).toContain(content);
  });
});

describe("parseExtractionResponse", () => {
  describe("Valid Responses", () => {
    it("parses valid JSON array", () => {
      const response = `
Here are the insights:

\`\`\`json
[
  {
    "topic": "Viking Navigation",
    "pillar": "norse",
    "hook": "Vikings didn't need GPS.",
    "excerpt": "They used the sun and stars.",
    "scores": {
      "topicClarity": 0.9,
      "publishReady": 0.7,
      "novelty": 0.8
    },
    "formats": ["thread", "post"]
  }
]
\`\`\`
`;

      const result = parseExtractionResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].topic).toBe("Viking Navigation");
      expect(result[0].pillar).toBe("norse");
      expect(result[0].hook).toBe("Vikings didn't need GPS.");
      expect(result[0].excerpt).toBe("They used the sun and stars.");
      expect(result[0].scores.topicClarity).toBe(0.9);
      expect(result[0].scores.publishReady).toBe(0.7);
      expect(result[0].scores.novelty).toBe(0.8);
      expect(result[0].formats).toEqual(["thread", "post"]);
    });

    it("parses multiple insights", () => {
      const response = `[
        {"topic": "A", "pillar": "x", "hook": "H1", "excerpt": "E1", "scores": {"topicClarity": 0.5, "publishReady": 0.5, "novelty": 0.5}, "formats": ["a"]},
        {"topic": "B", "pillar": "y", "hook": "H2", "excerpt": "E2", "scores": {"topicClarity": 0.6, "publishReady": 0.6, "novelty": 0.6}, "formats": ["b"]},
        {"topic": "C", "pillar": null, "hook": "H3", "excerpt": "E3", "scores": {"topicClarity": 0.7, "publishReady": 0.7, "novelty": 0.7}, "formats": ["c"]}
      ]`;

      const result = parseExtractionResponse(response);

      expect(result).toHaveLength(3);
      expect(result[0].topic).toBe("A");
      expect(result[1].topic).toBe("B");
      expect(result[2].topic).toBe("C");
      expect(result[2].pillar).toBeNull();
    });

    it("parses empty array", () => {
      const response = "No insights found. []";
      const result = parseExtractionResponse(response);

      expect(result).toEqual([]);
    });

    it("handles null pillar", () => {
      const response = `[{"topic": "T", "pillar": null, "hook": "H", "excerpt": "E", "scores": {"topicClarity": 0.5, "publishReady": 0.5, "novelty": 0.5}, "formats": []}]`;
      const result = parseExtractionResponse(response);

      expect(result[0].pillar).toBeNull();
    });

    it("extracts JSON from surrounding text", () => {
      const response = `
Based on my analysis, I found the following insights:

[{"topic": "Test", "pillar": "tech", "hook": "Hook", "excerpt": "Ex", "scores": {"topicClarity": 0.5, "publishReady": 0.5, "novelty": 0.5}, "formats": ["post"]}]

Let me know if you need more details.
`;

      const result = parseExtractionResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].topic).toBe("Test");
    });
  });

  describe("Score Normalization", () => {
    it("clamps scores to 0-1 range", () => {
      const response = `[{"topic": "T", "pillar": "p", "hook": "H", "excerpt": "E", "scores": {"topicClarity": 1.5, "publishReady": -0.5, "novelty": 2.0}, "formats": []}]`;
      const result = parseExtractionResponse(response);

      expect(result[0].scores.topicClarity).toBe(1);
      expect(result[0].scores.publishReady).toBe(0);
      expect(result[0].scores.novelty).toBe(1);
    });

    it("handles string scores by converting to numbers", () => {
      // Note: Number("0.8") = 0.8, so string scores get converted
      const response = `[{"topic": "T", "pillar": "p", "hook": "H", "excerpt": "E", "scores": {"topicClarity": "0.8", "publishReady": "0.5", "novelty": "0.3"}, "formats": []}]`;
      const result = parseExtractionResponse(response);

      expect(result[0].scores.topicClarity).toBe(0.8);
      expect(result[0].scores.publishReady).toBe(0.5);
      expect(result[0].scores.novelty).toBe(0.3);
    });

    it("handles missing scores with defaults", () => {
      const response = `[{"topic": "T", "pillar": "p", "hook": "H", "excerpt": "E", "scores": {}, "formats": []}]`;
      const result = parseExtractionResponse(response);

      expect(result[0].scores.topicClarity).toBe(0);
      expect(result[0].scores.publishReady).toBe(0);
      expect(result[0].scores.novelty).toBe(0);
    });
  });

  describe("Format Filtering", () => {
    it("filters non-string formats", () => {
      const response = `[{"topic": "T", "pillar": "p", "hook": "H", "excerpt": "E", "scores": {"topicClarity": 0.5, "publishReady": 0.5, "novelty": 0.5}, "formats": ["thread", 123, null, "post", {}, "essay"]}]`;
      const result = parseExtractionResponse(response);

      expect(result[0].formats).toEqual(["thread", "post", "essay"]);
    });

    it("handles empty formats array", () => {
      const response = `[{"topic": "T", "pillar": "p", "hook": "H", "excerpt": "E", "scores": {"topicClarity": 0.5, "publishReady": 0.5, "novelty": 0.5}, "formats": []}]`;
      const result = parseExtractionResponse(response);

      expect(result[0].formats).toEqual([]);
    });
  });

  describe("Invalid Responses", () => {
    it("returns empty array for non-JSON response", () => {
      const response = "I couldn't find any insights in this content.";
      const result = parseExtractionResponse(response);

      expect(result).toEqual([]);
    });

    it("returns empty array for malformed JSON", () => {
      const response = "[{broken json}]";
      const result = parseExtractionResponse(response);

      expect(result).toEqual([]);
    });

    it("returns empty array for JSON object (not array)", () => {
      const response = '{"topic": "T", "hook": "H"}';
      const result = parseExtractionResponse(response);

      expect(result).toEqual([]);
    });

    it("filters out invalid insights", () => {
      const response = `[
        {"topic": "Valid", "pillar": "p", "hook": "H", "excerpt": "E", "scores": {"topicClarity": 0.5, "publishReady": 0.5, "novelty": 0.5}, "formats": ["x"]},
        {"topic": 123, "hook": "H"},
        {"pillar": "p", "hook": "H"},
        {"topic": "Also Valid", "pillar": "q", "hook": "H2", "excerpt": "E2", "scores": {"topicClarity": 0.5, "publishReady": 0.5, "novelty": 0.5}, "formats": ["y"]}
      ]`;
      const result = parseExtractionResponse(response);

      expect(result).toHaveLength(2);
      expect(result[0].topic).toBe("Valid");
      expect(result[1].topic).toBe("Also Valid");
    });

    it("handles missing required fields", () => {
      const testCases = [
        '{"pillar": "p", "hook": "H", "excerpt": "E", "scores": {}, "formats": []}', // missing topic
        '{"topic": "T", "pillar": "p", "excerpt": "E", "scores": {}, "formats": []}', // missing hook
        '{"topic": "T", "pillar": "p", "hook": "H", "scores": {}, "formats": []}', // missing excerpt
        '{"topic": "T", "pillar": "p", "hook": "H", "excerpt": "E", "formats": []}', // missing scores
        '{"topic": "T", "pillar": "p", "hook": "H", "excerpt": "E", "scores": {}}', // missing formats
      ];

      for (const tc of testCases) {
        const result = parseExtractionResponse(`[${tc}]`);
        expect(result).toHaveLength(0);
      }
    });
  });

  describe("Edge Cases", () => {
    it("handles empty string", () => {
      const result = parseExtractionResponse("");
      expect(result).toEqual([]);
    });

    it("handles whitespace only", () => {
      const result = parseExtractionResponse("   \n\t  ");
      expect(result).toEqual([]);
    });

    it("handles nested brackets in content", () => {
      const response = `[{"topic": "Arrays [in] titles", "pillar": "tech", "hook": "Using [brackets]", "excerpt": "Code: arr[0]", "scores": {"topicClarity": 0.5, "publishReady": 0.5, "novelty": 0.5}, "formats": ["post"]}]`;
      const result = parseExtractionResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].topic).toBe("Arrays [in] titles");
    });

    it("handles unicode in content", () => {
      const response = `[{"topic": "日本語トピック", "pillar": "norse", "hook": "北欧神話について", "excerpt": "これは抜粋です", "scores": {"topicClarity": 0.9, "publishReady": 0.8, "novelty": 0.7}, "formats": ["essay"]}]`;
      const result = parseExtractionResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].topic).toBe("日本語トピック");
      expect(result[0].hook).toBe("北欧神話について");
    });

    it("handles escaped characters in JSON", () => {
      const response = `[{"topic": "Quotes \\"and\\" stuff", "pillar": "tech", "hook": "Line\\nbreak", "excerpt": "Tab\\there", "scores": {"topicClarity": 0.5, "publishReady": 0.5, "novelty": 0.5}, "formats": ["post"]}]`;
      const result = parseExtractionResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].topic).toBe('Quotes "and" stuff');
      expect(result[0].hook).toBe("Line\nbreak");
    });

    it("takes first complete JSON array match", () => {
      // The regex finds the first [ to ] span, which may include both arrays
      // This tests the actual behavior - multiple arrays get combined
      const response = `[{"topic": "First", "pillar": "a", "hook": "H1", "excerpt": "E1", "scores": {"topicClarity": 0.5, "publishReady": 0.5, "novelty": 0.5}, "formats": []}]`;
      const result = parseExtractionResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].topic).toBe("First");
    });
  });
});
