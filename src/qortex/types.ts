/**
 * Transport-agnostic interface for communicating with qortex.
 *
 * Implemented by:
 * - QortexMcpConnection (MCP subprocess via StdioClientTransport)
 * - QortexHttpConnection (MCP over HTTP via StreamableHTTPClientTransport)
 */
export interface QortexConnection {
  readonly isConnected: boolean;
  init(): Promise<void>;
  callTool(
    name: string,
    args: Record<string, unknown>,
    opts?: { timeout?: number },
  ): Promise<unknown>;
  close(): Promise<void>;
}
