/**
 * Cadence P1 Configuration.
 *
 * Simple JSON config for dogfooding. Will be integrated into
 * `openclaw config` system later.
 *
 * Config file: ~/.openclaw/cadence.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export interface CadenceP1Config {
  /** Enable the insight pipeline */
  enabled: boolean;

  /** Path to Obsidian vault */
  vaultPath: string;

  /** Delivery channel */
  delivery: {
    channel: "telegram" | "discord" | "log";
    telegramChatId?: string;
    discordChannelId?: string;
    /** Optional JSONL file path for signal logging (used by sandbox containers) */
    fileLogPath?: string;
  };

  /** Content pillars for categorization */
  pillars: Array<{
    id: string;
    name: string;
    keywords?: string[];
  }>;

  /** LLM settings */
  llm: {
    provider: "anthropic" | "openai";
    model: string;
  };

  /** Extraction settings */
  extraction: {
    /** Tag that marks content as publishable (default: "::publish") */
    publishTag: string;
  };

  /** Digest settings */
  digest: {
    /** Minimum insights before auto-flush */
    minToFlush: number;
    /** Max hours between flushes */
    maxHoursBetween: number;
    /** Hours to wait after writing before surfacing */
    cooldownHours: number;
    /** Quiet hours (no delivery) */
    quietHoursStart: string;
    quietHoursEnd: string;
  };

  /** Scheduled delivery */
  schedule: {
    /** Enable scheduled digests */
    enabled: boolean;
    /** Nightly digest time (cron or HH:MM) */
    nightlyDigest?: string;
    /** Morning standup time (cron or HH:MM) */
    morningStandup?: string;
    /** Timezone */
    timezone: string;
  };

  /** GitHub Watcher settings (nightly repo scan + synthesis) */
  githubWatcher?: {
    /** Enable the GitHub watcher (default: false) */
    enabled: boolean;
    /** GitHub username to scan (default: "Peleke") */
    owner?: string;
    /** Scan time in HH:MM format (default: "21:00") */
    scanTime?: string;
    /** Output directory within vault (default: "Buildlog") */
    outputDir?: string;
    /** Max buildlog entries per repo (default: 3) */
    maxBuildlogEntries?: number;
    /** Repos to exclude from scanning */
    excludeRepos?: string[];
  };
}

export const DEFAULT_CONFIG: CadenceP1Config = {
  enabled: false,
  vaultPath: "",
  delivery: {
    channel: "log",
  },
  pillars: [
    { id: "tech", name: "Technology", keywords: ["code", "software", "ai"] },
    { id: "business", name: "Business", keywords: ["startup", "strategy"] },
    { id: "life", name: "Life", keywords: ["reflection", "growth"] },
  ],
  llm: {
    provider: "anthropic",
    model: "claude-3-5-haiku-latest",
  },
  extraction: {
    publishTag: "::publish",
  },
  digest: {
    minToFlush: 3,
    maxHoursBetween: 24,
    cooldownHours: 2,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
  },
  schedule: {
    enabled: false,
    nightlyDigest: "21:00", // 9pm
    morningStandup: "08:00", // 8am
    timezone: "America/New_York",
  },
};

/**
 * Get the config file path.
 */
export function getConfigPath(): string {
  return path.join(os.homedir(), ".openclaw", "cadence.json");
}

/**
 * Load config from file, creating default if not exists.
 */
export async function loadCadenceConfig(): Promise<CadenceP1Config> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content) as Partial<CadenceP1Config>;

    // Deep merge with defaults
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      delivery: { ...DEFAULT_CONFIG.delivery, ...parsed.delivery },
      llm: { ...DEFAULT_CONFIG.llm, ...parsed.llm },
      extraction: { ...DEFAULT_CONFIG.extraction, ...parsed.extraction },
      digest: { ...DEFAULT_CONFIG.digest, ...parsed.digest },
      schedule: { ...DEFAULT_CONFIG.schedule, ...parsed.schedule },
      pillars: parsed.pillars ?? DEFAULT_CONFIG.pillars,
      githubWatcher: parsed.githubWatcher,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Save config to file.
 */
export async function saveCadenceConfig(config: CadenceP1Config): Promise<void> {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);

  await mkdir(dir, { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Initialize config file with defaults if not exists.
 */
export async function initCadenceConfig(): Promise<{ created: boolean; path: string }> {
  const configPath = getConfigPath();

  if (existsSync(configPath)) {
    return { created: false, path: configPath };
  }

  await saveCadenceConfig(DEFAULT_CONFIG);
  return { created: true, path: configPath };
}

/**
 * Convert HH:MM time to cron expression for daily job.
 */
export function timeToCron(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return `${minute} ${hour} * * *`;
}

/**
 * Get scheduled jobs from config.
 */
export function getScheduledJobs(config: CadenceP1Config): Array<{
  id: string;
  name: string;
  expr: string;
  tz: string;
}> {
  const jobs: Array<{ id: string; name: string; expr: string; tz: string }> = [];

  if (config.schedule.enabled) {
    if (config.schedule.nightlyDigest) {
      jobs.push({
        id: "nightly-digest",
        name: "Nightly Digest",
        expr: timeToCron(config.schedule.nightlyDigest),
        tz: config.schedule.timezone,
      });
    }

    if (config.schedule.morningStandup) {
      jobs.push({
        id: "morning-standup",
        name: "Morning Standup",
        expr: timeToCron(config.schedule.morningStandup),
        tz: config.schedule.timezone,
      });
    }
  }

  // GitHub Watcher has its own enabled flag, independent of schedule.enabled
  const ghw = config.githubWatcher;
  if (ghw?.enabled) {
    const scanTime = ghw.scanTime ?? "21:00";
    jobs.push({
      id: "github-watcher",
      name: "GitHub Watcher",
      expr: timeToCron(scanTime),
      tz: config.schedule.timezone,
    });
  }

  return jobs;
}
