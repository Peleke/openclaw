import fs from "node:fs/promises";
import path from "node:path";

import { resolveAgentDir, resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import type { OpenClawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  QortexMcpConnection,
  parseCommandString,
  parseToolResult as sharedParseToolResult,
} from "../../qortex/connection.js";
import type { QortexConnection } from "../../qortex/types.js";
import { listMemoryFiles, buildFileEntry, hashText } from "../internal.js";
import type { MemorySearchResult } from "../manager.js";
import type {
  MemoryProvider,
  MemoryProviderHooks,
  MemoryProviderStatus,
  MemorySearchResponse,
  SyncResult,
} from "./types.js";

const log = createSubsystemLogger("qortex-memory");

// ── Config ──────────────────────────────────────────────────────────────────

export type QortexProviderConfig = {
  command: string;
  args: string[];
  domains: string[];
  topK: number;
  feedback: boolean;
};

const DEFAULT_COMMAND = "uvx";
const DEFAULT_ARGS = ["qortex", "mcp-serve"];
const DEFAULT_TOP_K = 10;

// Timeouts (ms)
const QUERY_TIMEOUT_MS = 30_000;
const FEEDBACK_TIMEOUT_MS = 10_000;
const INGEST_TIMEOUT_MS = 60_000;

// ── Result mapping (qortex QueryItem → MemorySearchResult) ─────────────────

/**
 * Shape returned by qortex_query's MCP tool response.
 * See qortex-track-c/src/qortex/mcp/server.py::_query_impl
 */
type QortexQueryResponse = {
  items: Array<{
    id: string;
    content: string;
    score: number;
    domain: string;
    node_id: string;
    metadata: Record<string, unknown>;
  }>;
  query_id: string;
  rules?: Array<{
    id: string;
    text: string;
    domain: string;
    confidence: number;
    relevance: number;
  }>;
};

/** @internal Exported for testing. Re-export from shared module. */
export const parseToolResult = sharedParseToolResult;

/** @internal Exported for testing. */
export function mapQueryResponse(response: QortexQueryResponse): MemorySearchResponse {
  const results: MemorySearchResult[] = Array.isArray(response.items)
    ? response.items.map((item) => ({
        path: (item.metadata?.path as string) ?? `<qortex:${item.domain}>`,
        startLine: (item.metadata?.start_line as number) ?? 0,
        endLine: (item.metadata?.end_line as number) ?? 0,
        score: item.score,
        snippet: item.content,
        source: ((item.metadata?.source as string) === "sessions" ? "sessions" : "memory") as
          | "memory"
          | "sessions",
      }))
    : [];
  return {
    results,
    rules: response.rules?.map((r) => ({
      id: r.id,
      text: r.text,
      domain: r.domain,
      confidence: r.confidence,
      relevance: r.relevance,
    })),
    queryId: response.query_id || undefined,
  };
}

// ── Provider ────────────────────────────────────────────────────────────────

export class QortexMemoryProvider implements MemoryProvider {
  private ownedConnection: QortexConnection | null = null;
  private sharedConnection: QortexConnection | null = null;
  /** Content hashes from last sync — skip re-ingest for unchanged files. */
  private ingestedHashes = new Map<string, string>();
  /** Whether we've ever synced (for onFirstSync hook). */
  private hasSynced = false;
  hooks: MemoryProviderHooks = {};

  constructor(
    private config: QortexProviderConfig,
    private agentId: string,
    private cfg: OpenClawConfig,
    /** Optional shared connection. If provided, init() is a no-op and close() won't close it. */
    sharedConnection?: QortexConnection,
  ) {
    if (sharedConnection) {
      this.sharedConnection = sharedConnection;
    }
  }

  private get connection(): QortexConnection | null {
    return this.sharedConnection ?? this.ownedConnection;
  }

  private get connected(): boolean {
    return this.connection?.isConnected ?? false;
  }

  /** Spawn the qortex MCP subprocess and perform the initialization handshake. */
  async init(): Promise<void> {
    // Skip if using shared connection (already initialized)
    if (this.sharedConnection) return;

    this.ownedConnection = new QortexMcpConnection({
      command: this.config.command,
      args: this.config.args,
    });
    await this.ownedConnection.init();
  }

  async search(
    query: string,
    options?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResponse> {
    this.assertConnected();
    const response = (await this.connection!.callTool(
      "qortex_query",
      {
        context: query,
        domains: this.config.domains,
        top_k: options?.maxResults ?? this.config.topK,
        min_confidence: options?.minScore ?? 0,
        mode: "auto",
      },
      { timeout: QUERY_TIMEOUT_MS },
    )) as QortexQueryResponse;
    return mapQueryResponse(response);
  }

  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    const agentDir = resolveAgentDir(this.cfg, this.agentId);
    const workspaceDir = resolveAgentWorkspaceDir(this.cfg, this.agentId);

    // Try filesystem first
    const candidates = [
      { base: workspaceDir, resolved: path.resolve(workspaceDir, params.relPath) },
      { base: agentDir, resolved: path.resolve(agentDir, params.relPath) },
    ];

    for (const { base, resolved } of candidates) {
      if (!resolved.startsWith(base + path.sep) && resolved !== base) continue;
      try {
        const raw = await fs.readFile(resolved, "utf8");
        const allLines = raw.split("\n");
        const start = params.from ?? 0;
        const end = params.lines ? start + params.lines : allLines.length;
        const text = allLines.slice(start, end).join("\n");

        // Async: sync this file to DB if content changed
        const hash = hashText(raw);
        if (this.ingestedHashes.get(params.relPath) !== hash && this.connected) {
          this.sync({ reason: `readFile:${params.relPath}` }).catch((err) =>
            log.warn(`background sync after readFile failed: ${err}`),
          );
        }

        return { text, path: resolved };
      } catch {
        continue;
      }
    }

    // File not found — fall back to DB via search
    if (this.connected) {
      try {
        const { results } = await this.search(`file:${params.relPath}`, { maxResults: 1 });
        if (results.length > 0 && results[0]!.snippet) {
          log.info(`readFile: serving ${params.relPath} from DB (file not on disk)`);
          return { text: results[0]!.snippet, path: params.relPath };
        }
      } catch (err) {
        log.warn(`readFile: DB fallback failed for ${params.relPath}: ${err}`);
      }
    }

    return { text: "", path: params.relPath };
  }

  async sync(params?: { reason?: string; force?: boolean }): Promise<SyncResult> {
    this.assertConnected();
    const workspaceDir = resolveAgentWorkspaceDir(this.cfg, this.agentId);
    const extraPaths = this.cfg.agents?.defaults?.memorySearch?.extraPaths;
    const files = await listMemoryFiles(workspaceDir, extraPaths);

    const result: SyncResult = { indexed: 0, skipped: 0, errors: [] };
    const isFirst = !this.hasSynced && this.ingestedHashes.size === 0;
    const domain = this.config.domains[0] ?? `memory/${this.agentId}`;

    for (const absPath of files) {
      try {
        const entry = await buildFileEntry(absPath, workspaceDir);
        const prevHash = this.ingestedHashes.get(entry.path);

        // Skip unchanged files unless forced
        if (!params?.force && prevHash === entry.hash) {
          result.skipped++;
          continue;
        }

        await this.connection!.callTool(
          "qortex_ingest",
          {
            source_path: absPath,
            domain,
            source_type: "markdown",
          },
          { timeout: INGEST_TIMEOUT_MS },
        );

        const oldHash = prevHash;
        this.ingestedHashes.set(entry.path, entry.hash);
        result.indexed++;

        if (oldHash && oldHash !== entry.hash) {
          this.hooks.onVersionChange?.(entry.path, oldHash, entry.hash);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`sync: failed to ingest ${absPath}: ${msg}`);
        result.errors.push(msg);
      }
    }

    this.hasSynced = true;
    if (isFirst && result.indexed > 0) {
      this.hooks.onFirstSync?.();
    }
    this.hooks.onSyncComplete?.(result);

    log.info(
      `sync: indexed=${result.indexed} skipped=${result.skipped} errors=${result.errors.length}`,
    );
    return result;
  }

  /** Send feedback on search results to improve future retrieval (Thompson Sampling). */
  async feedback(
    queryId: string,
    outcomes: Record<string, "accepted" | "rejected" | "partial">,
  ): Promise<void> {
    this.assertConnected();
    await this.connection!.callTool(
      "qortex_feedback",
      { query_id: queryId, outcomes, source: "openclaw" },
      { timeout: FEEDBACK_TIMEOUT_MS },
    );
  }

  status(): MemoryProviderStatus {
    return {
      available: this.connected,
      provider: "qortex",
      details: {
        domains: this.config.domains,
        feedback: this.config.feedback,
      },
    };
  }

  async close(): Promise<void> {
    // Only close the connection we own, not a shared one
    if (this.ownedConnection) {
      await this.ownedConnection.close();
      this.ownedConnection = null;
    }
  }

  private assertConnected(): void {
    if (!this.connected || !this.connection) {
      throw new Error("QortexMemoryProvider not connected. Call init() first.");
    }
  }
}

// ── Config resolution ───────────────────────────────────────────────────────

export function resolveQortexConfig(
  raw: { command?: string; domains?: string[]; topK?: number; feedback?: boolean } | undefined,
  agentId: string,
): QortexProviderConfig {
  const fullCommand = raw?.command ?? `${DEFAULT_COMMAND} ${DEFAULT_ARGS.join(" ")}`;
  const parsed = parseCommandString(fullCommand);
  return {
    command: parsed.command,
    args: parsed.args,
    domains: raw?.domains ?? [`memory/${agentId}`],
    topK: raw?.topK ?? DEFAULT_TOP_K,
    feedback: raw?.feedback ?? true,
  };
}
