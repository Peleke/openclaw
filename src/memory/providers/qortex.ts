import fs from "node:fs/promises";
import path from "node:path";

import { resolveAgentDir, resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import type { OpenClawConfig } from "../../config/config.js";
import {
  QortexMcpConnection,
  parseCommandString,
  parseToolResult as sharedParseToolResult,
} from "../../qortex/connection.js";
import type { QortexConnection } from "../../qortex/types.js";
import type { MemorySearchResult } from "../manager.js";
import type { MemoryProvider, MemoryProviderStatus, SyncResult } from "./types.js";

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
export function mapQueryItems(response: QortexQueryResponse): MemorySearchResult[] {
  if (!Array.isArray(response.items)) return [];
  return response.items.map((item) => ({
    path: (item.metadata?.path as string) ?? `<qortex:${item.domain}>`,
    startLine: (item.metadata?.start_line as number) ?? 0,
    endLine: (item.metadata?.end_line as number) ?? 0,
    score: item.score,
    snippet: item.content,
    source: ((item.metadata?.source as string) === "sessions" ? "sessions" : "memory") as
      | "memory"
      | "sessions",
  }));
}

// ── Provider ────────────────────────────────────────────────────────────────

export class QortexMemoryProvider implements MemoryProvider {
  private ownedConnection: QortexConnection | null = null;
  private sharedConnection: QortexConnection | null = null;
  private lastQueryId: string | null = null;

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
  ): Promise<MemorySearchResult[]> {
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
    if (response.query_id) this.lastQueryId = response.query_id;
    return mapQueryItems(response);
  }

  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    // qortex doesn't serve files — read locally, same as SQLite provider.
    const agentDir = resolveAgentDir(this.cfg, this.agentId);
    const workspaceDir = resolveAgentWorkspaceDir(this.cfg, this.agentId);

    // Resolve candidate paths and validate they stay within expected dirs
    const candidates = [
      { base: workspaceDir, resolved: path.resolve(workspaceDir, params.relPath) },
      { base: agentDir, resolved: path.resolve(agentDir, params.relPath) },
    ];

    for (const { base, resolved } of candidates) {
      // Path traversal guard: resolved path must be under the base dir
      if (!resolved.startsWith(base + path.sep) && resolved !== base) continue;
      try {
        const raw = await fs.readFile(resolved, "utf8");
        const allLines = raw.split("\n");
        const start = params.from ?? 0;
        const end = params.lines ? start + params.lines : allLines.length;
        const text = allLines.slice(start, end).join("\n");
        return { text, path: resolved };
      } catch {
        continue;
      }
    }
    throw new Error(`File not found: ${params.relPath}`);
  }

  async sync(_params?: { reason?: string; force?: boolean }): Promise<SyncResult> {
    this.assertConnected();
    // qortex_ingest takes a source_path + domain, not a bulk sync.
    // For now, report no-op — real sync will be wired via Cadence events.
    return { indexed: 0, skipped: 0, errors: [] };
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

  /** The query_id from the most recent search (for feedback). */
  get currentQueryId(): string | null {
    return this.lastQueryId;
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
