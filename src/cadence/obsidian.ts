/**
 * Read Obsidian vault Plan.md files and extract tasks.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Task } from "./types.js";

const TASK_RE = /^[\t ]*- \[([ xX])\] (.+)$/;

/** Extract checkbox tasks from markdown content. */
export function extractTasks(content: string): Task[] {
  const tasks: Task[] = [];
  for (const line of content.split("\n")) {
    const m = TASK_RE.exec(line);
    if (m) {
      tasks.push({ text: m[2].trim(), done: m[1] !== " " });
    }
  }
  return tasks;
}

/** Read a Plan.md file from the vault. Returns null if missing. */
export async function readPlanFile(
  vaultPath: string,
  planPath: string,
): Promise<{ content: string; tasks: Task[] } | null> {
  try {
    const fullPath = join(vaultPath, planPath);
    const content = await readFile(fullPath, "utf-8");
    return { content, tasks: extractTasks(content) };
  } catch {
    return null;
  }
}
