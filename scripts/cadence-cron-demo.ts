#!/usr/bin/env bun
/**
 * Demo: Cadence Cron → Insight Digest Pipeline
 *
 * Shows the full flow:
 * 1. Cron source fires "nightly-digest" job
 * 2. Insight digest responder receives the signal
 * 3. Queued insights are flushed to journal.digest.ready
 *
 * Usage:
 *   bun scripts/cadence-cron-demo.ts
 */

import { createSignalBus, type SignalBus } from "@peleke.s/cadence";
import type { OpenClawSignal, OpenClawPayloadMap } from "../src/cadence/signals.js";
import { createCronBridge, type CronJob } from "../src/cadence/sources/cron-bridge.js";
import { createInsightDigestResponder } from "../src/cadence/responders/insight-digest/index.js";

// For demo: use a fast cron (every 5 seconds)
const DEMO_JOBS: CronJob[] = [
  {
    id: "nightly-digest",
    name: "Nightly Digest",
    // This won't actually fire in demo - we'll manually emit the signal
    expr: "0 21 * * *",
    tz: "America/New_York",
  },
];

async function runDemo() {
  console.log("\n🎯 Cadence Cron → Digest Demo\n");
  console.log("─".repeat(50));

  // Create signal bus
  const bus = createSignalBus<OpenClawSignal>() as SignalBus<OpenClawSignal>;

  // Create cron source (configured but won't fire in demo timing)
  const cronSource = createCronBridge({
    jobs: DEMO_JOBS,
    onFire: (job) => console.log(`⏰ Cron fired: ${job.name}`),
  });

  // Create insight digest responder with cron trigger
  const digestResponder = createInsightDigestResponder({
    config: {
      minInsightsToFlush: 1, // Lower threshold for demo
      cooldownHours: 0, // No cooldown for demo
      quietHoursStart: "00:00", // No quiet hours for demo
      quietHoursEnd: "00:00",
    },
    cronTriggerJobIds: ["nightly-digest"],
    onFlush: async (digest) => {
      console.log(`\n📬 Digest flushed! ${digest.insights.length} insights`);
      for (const insight of digest.insights) {
        console.log(`   • ${insight.topic}`);
      }
    },
  });

  // Register responder
  const unsubDigest = digestResponder.register(bus);

  // Subscribe to signals for logging
  bus.on("cadence.cron.fired", (signal) => {
    console.log(`\n📡 Received signal: ${signal.type}`);
    console.log(`   Job: ${signal.payload.jobName} (${signal.payload.jobId})`);
  });

  bus.on("journal.digest.ready", (signal) => {
    console.log(`\n✅ Digest ready signal emitted!`);
    console.log(`   ${signal.payload.insights.length} insights`);
    console.log(`   Trigger: ${signal.payload.trigger}`);
  });

  console.log("\n📝 Step 1: Simulating extracted insights...\n");

  // Emit some test insights
  const testInsights = [
    {
      id: "insight-1",
      topic: "Viking Navigation Techniques",
      pillar: "history",
      hook: "Vikings used crystals to find the sun",
      excerpt: "Calcite sunstones polarize light...",
      scores: { topicClarity: 0.9, publishReady: 0.8, novelty: 0.7 },
      formats: ["thread"],
    },
    {
      id: "insight-2",
      topic: "Pattern Recognition vs Mechanistic Understanding",
      pillar: "cognition",
      hook: "You don't need to understand everything to predict it",
      excerpt: "Reading effects can be as powerful as knowing causes...",
      scores: { topicClarity: 0.85, publishReady: 0.75, novelty: 0.8 },
      formats: ["post"],
    },
  ];

  await bus.emit({
    type: "journal.insight.extracted",
    id: crypto.randomUUID(),
    ts: Date.now(),
    payload: {
      source: {
        signalType: "obsidian.note.modified",
        signalId: "test-signal",
        path: "/vault/journal/2025-02-03.md",
        contentHash: "abc123",
      },
      insights: testInsights,
      extractedAt: Date.now(),
      extractorVersion: "1.0.0",
    },
  });

  console.log(`   Emitted ${testInsights.length} insights to queue`);

  console.log("\n⏰ Step 2: Simulating nightly cron trigger...\n");

  // Manually emit the cron signal (simulating what the cron source would do)
  await bus.emit({
    type: "cadence.cron.fired",
    id: crypto.randomUUID(),
    ts: Date.now(),
    payload: {
      jobId: "nightly-digest",
      jobName: "Nightly Digest",
      expr: "0 21 * * *",
      firedAt: Date.now(),
      tz: "America/New_York",
    },
  });

  // Give async handlers time to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log("\n" + "─".repeat(50));
  console.log("✅ Demo complete!\n");

  // Cleanup
  unsubDigest();
}

runDemo().catch(console.error);
