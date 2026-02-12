import type { MemoryIndexManager } from "../manager.js";
import type {
  MemoryProvider,
  MemoryProviderStatus,
  MemorySearchResponse,
  SyncResult,
} from "./types.js";

/**
 * Thin adapter that wraps the existing `MemoryIndexManager` behind the
 * `MemoryProvider` interface. Every call delegates directly; no new logic.
 */
export class SqliteMemoryProvider implements MemoryProvider {
  constructor(private manager: MemoryIndexManager) {}

  async search(
    query: string,
    options?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResponse> {
    const results = await this.manager.search(query, options);
    return { results };
  }

  async readFile(params: { relPath: string; from?: number; lines?: number }) {
    return this.manager.readFile(params);
  }

  async sync(params?: { reason?: string; force?: boolean }): Promise<SyncResult> {
    await this.manager.sync(params);
    const s = this.manager.status();
    return { indexed: s.files, skipped: 0, errors: [] };
  }

  status(): MemoryProviderStatus {
    const s = this.manager.status();
    return {
      available: true,
      provider: s.provider,
      model: s.model,
      fallback: s.fallback?.from,
    };
  }

  async close() {
    await this.manager.close();
  }
}
