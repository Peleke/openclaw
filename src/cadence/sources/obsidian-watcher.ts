/**
 * Obsidian vault watcher source.
 *
 * Watches a vault directory for markdown changes and emits:
 * - "obsidian.note.modified" — when a note is created/updated
 * - "obsidian.task.found" — for each task found in the note
 *
 * Uses chokidar directly for async file reading during events.
 */

import { readFile } from "node:fs/promises";
import { watch, type FSWatcher } from "chokidar";
import type { Source } from "@peleke.s/cadence";
import type { OpenClawSignal } from "../signals.js";
import { extractTasks } from "../obsidian.js";

export interface ObsidianWatcherOptions {
  /** Path to Obsidian vault */
  vaultPath: string;
  /** Glob patterns to exclude (default: node_modules, .obsidian) */
  exclude?: string[];
  /** Whether to emit task signals (default: true) */
  emitTasks?: boolean;
}

/**
 * Parse YAML frontmatter from markdown content.
 */
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result: Record<string, unknown> = {};

  // Simple YAML parser for key: value pairs
  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      // Basic type coercion
      if (value === "true") result[key] = true;
      else if (value === "false") result[key] = false;
      else if (!isNaN(Number(value)) && value !== "") result[key] = Number(value);
      else result[key] = value.replace(/^["']|["']$/g, ""); // Strip quotes
    }
  }

  return result;
}

/**
 * Create an Obsidian vault watcher source.
 */
export function createObsidianWatcherSource(
  options: ObsidianWatcherOptions,
): Source<OpenClawSignal> {
  const {
    vaultPath,
    exclude = ["**/node_modules/**", "**/.obsidian/**"],
    emitTasks = true,
  } = options;

  let watcher: FSWatcher | null = null;
  let emitFn: ((signal: OpenClawSignal) => Promise<void>) | null = null;

  async function processFile(path: string, _eventType: "add" | "change"): Promise<void> {
    if (!emitFn) return;
    // Only process markdown files
    if (!path.endsWith(".md")) return;

    try {
      const content = await readFile(path, "utf-8");
      const frontmatter = parseFrontmatter(content);
      const ts = Date.now();

      // Emit note modified signal
      const noteSignal: OpenClawSignal = {
        type: "obsidian.note.modified",
        ts,
        id: crypto.randomUUID(),
        payload: {
          path,
          content,
          frontmatter,
        },
      };
      await emitFn(noteSignal);

      // Extract and emit task signals
      if (emitTasks) {
        const tasks = extractTasks(content);
        const lines = content.split("\n");

        let taskIndex = 0;
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];
          if (/^[\t ]*- \[[ xX]\]/.test(line) && taskIndex < tasks.length) {
            const taskSignal: OpenClawSignal = {
              type: "obsidian.task.found",
              ts,
              id: crypto.randomUUID(),
              payload: {
                path,
                task: tasks[taskIndex],
                lineNumber: lineNum + 1,
              },
            };
            await emitFn(taskSignal);
            taskIndex++;
          }
        }
      }
    } catch {
      // File may have been deleted between event and read
    }
  }

  async function start(emit: (signal: OpenClawSignal) => Promise<void>): Promise<void> {
    if (watcher) {
      throw new Error("ObsidianWatcherSource already started");
    }

    emitFn = emit;

    watcher = watch(vaultPath, {
      ignoreInitial: true,
      ignored: (path: string) => {
        // Exclude patterns (node_modules, .obsidian, etc.)
        for (const pattern of exclude) {
          const simplified = pattern.replace(/\*\*/g, "").replace(/\*/g, "");
          if (path.includes(simplified)) return true;
        }
        // Only emit events for .md files; but we don't filter here since
        // directories also get checked. The processFile handler will only
        // get called for actual file events, not directory events.
        return false;
      },
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    watcher.on("add", (path) => processFile(path, "add"));
    watcher.on("change", (path) => processFile(path, "change"));

    // Wait for ready
    await new Promise<void>((resolve) => {
      watcher!.on("ready", resolve);
    });
  }

  async function stop(): Promise<void> {
    if (watcher) {
      await watcher.close();
      watcher = null;
      emitFn = null;
    }
  }

  return {
    name: "obsidian-watcher",
    start,
    stop,
  };
}
