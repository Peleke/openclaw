import fs from "node:fs/promises";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { resolveAgentDir, resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import type { OpenClawConfig } from "../../config/config.js";
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
const INIT_TIMEOUT_MS = 15_000;
const QUERY_TIMEOUT_MS = 30_000;
const FEEDBACK_TIMEOUT_MS = 10_000;

// Command validation: only allow known-safe binaries to spawn.
const ALLOWED_COMMANDS = new Set(["uvx", "uv", "python", "python3", "qortex"]);

function validateCommand(command: string): void {
  const bin = path.basename(command);
  if (!ALLOWED_COMMANDS.has(bin)) {
    throw new Error(
      `Refusing to spawn qortex: command not in allowlist. ` +
        `Allowed: ${[...ALLOWED_COMMANDS].join(", ")}`,
    );
  }
}

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

type McpContent = Array<{ type: string; text?: string; [key: string]: unknown }>;

/** @internal Exported for testing. */
export function parseToolResult(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const content = result.content as McpContent | undefined;
  if (result.isError) {
    const msg =
      content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("") || "unknown qortex error";
    throw new Error(`qortex tool error: ${msg}`);
  }
  const textParts = content?.filter((c) => c.type === "text").map((c) => c.text ?? "");
  const text = textParts?.join("") ?? "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`qortex returned malformed JSON: ${text.slice(0, 200)}`);
  }
}

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
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private lastQueryId: string | null = null;
  private connected = false;
  private signalCleanup: (() => void) | null = null;

  constructor(
    private config: QortexProviderConfig,
    private agentId: string,
    private cfg: OpenClawConfig,
  ) {}

  /** Spawn the qortex MCP subprocess and perform the initialization handshake. */
  async init(): Promise<void> {
    validateCommand(this.config.command);

    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      stderr: "pipe",
    });

    this.client = new Client({ name: "openclaw", version: "1.0.0" }, { capabilities: {} });

    // Log server stderr for diagnostics (don't swallow it)
    if (this.transport.stderr) {
      this.transport.stderr.on("data", (chunk: Buffer) => {
        process.stderr.write(`[qortex] ${String(chunk)}`);
      });
    }

    await this.client.connect(this.transport, { timeout: INIT_TIMEOUT_MS });
    this.connected = true;

    // Register cleanup on parent exit (store refs so close() can remove them)
    const cleanup = () => void this.close().catch(() => {});
    process.once("exit", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("SIGINT", cleanup);
    this.signalCleanup = () => {
      process.removeListener("exit", cleanup);
      process.removeListener("SIGTERM", cleanup);
      process.removeListener("SIGINT", cleanup);
    };
  }

  async search(
    query: string,
    options?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResult[]> {
    this.assertConnected();
    const raw = await this.client!.callTool(
      {
        name: "qortex_query",
        arguments: {
          context: query,
          domains: this.config.domains,
          top_k: options?.maxResults ?? this.config.topK,
          min_confidence: options?.minScore ?? 0,
          mode: "auto",
        },
      },
      undefined,
      { timeout: QUERY_TIMEOUT_MS },
    );
    const response = parseToolResult(raw) as QortexQueryResponse;
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
    const raw = await this.client!.callTool(
      {
        name: "qortex_feedback",
        arguments: { query_id: queryId, outcomes, source: "openclaw" },
      },
      undefined,
      { timeout: FEEDBACK_TIMEOUT_MS },
    );
    parseToolResult(raw); // validate response, throw on error
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
    if (!this.connected) return;
    this.connected = false;
    this.signalCleanup?.();
    this.signalCleanup = null;
    try {
      await this.client?.close();
    } catch {
      // Best-effort cleanup — subprocess may already be dead
    }
    this.client = null;
    this.transport = null;
  }

  private assertConnected(): void {
    if (!this.connected || !this.client) {
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
  const parts = fullCommand.split(/\s+/);
  return {
    command: parts[0]!,
    args: parts.slice(1),
    domains: raw?.domains ?? [`memory/${agentId}`],
    topK: raw?.topK ?? DEFAULT_TOP_K,
    feedback: raw?.feedback ?? true,
  };
}
