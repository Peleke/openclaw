#!/usr/bin/env bun
/**
 * Cadence CLI — Dogfood runner for P1 Content Pipeline
 *
 * Commands:
 *   cadence init      — Create config file with defaults
 *   cadence config    — Open config file in editor
 *   cadence start     — Start watching vault (persistent)
 *   cadence status    — Show current state (queued insights, next delivery)
 *   cadence digest    — Trigger digest NOW (manual "give me insights")
 *   cadence test      — Run a quick test of the pipeline
 *
 * Usage:
 *   bun scripts/cadence.ts init
 *   bun scripts/cadence.ts start
 *   bun scripts/cadence.ts digest
 */

import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { createSignalBus, type SignalBus } from "@peleke.s/cadence";

import {
  loadCadenceConfig,
  saveCadenceConfig,
  initCadenceConfig,
  getConfigPath,
  getScheduledJobs,
  DEFAULT_CONFIG,
  type CadenceP1Config,
} from "../src/cadence/config.js";
import type { OpenClawSignal } from "../src/cadence/signals.js";
import { createObsidianWatcherSource } from "../src/cadence/sources/obsidian-watcher.js";
import { createCronBridge } from "../src/cadence/sources/cron-bridge.js";
import { createInsightExtractorResponder } from "../src/cadence/responders/insight-extractor/index.js";
import { createInsightDigestResponder } from "../src/cadence/responders/insight-digest/index.js";
import { createTelegramNotifierResponder } from "../src/cadence/responders/telegram-notifier.js";
import { createFileLogResponder } from "../src/cadence/responders/file-log.js";
import { createGitHubWatcherResponder } from "../src/cadence/responders/github-watcher/index.js";
import { createLinWheelPublisherResponder } from "../src/cadence/responders/linwheel-publisher/index.js";
import { createRunlistResponder } from "../src/cadence/responders/runlist/index.js";
import { createOpenClawLLMAdapter } from "../src/cadence/llm/index.js";
import { LinWheel } from "@linwheel/sdk";

const COMMANDS = ["init", "config", "start", "status", "digest", "test", "help"] as const;
type Command = (typeof COMMANDS)[number];

// Parse args
const args = process.argv.slice(2);
const command = (args[0] as Command) || "help";

if (!COMMANDS.includes(command)) {
  console.error(`Unknown command: ${command}`);
  console.error(`Available: ${COMMANDS.join(", ")}`);
  process.exit(1);
}

// Command handlers
async function cmdInit() {
  const { created, path } = await initCadenceConfig();

  if (created) {
    console.log(`✅ Created config file: ${path}\n`);
    console.log("Next steps:");
    console.log("  1. Edit the config: bun scripts/cadence.ts config");
    console.log("  2. Set your vault path and Telegram chat ID");
    console.log("  3. Start watching: bun scripts/cadence.ts start\n");
  } else {
    console.log(`Config already exists: ${path}`);
  }
}

async function cmdConfig() {
  const configPath = getConfigPath();
  await initCadenceConfig(); // Ensure it exists

  // Try to open in editor
  const editor = process.env.EDITOR || "code";
  console.log(`Opening ${configPath} in ${editor}...`);

  const child = spawn(editor, [configPath], {
    stdio: "inherit",
    detached: true,
  });
  child.unref();
}

async function cmdStatus() {
  const config = await loadCadenceConfig();

  console.log("\n📊 Cadence Status\n");
  console.log("─".repeat(50));

  // Config status
  console.log(`\nConfig: ${getConfigPath()}`);
  console.log(`Enabled: ${config.enabled ? "✅ Yes" : "❌ No"}`);
  console.log(`Vault: ${config.vaultPath || "(not set)"}`);
  console.log(`Delivery: ${config.delivery.channel}`);
  if (config.delivery.channel === "telegram") {
    console.log(`  Chat ID: ${config.delivery.telegramChatId || "(not set)"}`);
  }

  // Schedule
  console.log(`\nSchedule: ${config.schedule.enabled ? "✅ Enabled" : "❌ Disabled"}`);
  if (config.schedule.enabled) {
    console.log(`  Nightly digest: ${config.schedule.nightlyDigest || "(not set)"}`);
    console.log(`  Morning standup: ${config.schedule.morningStandup || "(not set)"}`);
    console.log(`  Timezone: ${config.schedule.timezone}`);
  }

  // Pillars
  console.log(`\nPillars: ${config.pillars.map((p) => p.name).join(", ")}`);

  // TODO: Show queued insights count from the accumulator
  console.log("\n" + "─".repeat(50));

  // Validation
  const issues: string[] = [];
  if (!config.vaultPath) issues.push("vaultPath not set");
  if (config.delivery.channel === "telegram" && !config.delivery.telegramChatId) {
    issues.push("telegramChatId not set");
  }

  if (issues.length > 0) {
    console.log("\n⚠️  Issues:");
    for (const issue of issues) {
      console.log(`   • ${issue}`);
    }
    console.log("\nRun: bun scripts/cadence.ts config");
  } else if (!config.enabled) {
    console.log('\n💡 Config looks good! Set "enabled": true to activate.');
  } else {
    console.log("\n✅ Ready to run: bun scripts/cadence.ts start");
  }

  console.log("");
}

async function cmdStart() {
  const config = await loadCadenceConfig();

  // Validate config
  if (!config.enabled) {
    console.error('❌ Cadence not enabled. Set "enabled": true in config.');
    console.error(`   Config: ${getConfigPath()}`);
    process.exit(1);
  }

  if (!config.vaultPath) {
    console.error("❌ vaultPath not set in config.");
    process.exit(1);
  }

  if (config.delivery.channel === "telegram" && !config.delivery.telegramChatId) {
    console.error("❌ telegramChatId not set for Telegram delivery.");
    process.exit(1);
  }

  console.log(`
╔════════════════════════════════════════════════════════════╗
║              Cadence P1 — Content Pipeline                 ║
╚════════════════════════════════════════════════════════════╝
`);

  console.log(`📂 Vault: ${config.vaultPath}`);
  console.log(`📱 Delivery: ${config.delivery.channel}`);
  console.log(`🏷️  Pillars: ${config.pillars.map((p) => p.name).join(", ")}`);

  if (config.schedule.enabled) {
    console.log(`\n⏰ Scheduled:`);
    if (config.schedule.nightlyDigest) {
      console.log(`   • Nightly digest @ ${config.schedule.nightlyDigest}`);
    }
    if (config.schedule.morningStandup) {
      console.log(`   • Morning standup @ ${config.schedule.morningStandup}`);
    }
  }

  console.log("\n" + "─".repeat(60) + "\n");

  // Create signal bus
  const bus = createSignalBus<OpenClawSignal>() as SignalBus<OpenClawSignal>;

  // Create LLM provider
  const llmProvider = createOpenClawLLMAdapter({
    defaultProvider: config.llm.provider,
    defaultModel: config.llm.model,
  });

  // 1. Obsidian watcher source
  const obsidianSource = createObsidianWatcherSource({
    vaultPath: config.vaultPath,
    emitTasks: false,
  });

  // 2. Cron source for scheduled jobs
  const scheduledJobs = getScheduledJobs(config);
  const cronSource = createCronBridge({
    jobs: scheduledJobs,
    onFire: (job) => console.log(`⏰ [${timestamp()}] Scheduled job: ${job.name}`),
  });

  // 3. Insight extractor responder
  const extractorResponder = createInsightExtractorResponder({
    config: {
      pillars: config.pillars,
      magicString: config.extraction.publishTag,
    },
    llm: llmProvider,
  });

  // 4. Insight digest responder
  const digestResponder = createInsightDigestResponder({
    config: {
      minInsightsToFlush: config.digest.minToFlush,
      maxHoursBetweenFlushes: config.digest.maxHoursBetween,
      cooldownHours: config.digest.cooldownHours,
      quietHoursStart: config.digest.quietHoursStart,
      quietHoursEnd: config.digest.quietHoursEnd,
    },
    cronTriggerJobIds: ["nightly-digest", "morning-standup", "manual-trigger"],
  });

  // 5. Delivery responder
  let deliveryResponder;
  if (config.delivery.channel === "telegram" && config.delivery.telegramChatId) {
    deliveryResponder = createTelegramNotifierResponder({
      telegramChatId: config.delivery.telegramChatId,
      deliverDigests: true,
      notifyOnFileChange: false,
    });
  }

  // 6. File log responder (for sandbox container visibility)
  let fileLogResponder;
  const fileLogPath = config.delivery.fileLogPath;
  if (fileLogPath) {
    fileLogResponder = createFileLogResponder({ filePath: fileLogPath });
  }

  // 7. GitHub watcher responder (nightly repo scan + synthesis)
  let githubWatcherResponder;
  if (config.githubWatcher?.enabled) {
    githubWatcherResponder = createGitHubWatcherResponder({
      llm: llmProvider,
      vaultPath: config.vaultPath,
      config: {
        owner: config.githubWatcher.owner ?? "Peleke",
        scanTime: config.githubWatcher.scanTime ?? "21:00",
        outputDir: config.githubWatcher.outputDir ?? "Buildlog",
        maxBuildlogEntries: config.githubWatcher.maxBuildlogEntries ?? 3,
        excludeRepos: config.githubWatcher.excludeRepos ?? [],
      },
    });
    console.log("🐙 GitHub watcher enabled (nightly scan → synthesis)");
  }

  // 8. LinWheel publisher responder (::linkedin → drafts)
  let linwheelPublisherResponder;
  const linwheelApiKey = process.env.LINWHEEL_API_KEY?.trim();
  if (linwheelApiKey) {
    const linwheelClient = new LinWheel({
      apiKey: linwheelApiKey,
      ...(process.env.LINWHEEL_SIGNING_SECRET?.trim()
        ? { signingSecret: process.env.LINWHEEL_SIGNING_SECRET.trim() }
        : {}),
      ...(process.env.LINWHEEL_BASE_URL?.trim()
        ? { baseUrl: process.env.LINWHEEL_BASE_URL.trim() }
        : {}),
    });
    linwheelPublisherResponder = createLinWheelPublisherResponder({
      client: linwheelClient,
    });
    console.log("📎 LinWheel publisher enabled (::linkedin → drafts)");
  } else {
    console.log("📎 LinWheel publisher skipped (no LINWHEEL_API_KEY)");
  }

  // 9. Runlist responder (morning ping + nightly recap)
  let runlistResponder;
  if (config.runlist?.enabled && config.delivery.telegramChatId) {
    runlistResponder = createRunlistResponder({
      vaultPath: config.vaultPath,
      telegramChatId: config.delivery.telegramChatId,
      runlistDir: config.runlist.runlistDir,
    });
    console.log("📋 Runlist responder enabled (morning + nightly)");
  }

  // Wire up logging
  bus.on("obsidian.note.modified", (signal) => {
    const filename = signal.payload.path.split("/").pop();
    console.log(`📝 [${timestamp()}] Note modified: ${filename}`);
  });

  bus.on("journal.insight.extracted", (signal) => {
    const count = signal.payload.insights.length;
    console.log(`💡 [${timestamp()}] Extracted ${count} insight(s):`);
    for (const insight of signal.payload.insights) {
      const ready = Math.round(insight.scores.publishReady * 100);
      console.log(`   • ${insight.topic} (${ready}% ready)`);
    }
  });

  bus.on("journal.digest.ready", (signal) => {
    const count = signal.payload.insights.length;
    console.log(`\n📬 [${timestamp()}] Digest ready! ${count} insights`);
    if (config.delivery.channel === "log") {
      console.log("   (Delivery: log only — configure Telegram for real delivery)");
      for (const insight of signal.payload.insights) {
        console.log(`   📌 ${insight.topic}: "${insight.hook}"`);
      }
    } else {
      console.log(`   → Delivering via ${config.delivery.channel}...`);
    }
  });

  bus.on("github.scan.completed", (signal) => {
    const { reposScanned, reposWithActivity, errors } = signal.payload;
    console.log(
      `🐙 [${timestamp()}] GitHub scan: ${reposScanned} repos, ${reposWithActivity} with activity`,
    );
    if (errors.length > 0) {
      console.log(`   ⚠️  ${errors.length} error(s)`);
    }
  });

  bus.on("github.synthesis.written", (signal) => {
    const { scanDate, reposIncluded, totalPRs, linkedinReady, error } = signal.payload;
    if (error) {
      console.log(`❌ [${timestamp()}] GitHub synthesis failed: ${error}`);
    } else {
      console.log(
        `📝 [${timestamp()}] GitHub synthesis written: ${reposIncluded} repos, ${totalPRs} PRs${linkedinReady ? " (::linkedin)" : ""}`,
      );
    }
  });

  bus.on("linwheel.drafts.generated", (signal) => {
    const { noteFile, postsCreated, angles } = signal.payload;
    const filename = noteFile.split("/").pop();
    console.log(
      `📎 [${timestamp()}] LinWheel: ${postsCreated} draft(s) from ${filename} (angles: ${angles.join(", ")})`,
    );
  });

  // Register responders
  const unsubs: Array<() => void> = [];
  unsubs.push(extractorResponder.register(bus));
  unsubs.push(digestResponder.register(bus));
  if (deliveryResponder) {
    unsubs.push(deliveryResponder.register(bus));
  }
  if (fileLogResponder) {
    unsubs.push(fileLogResponder.register(bus));
  }
  if (githubWatcherResponder) {
    unsubs.push(githubWatcherResponder.register(bus));
  }
  if (linwheelPublisherResponder) {
    unsubs.push(linwheelPublisherResponder.register(bus));
  }
  if (runlistResponder) {
    unsubs.push(runlistResponder.register(bus));
  }

  // Start sources
  await obsidianSource.start((signal) => bus.emit(signal));
  if (scheduledJobs.length > 0) {
    await cronSource.start((signal) => bus.emit(signal));
  }

  console.log("✅ Pipeline running!\n");
  console.log("─".repeat(60));
  console.log(`
Write a journal entry with "${config.extraction.publishTag}" to see it work.

Commands while running:
  • Ctrl+C — Stop
  • (In another terminal) bun scripts/cadence.ts digest — Force digest now
`);
  console.log("─".repeat(60) + "\n");

  // Handle manual digest trigger via file
  // (Simple IPC: touch ~/.openclaw/cadence-trigger to force digest)
  const triggerPath = getConfigPath().replace(".json", "-trigger");
  const fs = await import("node:fs");
  fs.watchFile(triggerPath, { interval: 1000 }, async () => {
    console.log(`\n🔔 [${timestamp()}] Manual digest trigger received!`);
    await bus.emit({
      type: "cadence.cron.fired",
      id: crypto.randomUUID(),
      ts: Date.now(),
      payload: {
        jobId: "manual-trigger",
        jobName: "Manual Digest",
        expr: "manual",
        firedAt: Date.now(),
      },
    });
    // Remove trigger file
    try {
      fs.unlinkSync(triggerPath);
    } catch {}
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n\n🛑 Shutting down...");
    for (const unsub of unsubs) unsub();
    await obsidianSource.stop();
    await cronSource.stop();
    fs.unwatchFile(triggerPath);
    console.log("👋 Done!\n");
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

async function cmdDigest() {
  // Trigger manual digest by touching the trigger file
  const triggerPath = getConfigPath().replace(".json", "-trigger");
  const fs = await import("node:fs/promises");

  await fs.writeFile(triggerPath, Date.now().toString(), "utf-8");
  console.log("📬 Digest trigger sent!");
  console.log("   (If cadence is running, it will flush insights now)");
}

async function cmdTest() {
  const config = await loadCadenceConfig();
  console.log("\n🧪 Testing Cadence Pipeline...\n");

  // Test LLM connection
  console.log("1. Testing LLM connection...");
  try {
    const llmProvider = createOpenClawLLMAdapter({
      defaultProvider: config.llm.provider,
      defaultModel: config.llm.model,
    });

    const response = await llmProvider.chat([
      { role: "user", content: "Say 'Cadence OK' and nothing else." },
    ]);

    if (response.text.includes("OK")) {
      console.log(`   ✅ LLM working (${response.model})`);
    } else {
      console.log(`   ⚠️  Unexpected response: ${response.text.slice(0, 50)}`);
    }
  } catch (err) {
    console.log(`   ❌ LLM error: ${err instanceof Error ? err.message : err}`);
  }

  // Test Telegram (if configured)
  if (config.delivery.channel === "telegram" && config.delivery.telegramChatId) {
    console.log("\n2. Testing Telegram delivery...");
    try {
      const { sendMessageTelegram } = await import("../src/telegram/send.js");
      await sendMessageTelegram(config.delivery.telegramChatId, "🧪 Cadence test message");
      console.log("   ✅ Telegram working");
    } catch (err) {
      console.log(`   ❌ Telegram error: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("\n✅ Test complete!\n");
}

function cmdHelp() {
  console.log(`
Cadence — P1 Content Pipeline

Commands:
  init      Create config file (~/.openclaw/cadence.json)
  config    Open config in editor
  start     Start watching vault + delivering digests
  status    Show current config and state
  digest    Trigger digest delivery NOW
  test      Test LLM and Telegram connectivity
  help      Show this help

Quick Start:
  1. bun scripts/cadence.ts init
  2. bun scripts/cadence.ts config   # Set vault path + telegram chat
  3. bun scripts/cadence.ts start

Config file: ~/.openclaw/cadence.json
`);
}

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

// Run command
switch (command) {
  case "init":
    await cmdInit();
    break;
  case "config":
    await cmdConfig();
    break;
  case "start":
    await cmdStart();
    break;
  case "status":
    await cmdStatus();
    break;
  case "digest":
    await cmdDigest();
    break;
  case "test":
    await cmdTest();
    break;
  case "help":
    cmdHelp();
    break;
}
