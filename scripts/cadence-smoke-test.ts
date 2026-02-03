#!/usr/bin/env tsx
/**
 * Cadence smoke test — verifies Obsidian watcher works end-to-end.
 *
 * Usage:
 *   VAULT_PATH=/path/to/vault pnpm tsx scripts/cadence-smoke-test.ts
 *
 * What it does:
 *   1. Creates a signal bus with debug logging
 *   2. Starts the Obsidian watcher on the vault
 *   3. Creates a test file with tasks
 *   4. Verifies signals are emitted
 *   5. Cleans up
 */

import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  createSignalBus,
  createMemoryTransport,
  createNoopStore,
  createSequentialExecutor,
} from "@peleke.s/cadence";
import { createObsidianWatcherSource } from "../src/cadence/sources/obsidian-watcher.js";
import type { OpenClawSignal } from "../src/cadence/signals.js";

const VAULT_PATH = process.env.VAULT_PATH;
if (!VAULT_PATH) {
  console.error("❌ Set VAULT_PATH environment variable");
  console.error("   Example: VAULT_PATH=~/Documents/Obsidian/MyVault pnpm tsx scripts/cadence-smoke-test.ts");
  process.exit(1);
}

const TEST_FILE = join(VAULT_PATH, "_cadence-smoke-test.md");
const TEST_CONTENT = `---
title: Cadence Smoke Test
tags: [test, cadence]
---

# Smoke Test

- [ ] First task (incomplete)
- [x] Second task (complete)
- [ ] Third task (incomplete)

This file was created by the Cadence smoke test.
`;

async function main() {
  console.log("🔥 Cadence Smoke Test\n");
  console.log(`Vault: ${VAULT_PATH}`);
  console.log(`Test file: ${TEST_FILE}\n`);

  // Track received signals
  const receivedSignals: OpenClawSignal[] = [];

  // Create bus
  const bus = createSignalBus<OpenClawSignal>({
    transport: createMemoryTransport(),
    store: createNoopStore(),
    executor: createSequentialExecutor(),
    onError: (signal, handlerName, err) => {
      console.error(`❌ Handler error: ${handlerName}`, err);
    },
  });

  // Subscribe to all signals
  bus.onAny(async (signal) => {
    receivedSignals.push(signal);
    console.log(`📡 Signal: ${signal.type}`);
    if (signal.type === "obsidian.note.modified") {
      console.log(`   Path: ${signal.payload.path}`);
      console.log(`   Frontmatter keys: ${Object.keys(signal.payload.frontmatter).join(", ") || "(none)"}`);
    } else if (signal.type === "obsidian.task.found") {
      const status = signal.payload.task.done ? "✅" : "⬜";
      console.log(`   ${status} ${signal.payload.task.text} (line ${signal.payload.lineNumber})`);
    }
  });

  // Create watcher
  const watcher = createObsidianWatcherSource({
    vaultPath: VAULT_PATH,
    emitTasks: true,
  });

  console.log("Starting watcher...");
  await watcher.start((signal) => bus.emit(signal));
  console.log("✅ Watcher started\n");

  // Give watcher time to initialize
  await sleep(500);

  // Create test file
  console.log("Creating test file...");
  await writeFile(TEST_FILE, TEST_CONTENT, "utf-8");
  console.log("✅ Test file created\n");

  // Wait for signals
  console.log("Waiting for signals (3s)...\n");
  await sleep(3000);

  // Verify
  console.log("\n--- Results ---");
  const noteSignals = receivedSignals.filter((s) => s.type === "obsidian.note.modified");
  const taskSignals = receivedSignals.filter((s) => s.type === "obsidian.task.found");

  console.log(`Note signals: ${noteSignals.length}`);
  console.log(`Task signals: ${taskSignals.length}`);

  const success = noteSignals.length >= 1 && taskSignals.length >= 3;

  if (success) {
    console.log("\n✅ SMOKE TEST PASSED");
  } else {
    console.log("\n❌ SMOKE TEST FAILED");
    console.log("   Expected: 1+ note signal, 3+ task signals");
  }

  // Cleanup
  console.log("\nCleaning up...");
  await watcher.stop();
  try {
    await unlink(TEST_FILE);
    console.log("✅ Test file removed");
  } catch {
    console.log("⚠️  Could not remove test file (may need manual cleanup)");
  }

  process.exit(success ? 0 : 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
