/**
 * Transport-agnostic interface for communicating with qortex.
 *
 * Implemented by:
 * - QortexMcpConnection (MCP subprocess via StdioClientTransport)
 * - QortexHttpClient (HTTP REST, future; see Peleke/qortex#63)
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
