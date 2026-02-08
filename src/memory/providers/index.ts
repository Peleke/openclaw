import type { OpenClawConfig } from "../../config/config.js";
import type { MemoryProvider } from "./types.js";

export type {
  MemoryProvider,
  MemoryProviderStatus,
  SyncResult,
  MemorySearchResult,
} from "./types.js";
export { SqliteMemoryProvider } from "./sqlite.js";
export { QortexMemoryProvider, type QortexProviderConfig } from "./qortex.js";

export type MemoryProviderResult = {
  provider: MemoryProvider | null;
  error?: string;
};

/**
 * Create the right MemoryProvider for the given config.
 *
 * - provider: "qortex" → QortexMemoryProvider (MCP subprocess)
 * - everything else    → SqliteMemoryProvider (wraps MemoryIndexManager)
 */
export async function createMemoryProvider(
  cfg: OpenClawConfig,
  agentId: string,
): Promise<MemoryProviderResult> {
  try {
    const { resolveMemorySearchConfig } = await import("../../agents/memory-search.js");
    const resolved = resolveMemorySearchConfig(cfg, agentId);
    if (!resolved) return { provider: null, error: "memory search disabled" };

    if (resolved.provider === "qortex") {
      const { QortexMemoryProvider, resolveQortexConfig } = await import("./qortex.js");
      const qortexCfg = resolveQortexConfig(resolved.qortex, agentId);
      const provider = new QortexMemoryProvider(qortexCfg, agentId, cfg);
      await provider.init();
      return { provider };
    }

    // Default: SQLite path (openai/gemini/local/auto)
    const { MemoryIndexManager } = await import("../manager.js");
    const manager = await MemoryIndexManager.get({ cfg, agentId });
    if (!manager) return { provider: null, error: "memory index unavailable" };

    const { SqliteMemoryProvider } = await import("./sqlite.js");
    return { provider: new SqliteMemoryProvider(manager) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { provider: null, error: message };
  }
}
