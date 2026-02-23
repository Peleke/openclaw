/**
 * Factory for creating QortexConnection instances.
 *
 * Reads transport type from config and returns the appropriate implementation:
 * - "mcp" → QortexMcpConnection (subprocess via StdioClientTransport)
 * - "http" → QortexHttpConnection (REST API at baseUrl)
 */

import type { QortexConnection } from "./types.js";
import { QortexMcpConnection } from "./connection.js";
import { QortexHttpConnection } from "./http-connection.js";

export type QortexTransport = "mcp" | "http";

export type CreateQortexConnectionOpts = {
  transport: QortexTransport;
  mcp?: { command: string; args: string[] };
  http?: { baseUrl: string; headers?: Record<string, string> };
};

export function createQortexConnection(opts: CreateQortexConnectionOpts): QortexConnection {
  switch (opts.transport) {
    case "mcp": {
      if (!opts.mcp) throw new Error("mcp config required for transport='mcp'");
      return new QortexMcpConnection(opts.mcp);
    }
    case "http": {
      if (!opts.http) throw new Error("http config required for transport='http'");
      return new QortexHttpConnection(opts.http);
    }
    default:
      throw new Error(`Unknown qortex transport: ${opts.transport}`);
  }
}
