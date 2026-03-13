/**
 * GitHub API client wrapping `gh api` CLI commands.
 *
 * Uses `execFile` for safety (no shell injection) and relies on
 * GH_TOKEN being set in the environment for authentication.
 */

import { execFile } from "node:child_process";
import { stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { GitHubClient, GitHubRepo, GitHubPR, BuildlogEntry, FileWriter } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * Call `gh api` with the given path and return parsed JSON.
 */
async function ghApi<T>(apiPath: string): Promise<T> {
  const { stdout } = await execFileAsync("gh", ["api", apiPath, "--paginate"], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout) as T;
}

/**
 * Call `gh api` for a search endpoint (returns { items: T[] }).
 */
async function ghSearchApi<T>(apiPath: string): Promise<T[]> {
  const { stdout } = await execFileAsync("gh", ["api", apiPath], {
    maxBuffer: 10 * 1024 * 1024,
  });
  const result = JSON.parse(stdout) as { items: T[] };
  return result.items ?? [];
}

interface GHRepoResponse {
  name: string;
  full_name: string;
  archived: boolean;
  fork: boolean;
  pushed_at: string;
}

interface GHSearchPRItem {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  pull_request?: { merged_at?: string | null };
  created_at: string;
}

interface GHPRResponse {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  created_at: string;
}

interface GHContentItem {
  name: string;
  type: string;
  download_url: string | null;
  content?: string;
  encoding?: string;
}

/**
 * Create a GitHubClient backed by `gh api` CLI.
 */
export function createGhCliClient(): GitHubClient {
  return {
    async listRepos(owner: string): Promise<GitHubRepo[]> {
      const repos = await ghApi<GHRepoResponse[]>(
        `/users/${encodeURIComponent(owner)}/repos?per_page=100&type=owner&sort=pushed`,
      );
      return repos
        .filter((r) => !r.archived && !r.fork)
        .map((r) => ({
          name: r.name,
          fullName: r.full_name,
          archived: r.archived,
          fork: r.fork,
          pushedAt: r.pushed_at,
        }));
    },

    async getMergedPRsForDate(repo: string, date: string): Promise<GitHubPR[]> {
      const q = encodeURIComponent(`repo:${repo} is:pr is:merged merged:${date}`);
      const items = await ghSearchApi<GHSearchPRItem>(`/search/issues?q=${q}&per_page=30`);
      return items.map((item) => ({
        number: item.number,
        title: item.title,
        url: item.html_url,
        body: (item.body ?? "").slice(0, 200),
        mergedAt: item.pull_request?.merged_at ?? undefined,
        createdAt: item.created_at,
      }));
    },

    async getOpenPRs(repo: string): Promise<GitHubPR[]> {
      const prs = await ghApi<GHPRResponse[]>(`/repos/${repo}/pulls?state=open&per_page=30`);
      return prs.map((pr) => ({
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        body: (pr.body ?? "").slice(0, 200),
        createdAt: pr.created_at,
      }));
    },

    async hasBuildlogDir(repo: string): Promise<boolean> {
      try {
        await ghApi<GHContentItem[]>(`/repos/${repo}/contents/buildlog`);
        return true;
      } catch {
        return false;
      }
    },

    async getRecentBuildlogEntries(repo: string, limit: number): Promise<BuildlogEntry[]> {
      try {
        const items = await ghApi<GHContentItem[]>(`/repos/${repo}/contents/buildlog`);
        const mdFiles = items
          .filter((i) => i.type === "file" && i.name.endsWith(".md"))
          .sort((a, b) => b.name.localeCompare(a.name))
          .slice(0, limit);

        const entries: BuildlogEntry[] = [];
        for (const file of mdFiles) {
          try {
            const detail = await ghApi<GHContentItem>(
              `/repos/${repo}/contents/buildlog/${encodeURIComponent(file.name)}`,
            );
            const content =
              detail.encoding === "base64" && detail.content
                ? Buffer.from(detail.content, "base64").toString("utf-8").slice(0, 500)
                : "";
            entries.push({ name: file.name, content });
          } catch {
            // Skip individual file failures
          }
        }

        return entries;
      } catch {
        return [];
      }
    },
  };
}

/**
 * Create a FileWriter backed by the filesystem.
 */
export function createFsFileWriter(): FileWriter {
  return {
    async exists(filePath: string): Promise<boolean> {
      try {
        await stat(filePath);
        return true;
      } catch {
        return false;
      }
    },

    async write(filePath: string, content: string): Promise<void> {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
    },
  };
}
