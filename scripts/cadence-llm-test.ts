#!/usr/bin/env bun
/**
 * Smoke test for Cadence LLM provider wiring.
 *
 * Validates the full chain:
 * 1. OpenClaw auth system → API key
 * 2. LLM provider abstraction
 * 3. Anthropic API call
 * 4. Response parsing
 *
 * Usage:
 *   bun scripts/cadence-llm-test.ts
 *   bun scripts/cadence-llm-test.ts --mock  # Use mock provider (no API call)
 */

import { createOpenClawLLMAdapter, createMockLLMProvider } from "../src/cadence/llm/index.js";
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  parseExtractionResponse,
} from "../src/cadence/responders/insight-extractor/prompts.js";

const SAMPLE_JOURNAL = `::publish

# Viking Navigation Techniques

Today I learned something fascinating about how Vikings navigated without compasses.

They used "sunstones" - calcite crystals that polarize light - to find the sun's position even on cloudy days. Combined with knowledge of bird migration patterns and wave refraction around islands, they crossed the North Atlantic with remarkable accuracy.

What strikes me is how they built mental models of invisible forces. They couldn't see magnetic fields, but they observed their effects and created reliable heuristics. This is exactly what we do with complex systems today - we can't see the full picture, but we learn to read the signs.

The lesson: You don't need to understand everything mechanistically. Pattern recognition from effects can be just as powerful as understanding causes.
`;

const TEST_PILLARS = [
  { id: "norse", name: "Norse Studies", keywords: ["viking", "mythology", "navigation"] },
  { id: "systems", name: "Systems Thinking", keywords: ["mental models", "patterns", "complexity"] },
];

async function runTest(useMock: boolean) {
  console.log("\n🧪 Cadence LLM Provider Smoke Test\n");
  console.log("─".repeat(50));

  // Create provider
  const provider = useMock
    ? createMockLLMProvider(
        new Map([
          [
            buildExtractionUserPrompt({ content: SAMPLE_JOURNAL.replace("::publish\n\n", ""), pillars: TEST_PILLARS }),
            JSON.stringify([
              {
                topic: "Viking Sunstone Navigation",
                pillar: "norse",
                hook: "Vikings crossed oceans using crystals that reveal the invisible sun.",
                excerpt: "Calcite sunstones polarize light to find the sun on cloudy days.",
                scores: { topicClarity: 0.9, publishReady: 0.8, novelty: 0.7 },
                formats: ["thread", "post"],
              },
            ]),
          ],
        ]),
      )
    : createOpenClawLLMAdapter({
        defaultProvider: "anthropic",
        defaultModel: "claude-3-5-haiku-latest",
      });

  console.log(`\n📡 Provider: ${provider.name}`);
  console.log(`   Mode: ${useMock ? "MOCK (no API call)" : "LIVE (calling Anthropic)"}`);

  // Build prompts
  const systemPrompt = buildExtractionSystemPrompt(TEST_PILLARS);
  const userPrompt = buildExtractionUserPrompt({
    content: SAMPLE_JOURNAL.replace("::publish\n\n", ""),
    pillars: TEST_PILLARS,
  });

  console.log(`\n📝 System prompt: ${systemPrompt.length} chars`);
  console.log(`📝 User prompt: ${userPrompt.length} chars`);

  // Call LLM
  console.log("\n⏳ Calling LLM...");
  const startTime = Date.now();

  try {
    const response = await provider.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`✅ Response received in ${elapsed}ms`);
    console.log(`   Model: ${response.model}`);
    if (response.usage) {
      console.log(`   Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
    }

    // Parse response
    console.log("\n🔍 Parsing extraction response...");
    const insights = parseExtractionResponse(response.text);

    if (insights.length === 0) {
      console.log("⚠️  No insights extracted");
      console.log("\nRaw response:");
      console.log(response.text.slice(0, 500));
    } else {
      console.log(`✅ Extracted ${insights.length} insight(s):\n`);
      for (const insight of insights) {
        console.log(`   📌 ${insight.topic}`);
        console.log(`      Pillar: ${insight.pillar ?? "(none)"}`);
        console.log(`      Hook: ${insight.hook.slice(0, 60)}...`);
        console.log(`      Scores: clarity=${insight.scores.topicClarity} ready=${insight.scores.publishReady} novel=${insight.scores.novelty}`);
        console.log(`      Formats: ${insight.formats.join(", ")}`);
        console.log();
      }
    }

    console.log("─".repeat(50));
    console.log("✅ Smoke test PASSED\n");
    return true;
  } catch (err) {
    console.log(`\n❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    console.log("\nTroubleshooting:");
    console.log("  1. Run 'openclaw auth add anthropic' to configure API key");
    console.log("  2. Check ~/.openclaw/agents/default/auth.json exists");
    console.log("  3. Verify API key is valid\n");
    console.log("─".repeat(50));
    console.log("❌ Smoke test FAILED\n");
    return false;
  }
}

// Main
const useMock = process.argv.includes("--mock");
const success = await runTest(useMock);
process.exit(success ? 0 : 1);
