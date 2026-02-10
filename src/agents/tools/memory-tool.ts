import { Type } from "@sinclair/typebox";

import type { OpenClawConfig } from "../../config/config.js";
import { getMemoryProvider } from "../../memory/search-manager.js";
import type { QortexMemoryProvider } from "../../memory/providers/qortex.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import { resolveMemorySearchConfig } from "../memory-search.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("memory-tools");

const MemorySearchSchema = Type.Object({
  query: Type.String(),
  maxResults: Type.Optional(Type.Number()),
  minScore: Type.Optional(Type.Number()),
});

const MemoryGetSchema = Type.Object({
  path: Type.String(),
  from: Type.Optional(Type.Number()),
  lines: Type.Optional(Type.Number()),
});

const MemoryFeedbackSchema = Type.Object({
  query_id: Type.String(),
  item_id: Type.String(),
  outcome: Type.String(),
});

export function createMemorySearchTool(options: {
  config?: OpenClawConfig;
  agentSessionKey?: string;
}): AnyAgentTool | null {
  const cfg = options.config;
  if (!cfg) {
    log.warn("memory_search not registered: no config passed to plugin");
    return null;
  }
  const agentId = resolveSessionAgentId({
    sessionKey: options.agentSessionKey,
    config: cfg,
  });
  const resolved = resolveMemorySearchConfig(cfg, agentId);
  if (!resolved) {
    log.warn(
      `memory_search not registered: memorySearch disabled or missing for agent=${agentId} (check agents.defaults.memorySearch)`,
    );
    return null;
  }
  return {
    label: "Memory Search",
    name: "memory_search",
    description:
      "Mandatory recall step: semantically search MEMORY.md + memory/*.md (and optional session transcripts) before answering questions about prior work, decisions, dates, people, preferences, or todos; returns top snippets with path + lines.",
    parameters: MemorySearchSchema,
    execute: async (_toolCallId, params) => {
      const query = readStringParam(params, "query", { required: true });
      const maxResults = readNumberParam(params, "maxResults");
      const minScore = readNumberParam(params, "minScore");
      const { provider, error } = await getMemoryProvider({
        cfg,
        agentId,
      });
      if (!provider) {
        return jsonResult({ results: [], disabled: true, error });
      }
      try {
        const results = await provider.search(query, {
          maxResults,
          minScore,
          sessionKey: options.agentSessionKey,
        });
        const status = provider.status();
        return jsonResult({
          results,
          provider: status.provider,
          model: status.model,
          fallback: status.fallback,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ results: [], disabled: true, error: message });
      }
    },
  };
}

export function createMemoryGetTool(options: {
  config?: OpenClawConfig;
  agentSessionKey?: string;
}): AnyAgentTool | null {
  const cfg = options.config;
  if (!cfg) return null;
  const agentId = resolveSessionAgentId({
    sessionKey: options.agentSessionKey,
    config: cfg,
  });
  if (!resolveMemorySearchConfig(cfg, agentId)) return null;
  return {
    label: "Memory Get",
    name: "memory_get",
    description:
      "Safe snippet read from MEMORY.md, memory/*.md, or configured memorySearch.extraPaths with optional from/lines; use after memory_search to pull only the needed lines and keep context small.",
    parameters: MemoryGetSchema,
    execute: async (_toolCallId, params) => {
      const relPath = readStringParam(params, "path", { required: true });
      const from = readNumberParam(params, "from", { integer: true });
      const lines = readNumberParam(params, "lines", { integer: true });
      const { provider, error } = await getMemoryProvider({
        cfg,
        agentId,
      });
      if (!provider) {
        return jsonResult({ path: relPath, text: "", disabled: true, error });
      }
      try {
        const result = await provider.readFile({
          relPath,
          from: from ?? undefined,
          lines: lines ?? undefined,
        });
        return jsonResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ path: relPath, text: "", disabled: true, error: message });
      }
    },
  };
}

/**
 * Create the memory_feedback tool (qortex-only).
 * Returns null when memory search is disabled or provider isn't qortex.
 */
export function createMemoryFeedbackTool(options: {
  config?: OpenClawConfig;
  agentSessionKey?: string;
}): AnyAgentTool | null {
  const cfg = options.config;
  if (!cfg) return null;
  const agentId = resolveSessionAgentId({
    sessionKey: options.agentSessionKey,
    config: cfg,
  });
  const resolved = resolveMemorySearchConfig(cfg, agentId);
  if (!resolved || resolved.provider !== "qortex" || !resolved.qortex?.feedback) return null;
  return {
    label: "Memory Feedback",
    name: "memory_feedback",
    description:
      "Rate a memory search result to improve future retrieval. Call after using memory_search results. Only works with the qortex provider.",
    parameters: MemoryFeedbackSchema,
    execute: async (_toolCallId, params) => {
      const queryId = readStringParam(params, "query_id", { required: true });
      const itemId = readStringParam(params, "item_id", { required: true });
      const outcome = readStringParam(params, "outcome", { required: true });
      if (!["accepted", "rejected", "partial"].includes(outcome)) {
        return jsonResult({
          ok: false,
          error: 'outcome must be "accepted", "rejected", or "partial"',
        });
      }
      const { provider, error } = await getMemoryProvider({ cfg, agentId });
      if (!provider) {
        return jsonResult({ ok: false, error });
      }
      try {
        const qortex = provider as QortexMemoryProvider;
        if (typeof qortex.feedback !== "function") {
          return jsonResult({
            ok: true,
            skipped: true,
            reason: "provider does not support feedback",
          });
        }
        await qortex.feedback(queryId, {
          [itemId]: outcome as "accepted" | "rejected" | "partial",
        });
        return jsonResult({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ ok: false, error: message });
      }
    },
  };
}
