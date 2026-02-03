#!/usr/bin/env bun
/**
 * Cadence P1 Content Pipeline — Live Demo Runner
 *
 * For investor demos: Run this, then edit an Obsidian journal entry.
 * The pipeline will extract insights and deliver a digest to Telegram.
 *
 * Usage:
 *   bun scripts/cadence-demo-runner.ts --vault ~/Obsidian/MyVault --chat YOUR_TELEGRAM_CHAT_ID
 *
 * Flags:
 *   --vault    Path to Obsidian vault (required)
 *   --chat     Telegram chat ID for delivery (required)
 *   --pillars  Comma-separated content pillars (default: tech,business,life)
 *   --instant  Flush digest immediately (don't wait for threshold)
 *   --dry-run  Log actions but don't send to Telegram
 */

import { createSignalBus, type SignalBus } from "@peleke.s/cadence";
import { parseArgs } from "node:util";

import type { OpenClawSignal } from "../src/cadence/signals.js";
import { createObsidianWatcherSource } from "../src/cadence/sources/obsidian-watcher.js";
import { createInsightExtractorResponder } from "../src/cadence/responders/insight-extractor/index.js";
import { createInsightDigestResponder } from "../src/cadence/responders/insight-digest/index.js";
import { createTelegramNotifierResponder } from "../src/cadence/responders/telegram-notifier.js";
import { createOpenClawLLMAdapter } from "../src/cadence/llm/index.js";
import { toLegacyLLMProvider } from "../src/cadence/llm/types.js";

// Parse CLI args
const { values: args } = parseArgs({
  options: {
    vault: { type: "string" },
    chat: { type: "string" },
    pillars: { type: "string", default: "tech,business,life" },
    instant: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

if (!args.vault || !args.chat) {
  console.error(`
Usage: bun scripts/cadence-demo-runner.ts --vault <path> --chat <telegram_chat_id>

Required:
  --vault    Path to your Obsidian vault
  --chat     Telegram chat ID for digest delivery

Optional:
  --pillars  Content pillars (comma-separated, default: tech,business,life)
  --instant  Flush digest immediately after extraction
  --dry-run  Log actions without sending to Telegram
`);
  process.exit(1);
}

const VAULT_PATH = args.vault;
const TELEGRAM_CHAT_ID = args.chat;
const PILLARS = args.pillars!.split(",").map((p) => ({
  id: p.trim().toLowerCase(),
  name: p.trim().charAt(0).toUpperCase() + p.trim().slice(1),
  keywords: [], // LLM will figure it out
}));
const INSTANT_FLUSH = args.instant;
const DRY_RUN = args["dry-run"];

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           Cadence P1 Content Pipeline — Live Demo          ║
╚════════════════════════════════════════════════════════════╝

📂 Watching vault: ${VAULT_PATH}
📱 Telegram chat:  ${TELEGRAM_CHAT_ID}
📚 Pillars:        ${PILLARS.map((p) => p.name).join(", ")}
⚡ Instant flush:  ${INSTANT_FLUSH ? "Yes" : "No (wait for threshold)"}
🔇 Dry run:        ${DRY_RUN ? "Yes" : "No"}

`);

  // Create signal bus
  const bus = createSignalBus<OpenClawSignal>() as SignalBus<OpenClawSignal>;

  // Create LLM provider
  const llmProvider = createOpenClawLLMAdapter({
    defaultProvider: "anthropic",
    defaultModel: "claude-3-5-haiku-latest",
  });

  console.log("🔌 Initializing components...\n");

  // 1. Obsidian watcher source
  const obsidianSource = createObsidianWatcherSource({
    vaultPath: VAULT_PATH,
    emitTasks: false, // Only care about note content for P1
  });

  // 2. Insight extractor responder
  const extractorResponder = createInsightExtractorResponder({
    pillars: PILLARS,
    llmProvider: toLegacyLLMProvider(llmProvider),
  });

  // 3. Insight digest responder
  const digestResponder = createInsightDigestResponder({
    config: {
      minInsightsToFlush: INSTANT_FLUSH ? 1 : 3, // Lower for demo
      cooldownHours: 0, // No cooldown for demo
      maxHoursBetweenFlushes: INSTANT_FLUSH ? 0.01 : 1, // Very short for demo
      quietHoursStart: "00:00",
      quietHoursEnd: "00:00", // No quiet hours for demo
    },
  });

  // 4. Telegram notifier responder
  const telegramResponder = createTelegramNotifierResponder({
    telegramChatId: TELEGRAM_CHAT_ID,
    deliverDigests: !DRY_RUN,
    notifyOnFileChange: false,
  });

  // Wire up logging for visibility
  bus.on("obsidian.note.modified", (signal) => {
    const filename = signal.payload.path.split("/").pop();
    console.log(`📝 [${new Date().toLocaleTimeString()}] Note modified: ${filename}`);
  });

  bus.on("journal.insight.extracted", (signal) => {
    const count = signal.payload.insights.length;
    console.log(`💡 [${new Date().toLocaleTimeString()}] Extracted ${count} insight(s):`);
    for (const insight of signal.payload.insights) {
      console.log(`   • ${insight.topic} (${Math.round(insight.scores.publishReady * 100)}% ready)`);
    }
  });

  bus.on("journal.digest.ready", (signal) => {
    console.log(`\n📬 [${new Date().toLocaleTimeString()}] Digest ready! ${signal.payload.insights.length} insights`);
    if (DRY_RUN) {
      console.log("   (Dry run — not sending to Telegram)");
    } else {
      console.log("   → Delivering to Telegram...");
    }
  });

  // Register responders
  const unsubExtractor = extractorResponder.register(bus);
  const unsubDigest = digestResponder.register(bus);
  const unsubTelegram = telegramResponder.register(bus);

  // Start the source
  await obsidianSource.start((signal) => bus.emit(signal));

  console.log("✅ Pipeline running!\n");
  console.log("─".repeat(60));
  console.log(`
📝 DEMO INSTRUCTIONS:

1. Open your Obsidian vault: ${VAULT_PATH}

2. Create or edit a journal entry with the "::publish" tag:

   ─────────────────────────────────────
   ::publish

   # Today's Observations

   I noticed something interesting about how teams
   communicate asynchronously...

   [Your insight-rich content here]
   ─────────────────────────────────────

3. Save the file and watch this terminal

4. The pipeline will:
   • Detect the file change
   • Extract publishable insights via Claude
   • Queue them in the digest
   • Deliver to your Telegram${INSTANT_FLUSH ? " (instant)" : " (when threshold reached)"}

Press Ctrl+C to stop.
`);
  console.log("─".repeat(60));
  console.log("");

  // Keep running until interrupted
  process.on("SIGINT", async () => {
    console.log("\n\n🛑 Shutting down...");
    unsubExtractor();
    unsubDigest();
    unsubTelegram();
    await obsidianSource.stop();
    console.log("👋 Done!\n");
    process.exit(0);
  });

  // Keep the process alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
