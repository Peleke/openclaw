/**
 * Telegram notifier responder — sends notifications to Telegram.
 *
 * Handles:
 * - obsidian.note.modified → basic file change notification
 * - journal.digest.ready → formatted insight digest delivery
 * - github.synthesis.written → GitHub watcher synthesis notification
 */

import type { SignalBus } from "@peleke.s/cadence";
import type { OpenClawSignal } from "../signals.js";
import type { Responder } from "./index.js";
import { sendMessageTelegram } from "../../telegram/send.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("cadence").child("telegram-notifier");

export interface TelegramNotifierConfig {
  /** Telegram chat ID to send messages to */
  telegramChatId: string;
  /** Optional: Telegram account ID (if multiple accounts configured) */
  telegramAccountId?: string;
  /** Whether to notify on raw file changes (default: false for digest mode) */
  notifyOnFileChange?: boolean;
  /** Whether to deliver insight digests (default: true) */
  deliverDigests?: boolean;
  /** Whether to notify on GitHub synthesis completion (default: true) */
  notifyOnGitHubSynthesis?: boolean;
}

/**
 * Format an insight digest for Telegram delivery.
 */
function formatDigestMessage(
  insights: Array<{
    topic: string;
    pillar?: string;
    hook: string;
    scores: { topicClarity: number; publishReady: number; novelty: number };
    formats: string[];
  }>,
): string {
  const lines: string[] = [
    "📬 *Your Insight Digest*",
    "",
    `${insights.length} publishable insight${insights.length === 1 ? "" : "s"} from today's journaling:`,
    "",
  ];

  for (const insight of insights) {
    const pillarTag = insight.pillar ? ` \\[${insight.pillar}\\]` : "";
    const readyScore = Math.round(insight.scores.publishReady * 100);
    const formats = insight.formats.join(", ");

    lines.push(`📌 *${insight.topic}*${pillarTag}`);
    lines.push(`   _"${insight.hook}"_`);
    lines.push(`   Ready: ${readyScore}% · Formats: ${formats}`);
    lines.push("");
  }

  lines.push("─".repeat(20));
  lines.push("_Reply to draft any of these_");

  return lines.join("\n");
}

export function createTelegramNotifierResponder(config: TelegramNotifierConfig): Responder {
  const {
    telegramChatId,
    telegramAccountId,
    notifyOnFileChange = false,
    deliverDigests = true,
  } = config;

  return {
    name: "telegram-notifier",
    description: "Sends Telegram notifications for file changes and insight digests",

    register(bus: SignalBus<OpenClawSignal>): () => void {
      const unsubscribers: Array<() => void> = [];

      // Optional: file change notifications (off by default for digest mode)
      if (notifyOnFileChange) {
        const unsubFileChange = bus.on("obsidian.note.modified", async (signal) => {
          const { path } = signal.payload;
          const filename = path.split("/").pop() ?? path;

          // Skip test files
          if (filename.startsWith("_cadence-") || filename.startsWith("_debug-")) {
            return;
          }

          log.debug(`File change: ${filename}`);

          const message = `📝 Note updated: *${filename}*`;

          try {
            await sendMessageTelegram(telegramChatId, message, {
              accountId: telegramAccountId,
              textMode: "markdown",
            });
          } catch (err) {
            log.error(`Failed to send file change notification: ${err}`);
          }
        });
        unsubscribers.push(unsubFileChange);
      }

      // Digest delivery (the main P1 feature)
      if (deliverDigests) {
        const unsubDigest = bus.on("journal.digest.ready", async (signal) => {
          const { insights, trigger } = signal.payload;

          if (insights.length === 0) {
            log.debug("Empty digest, skipping notification");
            return;
          }

          log.info(`Delivering digest: ${insights.length} insights (trigger: ${trigger})`);

          const message = formatDigestMessage(insights);

          try {
            const result = await sendMessageTelegram(telegramChatId, message, {
              accountId: telegramAccountId,
              textMode: "markdown",
            });
            log.info(`Digest delivered to Telegram: ${result.messageId}`);
          } catch (err) {
            log.error(`Failed to deliver digest: ${err}`);
          }
        });
        unsubscribers.push(unsubDigest);
      }

      // GitHub synthesis notifications
      {
        const notifyOnGitHubSynthesis = config.notifyOnGitHubSynthesis ?? true;
        if (notifyOnGitHubSynthesis) {
          const unsubGitHub = bus.on("github.synthesis.written", async (signal) => {
            const { scanDate, reposIncluded, totalPRs, linkedinReady, error } = signal.payload;

            let message: string;
            if (error) {
              message = `⚠️ GitHub Watcher failed for ${scanDate}: \`${error}\``;
            } else {
              message = [
                `🐙 *GitHub Synthesis Ready*`,
                "",
                `Date: ${scanDate}`,
                `Repos: ${reposIncluded} · PRs: ${totalPRs}`,
                linkedinReady ? "LinkedIn draft incoming\\.\\.\\." : "",
              ]
                .filter(Boolean)
                .join("\n");
            }

            try {
              await sendMessageTelegram(telegramChatId, message, {
                accountId: telegramAccountId,
                textMode: "markdown",
              });
            } catch (err) {
              log.error(`Failed to send GitHub synthesis notification: ${err}`);
            }
          });
          unsubscribers.push(unsubGitHub);
        }
      }

      // Return combined cleanup
      return () => {
        for (const unsub of unsubscribers) {
          unsub();
        }
      };
    },
  };
}
