#!/usr/bin/env tsx
/**
 * Test script for Cadence Telegram notifier.
 *
 * Usage:
 *   VAULT_PATH=/path/to/vault TELEGRAM_CHAT_ID=123456 pnpm tsx scripts/test-cadence-telegram.ts
 *
 * Then edit a markdown file in your vault and watch Telegram.
 */

import {
  createSignalBus,
  createMemoryTransport,
  createNoopStore,
  createSequentialExecutor,
} from "@peleke.s/cadence";
import { createObsidianWatcherSource } from "../src/cadence/sources/obsidian-watcher.js";
import { createTelegramNotifierResponder } from "../src/cadence/responders/index.js";
import type { OpenClawSignal } from "../src/cadence/signals.js";

const VAULT_PATH = process.env.VAULT_PATH;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!VAULT_PATH) {
  console.error("❌ Set VAULT_PATH environment variable");
  process.exit(1);
}

if (!TELEGRAM_CHAT_ID) {
  console.error("❌ Set TELEGRAM_CHAT_ID environment variable");
  console.error("   (Your Telegram user ID - you can get it from @userinfobot)");
  process.exit(1);
}

async function main() {
  console.log("🔥 Cadence Telegram Test");
  console.log(`Vault: ${VAULT_PATH}`);
  console.log(`Telegram chat: ${TELEGRAM_CHAT_ID}`);
  console.log("");

  // Create bus
  const bus = createSignalBus<OpenClawSignal>({
    transport: createMemoryTransport(),
    store: createNoopStore(),
    executor: createSequentialExecutor(),
    onError: (signal, handlerName, err) => {
      console.error(`❌ Handler error (${handlerName}):`, err);
    },
  });

  // Register Telegram notifier responder
  const notifier = createTelegramNotifierResponder({
    telegramChatId: TELEGRAM_CHAT_ID,
  });
  const unsub = notifier.register(bus);
  console.log(`✅ Registered responder: ${notifier.name}`);

  // Create and start watcher
  const watcher = createObsidianWatcherSource({
    vaultPath: VAULT_PATH,
    emitTasks: false, // We only care about note modifications
  });

  console.log("Starting watcher...");
  await watcher.start((signal) => bus.emit(signal));
  console.log("✅ Watcher started");
  console.log("");
  console.log("👀 Watching for Obsidian changes...");
  console.log("   Edit a markdown file in your vault to trigger notification.");
  console.log("   Press Ctrl+C to stop.");
  console.log("");

  // Keep running until interrupted
  process.on("SIGINT", async () => {
    console.log("\n🛑 Stopping...");
    unsub();
    await watcher.stop();
    console.log("✅ Stopped");
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
