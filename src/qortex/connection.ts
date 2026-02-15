/**
 * Shared MCP connection to qortex subprocess.
 *
 * Both QortexMemoryProvider and QortexLearningClient share a single
 * connection to the same `qortex mcp-serve` subprocess, avoiding
 * duplicate processes and enabling tool-call multiplexing.
 */

import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { QortexConnection } from "./types.js";
export type { QortexConnection } from "./types.js";

// Timeouts (ms)
const INIT_TIMEOUT_MS = 15_000;
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

// Env var prefixes to forward to the qortex subprocess.
// StdioClientTransport only inherits HOME/PATH/USER/etc by default;
// qortex needs QORTEX_* and OTEL_* for observability, VIRTUAL_ENV for venv.
const FORWARDED_ENV_PREFIXES = ["QORTEX_", "OTEL_", "VIRTUAL_ENV", "HF_"];

function collectForwardedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && FORWARDED_ENV_PREFIXES.some((p) => key.startsWith(p))) {
      env[key] = value;
    }
  }
  return env;
}

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

type McpContent = Array<{ type: string; text?: string; [key: string]: unknown }>;

/** Parse MCP tool result into a typed value. Throws on tool errors. */
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

export type QortexConnectionConfig = {
  command: string;
  args: string[];
  /** Extra env vars to pass to the subprocess (merged with MCP SDK defaults). */
  env?: Record<string, string>;
};

/**
 * Shared MCP connection to a qortex subprocess.
 *
 * Lifecycle: create → init() → callTool() / isConnected → close()
 *
 * Intended as a singleton per agent runtime (gateway or CLI run).
 */
export class QortexMcpConnection implements QortexConnection {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connected = false;

  constructor(private readonly config: QortexConnectionConfig) {}

  /** Spawn the qortex MCP subprocess and perform the initialization handshake. */
  async init(): Promise<void> {
    if (this.connected) return;

    validateCommand(this.config.command);

    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: { ...collectForwardedEnv(), ...this.config.env },
      stderr: "pipe",
    });

    this.client = new Client({ name: "openclaw", version: "1.0.0" }, { capabilities: {} });

    // Log server stderr for diagnostics
    if (this.transport.stderr) {
      this.transport.stderr.on("data", (chunk: Buffer) => {
        process.stderr.write(`[qortex] ${String(chunk)}`);
      });
    }

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

  /** Call an MCP tool and return the raw result (for callers that need isError, etc.). */
  async callToolRaw(
    name: string,
    args: Record<string, unknown>,
    opts?: { timeout?: number },
  ): Promise<Awaited<ReturnType<Client["callTool"]>>> {
    this.assertConnected();
    return this.client!.callTool({ name, arguments: args }, undefined, {
      timeout: opts?.timeout ?? DEFAULT_TOOL_TIMEOUT_MS,
    });
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
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
      throw new Error("QortexMcpConnection not connected. Call init() first.");
    }
  }
}

/** Parse a "command arg1 arg2" string into command + args. */
export function parseCommandString(fullCommand: string): QortexConnectionConfig {
  const parts = fullCommand.split(/\s+/);
  return {
    command: parts[0]!,
    args: parts.slice(1),
  };
}

// ---------------------------------------------------------------------------
// Process-level singleton. Set once by the gateway at boot, read by all
// code paths that need a shared qortex connection (memory tools, learning
// select/observe, etc.). Callers that get `undefined` create their own
// one-shot connection as a fallback.
// ---------------------------------------------------------------------------

let _sharedConnection: QortexConnection | undefined;

/** Store the gateway's shared connection so all subsystems can reuse it. */
export function setSharedQortexConnection(conn: QortexConnection): void {
  _sharedConnection = conn;
}

/** Retrieve the shared connection (undefined when running outside gateway). */
export function getSharedQortexConnection(): QortexConnection | undefined {
  return _sharedConnection;
}
