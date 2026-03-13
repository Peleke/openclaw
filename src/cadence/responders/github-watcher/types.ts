/**
 * GitHub Watcher responder types.
 *
 * Config and injectable dependency interfaces for the nightly
 * GitHub activity scanner and synthesis responder.
 */

import type { OpenClawPayloadMap } from "../../signals.js";

/**
 * Configuration for the GitHub watcher responder.
 */
export interface GitHubWatcherConfig {
  /** GitHub username to scan repos for (default: "Peleke") */
  owner: string;

  /** Scan time in HH:MM format (default: "21:00") */
  scanTime: string;

  /** Output directory within vault (default: "Buildlog") */
  outputDir: string;

  /** Max buildlog entries per repo to include (default: 3) */
  maxBuildlogEntries: number;

  /** Repos to exclude from scanning */
  excludeRepos: string[];
}

export const DEFAULT_GITHUB_WATCHER_CONFIG: GitHubWatcherConfig = {
  owner: "Peleke",
  scanTime: "21:00",
  outputDir: "Buildlog",
  maxBuildlogEntries: 3,
  excludeRepos: [],
};

/**
 * A GitHub repository summary.
 */
export interface GitHubRepo {
  name: string;
  fullName: string;
  archived: boolean;
  fork: boolean;
  pushedAt: string;
}

/**
 * A GitHub pull request summary.
 */
export interface GitHubPR {
  number: number;
  title: string;
  url: string;
  body: string;
  mergedAt?: string;
  createdAt: string;
}

/**
 * A buildlog entry from a repo.
 */
export interface BuildlogEntry {
  name: string;
  content: string;
}

/**
 * Injectable GitHub API client interface.
 */
export interface GitHubClient {
  listRepos(owner: string): Promise<GitHubRepo[]>;
  getMergedPRsForDate(repo: string, date: string): Promise<GitHubPR[]>;
  getOpenPRs(repo: string): Promise<GitHubPR[]>;
  hasBuildlogDir(repo: string): Promise<boolean>;
  getRecentBuildlogEntries(repo: string, limit: number): Promise<BuildlogEntry[]>;
}

/**
 * Injectable file writer interface.
 */
export interface FileWriter {
  exists(path: string): Promise<boolean>;
  write(path: string, content: string): Promise<void>;
}

/**
 * Injectable clock for testing.
 */
export interface WatcherClock {
  /** Returns today's date as YYYY-MM-DD */
  today(): string;
}

/**
 * Scan result for a single repo.
 */
export type RepoScanResult = OpenClawPayloadMap["github.scan.completed"]["repos"][number];
