/**
 * Shared MCP connection to a remote qortex HTTP server.
 *
 * Alternative to QortexMcpConnection (stdio subprocess) for deployments
 * where qortex runs as a standalone HTTP service (`qortex serve`).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { parseToolResult } from "./connection.js";
import type { QortexConnection } from "./types.js";

// Timeouts (ms)
const INIT_TIMEOUT_MS = 15_000;
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

/**
 * Shared MCP connection to a remote qortex HTTP server.
 *
 * Lifecycle: create → init() → callTool() / isConnected → close()
 *
 * Intended as a singleton per agent runtime (gateway or CLI run).
 */
export class QortexHttpConnection implements QortexConnection {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private connected = false;

  constructor(
    private readonly baseUrl: string,
    private readonly headers?: Record<string, string>,
  ) {}

  /** Connect to the remote qortex HTTP server and perform the initialization handshake. */
  async init(): Promise<void> {
    if (this.connected) return;

    const url = new URL(this.baseUrl);

    const requestInit: RequestInit | undefined = this.headers
      ? { headers: this.headers }
      : undefined;

    this.transport = new StreamableHTTPClientTransport(url, {
      requestInit,
    });

    this.client = new Client({ name: "openclaw", version: "1.0.0" }, { capabilities: {} });

    await this.client.connect(this.transport, { timeout: INIT_TIMEOUT_MS });
    this.connected = true;

    // Register cleanup on parent exit
    const cleanup = () => void this.close().catch(() => {});
    process.once("exit", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("SIGINT", cleanup);
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** Call an MCP tool and return the parsed result. */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    opts?: { timeout?: number },
  ): Promise<unknown> {
    this.assertConnected();
    const raw = await this.client!.callTool({ name, arguments: args }, undefined, {
      timeout: opts?.timeout ?? DEFAULT_TOOL_TIMEOUT_MS,
    });
    return parseToolResult(raw);
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    try {
      await this.client?.close();
    } catch {
      // Best-effort cleanup — server connection may already be closed
    }
    this.client = null;
    this.transport = null;
  }

  private assertConnected(): void {
    if (!this.connected || !this.client) {
      throw new Error("QortexHttpConnection not connected. Call init() first.");
    }
  }
}
