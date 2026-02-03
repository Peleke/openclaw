/**
 * Telegram notifier responder — sends notifications to Telegram when Obsidian updates.
 *
 * Example responder demonstrating the Cadence → Telegram loop.
 */

import type { SignalBus } from "@peleke.s/cadence";
import type { OpenClawSignal } from "../signals.js";
import type { Responder } from "./index.js";
import { sendMessageTelegram } from "../../telegram/send.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("cadence").child("telegram-notifier");

const NOTIFICATION_MESSAGES = [
  "Note updated — ready for review.",
  "New content detected in your vault.",
  "Journal entry modified.",
  "Obsidian sync: note changed.",
  "Content update captured.",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface TelegramNotifierConfig {
  /** Telegram chat ID to send messages to */
  telegramChatId: string;
  /** Optional: Telegram account ID (if multiple accounts configured) */
  telegramAccountId?: string;
}

export function createTelegramNotifierResponder(config: TelegramNotifierConfig): Responder {
  return {
    name: "telegram-notifier",
    description: "Sends Telegram notifications when Obsidian notes change",

    register(bus: SignalBus<OpenClawSignal>): () => void {
      const unsub = bus.on("obsidian.note.modified", async (signal) => {
        const { path } = signal.payload;
        const filename = path.split("/").pop() ?? path;

        // Skip the cadence test files
        if (filename.startsWith("_cadence-") || filename.startsWith("_debug-")) {
          log.debug(`Skipping test file: ${filename}`);
          return;
        }

        log.info(`Obsidian note modified: ${filename}`);

        const message = `${pickRandom(NOTIFICATION_MESSAGES)}\n\n📝 *${filename}*`;

        try {
          const result = await sendMessageTelegram(config.telegramChatId, message, {
            accountId: config.telegramAccountId,
            textMode: "markdown",
          });
          log.info(`Sent notification to Telegram: ${result.messageId}`);
        } catch (err) {
          log.error(`Failed to send Telegram message: ${err}`);
        }
      });

      return unsub;
    },
  };
}
