import type { OpenClawConfig } from "../config/config.js";
import type { MemoryIndexManager } from "./manager.js";
import type { MemoryProviderResult } from "./providers/index.js";

export type MemorySearchManagerResult = {
  manager: MemoryIndexManager | null;
  error?: string;
};

export async function getMemorySearchManager(params: {
  cfg: OpenClawConfig;
  agentId: string;
}): Promise<MemorySearchManagerResult> {
  try {
    const { MemoryIndexManager } = await import("./manager.js");
    const manager = await MemoryIndexManager.get(params);
    return { manager };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { manager: null, error: message };
  }
}

/**
 * Get a MemoryProvider for the given config and agent.
 * Routes to qortex or SQLite based on the config's `provider` field.
 */
export async function getMemoryProvider(params: {
  cfg: OpenClawConfig;
  agentId: string;
}): Promise<MemoryProviderResult> {
  const { createMemoryProvider } = await import("./providers/index.js");
  return createMemoryProvider(params.cfg, params.agentId);
}
