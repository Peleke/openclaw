/**
 * Insight Extractor responder.
 *
 * Listens for obsidian.note.modified signals, filters for ::publish markers,
 * debounces rapid changes, batches for LLM extraction, and emits
 * journal.insight.extracted signals.
 */

import crypto from "node:crypto";
import type { SignalBus } from "@peleke.s/cadence";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { OpenClawSignal } from "../../signals.js";
import type { Responder } from "../index.js";
import { type LLMProvider, toLegacyLLMProvider } from "../../llm/index.js";
import { createDebouncer, createBatcher } from "./debounce.js";
import { shouldExtract, shouldSkipPath, extractPillarHint } from "./filters.js";
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  parseExtractionResponse,
  type PillarConfig,
} from "./prompts.js";
import { DEFAULT_EXTRACTOR_CONFIG, type ExtractorConfig } from "./types.js";

const log = createSubsystemLogger("cadence").child("insight-extractor");

const EXTRACTOR_VERSION = "0.1.0";

/**
 * Legacy LLM provider interface for backwards compatibility.
 * @deprecated Use LLMProvider from ../../llm/index.js instead.
 */
export interface LegacyLLMProvider {
  chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  ): Promise<string>;
}

export interface InsightExtractorOptions {
  /** Partial config overrides */
  config?: Partial<ExtractorConfig>;

  /** LLM provider for extraction (new interface) */
  llm: LLMProvider | LegacyLLMProvider;

  /** Custom hash function for content (for testing) */
  hashContent?: (content: string) => string;
}

interface PendingExtraction {
  path: string;
  content: string;
  pillarHint?: string;
  signalId: string;
}

/**
 * Default content hash using SHA-256.
 */
function defaultHashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Normalize LLM provider to legacy interface for internal use.
 */
function normalizeLLMProvider(llm: LLMProvider | LegacyLLMProvider): LegacyLLMProvider {
  // Check if it's the new LLMProvider (has 'name' property)
  if ("name" in llm && typeof (llm as LLMProvider).name === "string") {
    return toLegacyLLMProvider(llm as LLMProvider);
  }
  // Already legacy format
  return llm as LegacyLLMProvider;
}

/**
 * Create the insight extractor responder.
 */
export function createInsightExtractorResponder(options: InsightExtractorOptions): Responder {
  const config: ExtractorConfig = {
    ...DEFAULT_EXTRACTOR_CONFIG,
    ...options.config,
  };

  const hashContent = options.hashContent ?? defaultHashContent;
  const llm = normalizeLLMProvider(options.llm);

  // Build system prompt once
  const systemPrompt = buildExtractionSystemPrompt(config.pillars);

  return {
    name: "insight-extractor",
    description: "Extracts publishable insights from journal entries",

    register(bus: SignalBus<OpenClawSignal>): () => void {
      log.info("Insight extractor responder starting", {
        magicString: config.magicString,
        minContentLength: config.minContentLength,
        debounceMs: config.debounceMs,
        pillars: config.pillars.map((p) => p.id),
      });

      // Debouncer for rapid file changes (per-path)
      const debouncer = createDebouncer<PendingExtraction>({
        delayMs: config.debounceMs,
      });

      // Batcher for LLM calls
      const batcher = createBatcher<PendingExtraction>({
        minDelayMs: config.minBatchDelayMs,
        maxBatchSize: config.maxBatchSize,
      });

      // Process a batch through LLM
      const processBatch = async (batch: PendingExtraction[]): Promise<void> => {
        log.debug(`Processing batch of ${batch.length} extractions`);

        for (const extraction of batch) {
          try {
            const userPrompt = buildExtractionUserPrompt({
              content: extraction.content,
              pillars: config.pillars,
              pillarHint: extraction.pillarHint,
            });

            const response = await llm.chat([
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ]);

            const insights = parseExtractionResponse(response);

            if (insights.length === 0) {
              log.debug(`No insights extracted from ${extraction.path}`);
              continue;
            }

            // Emit signal for each extraction
            const signal: OpenClawSignal = {
              type: "journal.insight.extracted",
              id: crypto.randomUUID(),
              ts: Date.now(),
              payload: {
                source: {
                  signalType: "obsidian.note.modified",
                  signalId: extraction.signalId,
                  path: extraction.path,
                  contentHash: hashContent(extraction.content),
                },
                insights: insights.map((insight) => ({
                  id: crypto.randomUUID(),
                  topic: insight.topic,
                  pillar: insight.pillar ?? undefined,
                  hook: insight.hook,
                  excerpt: insight.excerpt,
                  scores: insight.scores,
                  formats: insight.formats,
                })),
                extractedAt: Date.now(),
                extractorVersion: EXTRACTOR_VERSION,
              },
            };

            await bus.emit(signal);
            log.info(`Extracted ${insights.length} insights from ${extraction.path}`);
          } catch (err) {
            log.error(
              `Extraction failed for ${extraction.path}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      };

      // Subscribe to note modified signals
      const unsubSignal = bus.on("obsidian.note.modified", async (signal) => {
        const { path: filePath, content, frontmatter } = signal.payload;

        // Skip test/debug files
        if (shouldSkipPath(filePath)) {
          log.debug(`Skipping path: ${filePath}`);
          return;
        }

        // Check for magic string and minimum length
        const filterResult = shouldExtract(content, {
          magicString: config.magicString,
          minContentLength: config.minContentLength,
        });

        if (!filterResult.shouldExtract) {
          log.debug(`Skipping ${filePath}: ${filterResult.reason}`);
          return;
        }

        // Extract pillar hint from frontmatter
        const pillarHint = frontmatter ? extractPillarHint(frontmatter) : undefined;

        const extraction: PendingExtraction = {
          path: filePath,
          content: filterResult.content!,
          pillarHint,
          signalId: signal.id,
        };

        // Debounce by path
        debouncer.schedule(filePath, extraction, (debounced) => {
          batcher.add(debounced, processBatch);
        });

        log.debug(`Queued extraction for ${filePath} (pending: ${debouncer.pendingCount()})`);
      });

      // Return cleanup function
      return () => {
        unsubSignal();
        debouncer.clear();
        batcher.clear();
        log.info("Insight extractor responder stopped");
      };
    },
  };
}

// Re-export utilities for testing
export { createDebouncer, createBatcher } from "./debounce.js";
export { shouldExtract, shouldSkipPath, extractPillarHint } from "./filters.js";
export {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  parseExtractionResponse,
  type PillarConfig,
} from "./prompts.js";
export * from "./types.js";

// Re-export LLM provider types
export type { LLMProvider } from "../../llm/index.js";
export { createOpenClawLLMAdapter, createMockLLMProvider } from "../../llm/index.js";
