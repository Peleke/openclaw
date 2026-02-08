import type { MemorySearchResult } from "../manager.js";

/** Sync result returned by all providers after indexing. */
export type SyncResult = {
  indexed: number;
  skipped: number;
  errors: string[];
};

/** Provider status snapshot — enough for the status tool and diagnostics. */
export type MemoryProviderStatus = {
  available: boolean;
  provider: string;
  model?: string;
  fallback?: string;
  details?: Record<string, unknown>;
};

/**
 * Common interface for memory search backends.
 *
 * SQLite (existing) and qortex (new) both implement this.
 * Tools (`memory_search`, `memory_get`) depend only on this contract.
 */
export interface MemoryProvider {
  /** Semantically search indexed memory. */
  search(
    query: string,
    options?: {
      maxResults?: number;
      minScore?: number;
      sessionKey?: string;
    },
  ): Promise<MemorySearchResult[]>;

  /** Read a snippet from a memory/session file. */
  readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }>;

  /** Re-index sources (files, sessions, etc.). */
  sync(params?: { reason?: string; force?: boolean }): Promise<SyncResult>;

  /** Current provider status for diagnostics/tool output. */
  status(): MemoryProviderStatus;

  /** Release resources (db connections, subprocesses, etc.). */
  close(): Promise<void>;
}

export type { MemorySearchResult };
