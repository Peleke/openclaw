/**
 * LinWheel Publisher responder.
 *
 * Listens for obsidian.note.modified signals, filters for ::linkedin markers,
 * debounces rapid changes, then runs analyze + reshape via the LinWheel SDK.
 * Drafts are saved to LinWheel for review/scheduling in the dashboard.
 */

import crypto from "node:crypto";
import type { SignalBus } from "@peleke.s/cadence";
import type { LinWheel, PostAngle } from "@linwheel/sdk";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { OpenClawSignal } from "../../signals.js";
import type { Responder } from "../index.js";
import { shouldExtract, shouldSkipPath } from "../insight-extractor/filters.js";
import { createDebouncer } from "../insight-extractor/debounce.js";
import { DEFAULT_PUBLISHER_CONFIG, type LinWheelPublisherConfig } from "./types.js";

const log = createSubsystemLogger("cadence").child("linwheel-publisher");

export interface LinWheelPublisherOptions {
  /** LinWheel SDK client */
  client: LinWheel;

  /** Partial config overrides */
  config?: Partial<LinWheelPublisherConfig>;
}

interface PendingPublish {
  path: string;
  content: string;
  angles: string[];
  signalId: string;
}

/**
 * Extract angles override from frontmatter.
 * Returns undefined if no valid override found.
 */
function extractAnglesOverride(frontmatter: Record<string, unknown>): string[] | undefined {
  const angles = frontmatter.linkedin_angles;
  if (!Array.isArray(angles)) return undefined;
  const valid = angles.filter((a): a is string => typeof a === "string" && a.length > 0);
  return valid.length > 0 ? valid : undefined;
}

/**
 * Create the LinWheel publisher responder.
 *
 * On ::linkedin marker detection, runs:
 *   1. client.analyze({ text }) — assess content, get suggested angles
 *   2. client.reshape({ text, angles, saveDrafts: true }) — generate drafts
 *
 * Drafts land in LinWheel dashboard for manual review and scheduling.
 */
export function createLinWheelPublisherResponder(options: LinWheelPublisherOptions): Responder {
  const config: LinWheelPublisherConfig = {
    ...DEFAULT_PUBLISHER_CONFIG,
    ...options.config,
  };
  const client = options.client;

  return {
    name: "linwheel-publisher",
    description: "Generates LinkedIn drafts from ::linkedin-tagged Obsidian notes via LinWheel",

    register(bus: SignalBus<OpenClawSignal>): () => void {
      log.info("LinWheel publisher responder starting", {
        magicString: config.magicString,
        defaultAngles: config.defaultAngles,
        debounceMs: config.debounceMs,
      });

      const debouncer = createDebouncer<PendingPublish>({
        delayMs: config.debounceMs,
      });

      const runPipeline = async (pending: PendingPublish): Promise<void> => {
        const { path: filePath, content, angles } = pending;

        try {
          // 1. Analyze — get fit score + suggested angles
          const analysis = (await client.analyze({ text: content })) as {
            linkedinFit?: { score?: number };
            suggestedAngles?: Array<{ angle?: string; name?: string }>;
          };
          log.info(`Analyzed ${filePath}`, {
            score: analysis.linkedinFit?.score,
            suggestedAngles: analysis.suggestedAngles?.length,
          });

          // Use suggested angles from analysis if available, fall back to config/frontmatter
          const reshapeAngles =
            analysis.suggestedAngles && analysis.suggestedAngles.length > 0
              ? analysis.suggestedAngles.map((a) => a.angle ?? a.name ?? "").filter(Boolean)
              : angles;

          // 2. Reshape — generate drafts, save to LinWheel
          const finalAngles = (
            reshapeAngles.length > 0 ? reshapeAngles : config.defaultAngles
          ) as PostAngle[];
          const result = (await client.reshape({
            text: content,
            angles: finalAngles,
            saveDrafts: config.saveDrafts,
          })) as { posts?: Array<{ text: string; postId?: string }> };

          const postCount = result.posts?.length ?? 0;
          log.info(`Generated ${postCount} drafts from ${filePath}`);

          // Emit signal for downstream consumers (telegram notifier, etc.)
          await bus.emit({
            type: "linwheel.drafts.generated",
            id: crypto.randomUUID(),
            ts: Date.now(),
            payload: {
              noteFile: filePath,
              postsCreated: postCount,
              angles: reshapeAngles.length > 0 ? reshapeAngles : config.defaultAngles,
            },
          });
        } catch (err) {
          log.error(
            `LinWheel pipeline failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      };

      const unsubSignal = bus.on("obsidian.note.modified", async (signal) => {
        const { path: filePath, content, frontmatter } = signal.payload;

        if (shouldSkipPath(filePath)) {
          log.debug(`Skipping path: ${filePath}`);
          return;
        }

        const filterResult = shouldExtract(content, {
          magicString: config.magicString,
          minContentLength: config.minContentLength,
        });

        if (!filterResult.shouldExtract) {
          log.debug(`Skipping ${filePath}: ${filterResult.reason}`);
          return;
        }

        // Check for frontmatter angle overrides
        const angles =
          (frontmatter ? extractAnglesOverride(frontmatter) : undefined) ?? config.defaultAngles;

        const pending: PendingPublish = {
          path: filePath,
          content: filterResult.content!,
          angles,
          signalId: signal.id,
        };

        debouncer.schedule(filePath, pending, (debounced) => {
          void runPipeline(debounced);
        });

        log.debug(`Queued LinWheel publish for ${filePath}`);
      });

      return () => {
        unsubSignal();
        debouncer.clear();
        log.info("LinWheel publisher responder stopped");
      };
    },
  };
}
