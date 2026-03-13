/**
 * Runlist responder.
 *
 * Subscribes to cadence.cron.fired signals (filtered by jobId),
 * reads today's runlist from the Obsidian vault, parses the
 * RUNLET_SUMMARY JSON, and sends a morning ping or nightly recap
 * via Telegram.
 */

import crypto from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { SignalBus } from "@peleke.s/cadence";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { sendMessageTelegram } from "../../../telegram/send.js";
import type { OpenClawSignal } from "../../signals.js";
import type { Responder } from "../index.js";
import type { RunlistResponderConfig } from "./types.js";
import { parseRunletSummary, parseTaskCompletion, findForcedDecisions } from "./parser.js";
import { formatMorningPing, formatNightlyRecap } from "./formatter.js";

const log = createSubsystemLogger("cadence").child("runlist");

export interface RunlistResponderOptions {
  /** Path to Obsidian vault root */
  vaultPath: string;

  /** Telegram chat ID for delivery */
  telegramChatId: string;

  /** Optional Telegram account ID */
  telegramAccountId?: string;

  /** Cron job IDs that trigger this responder */
  cronTriggerJobIds?: string[];

  /** Directory within vault containing runlist files */
  runlistDir?: string;

  /** File reader for testability */
  fileReader?: FileReader;

  /** Clock for testability */
  clock?: RunlistClock;
}

export interface FileReader {
  exists(path: string): boolean;
  read(path: string): Promise<string>;
}

export interface RunlistClock {
  today(): string;
}

function createDefaultFileReader(): FileReader {
  return {
    exists: (p: string) => existsSync(p),
    read: (p: string) => readFile(p, "utf-8"),
  };
}

function createDefaultClock(): RunlistClock {
  return {
    today: () => new Date().toISOString().split("T")[0],
  };
}

/**
 * Read and parse a runlist file. Returns null if file doesn't exist
 * or can't be parsed. Retries once after 5s on read failure (iCloud sync lag).
 */
async function readRunlist(filePath: string, reader: FileReader): Promise<string | null> {
  if (!reader.exists(filePath)) {
    return null;
  }

  try {
    return await reader.read(filePath);
  } catch {
    // Retry once after 5s (iCloud sync delay)
    log.debug(`First read failed for ${filePath}, retrying in 5s`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      return await reader.read(filePath);
    } catch (err) {
      log.warn(
        `Failed to read runlist after retry: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}

/**
 * Create the runlist responder.
 */
export function createRunlistResponder(options: RunlistResponderOptions): Responder {
  const reader = options.fileReader ?? createDefaultFileReader();
  const clock = options.clock ?? createDefaultClock();
  const runlistDir = options.runlistDir ?? "Runlist";
  const cronTriggerJobIds = options.cronTriggerJobIds ?? ["runlist-morning", "runlist-nightly"];

  return {
    name: "runlist",
    description: "Sends morning runlist ping and nightly recap via Telegram",

    register(bus: SignalBus<OpenClawSignal>): () => void {
      log.info("Runlist responder starting", {
        runlistDir,
        cronTriggerJobIds,
      });

      const unsubCron = bus.on("cadence.cron.fired", async (signal) => {
        const { jobId } = signal.payload;

        if (!cronTriggerJobIds.includes(jobId)) {
          return;
        }

        const today = clock.today();
        const filePath = path.join(options.vaultPath, runlistDir, `${today}.md`);

        log.info(`Runlist ${jobId} triggered for ${today}`);

        // Read the runlist file
        const content = await readRunlist(filePath, reader);
        if (!content) {
          log.info(`No runlist found at ${filePath}, skipping`);
          return;
        }

        // Parse RUNLET_SUMMARY
        const summary = parseRunletSummary(content);
        if (!summary) {
          log.warn(`No RUNLET_SUMMARY found in ${filePath}, skipping`);
          return;
        }

        try {
          if (jobId === "runlist-morning" || jobId.endsWith("-morning")) {
            // Morning ping
            const message = formatMorningPing(summary);
            await sendMessageTelegram(options.telegramChatId, message, {
              accountId: options.telegramAccountId,
            });

            await bus.emit({
              type: "runlist.morning.sent",
              id: crypto.randomUUID(),
              ts: Date.now(),
              payload: {
                date: today,
                focus: summary.focus,
                counts: summary.counts,
                carried_count: summary.carried_count,
              },
            });

            log.info(`Morning ping sent for ${today}`);
          } else {
            // Nightly recap
            const completion = parseTaskCompletion(content);
            const forcedDecisions = findForcedDecisions(summary.tasks);
            const message = formatNightlyRecap(summary, completion, forcedDecisions);

            await sendMessageTelegram(options.telegramChatId, message, {
              accountId: options.telegramAccountId,
            });

            await bus.emit({
              type: "runlist.nightly.sent",
              id: crypto.randomUUID(),
              ts: Date.now(),
              payload: {
                date: today,
                completed: completion.done.length,
                pending: completion.pending.length,
                forcedDecisions: forcedDecisions.map((t) => t.description),
              },
            });

            log.info(
              `Nightly recap sent for ${today}: ${completion.done.length}/${completion.done.length + completion.pending.length} done`,
            );
          }
        } catch (err) {
          log.error(`Runlist ${jobId} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      });

      return () => {
        unsubCron();
        log.info("Runlist responder stopped");
      };
    },
  };
}
