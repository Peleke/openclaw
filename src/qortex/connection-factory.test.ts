import { describe, it, expect } from "vitest";
import { createQortexConnection } from "./connection-factory.js";

describe("createQortexConnection()", () => {
  it("returns QortexMcpConnection for transport='mcp'", () => {
    const conn = createQortexConnection({
      transport: "mcp",
      mcp: { command: "echo", args: ["test"] },
    });
    expect(conn).toBeDefined();
    expect(conn.isConnected).toBe(false);
    // Should have the MCP-specific shape (has init/close/callTool)
    expect(typeof conn.init).toBe("function");
    expect(typeof conn.callTool).toBe("function");
    expect(typeof conn.close).toBe("function");
  });

  it("returns QortexHttpConnection for transport='http'", () => {
    const conn = createQortexConnection({
      transport: "http",
      http: { baseUrl: "http://localhost:8400" },
    });
    expect(conn).toBeDefined();
    expect(conn.isConnected).toBe(false);
    expect(typeof conn.init).toBe("function");
    expect(typeof conn.callTool).toBe("function");
    expect(typeof conn.close).toBe("function");
  });

  it("throws when mcp config missing for transport='mcp'", () => {
    expect(() => createQortexConnection({ transport: "mcp" })).toThrow("mcp config required");
  });

  it("throws when http config missing for transport='http'", () => {
    expect(() => createQortexConnection({ transport: "http" })).toThrow("http config required");
  });

  it("throws on unknown transport", () => {
    expect(() => createQortexConnection({ transport: "grpc" as any })).toThrow(
      "Unknown qortex transport: grpc",
    );
  });

  it("passes headers through to http connection", () => {
    const conn = createQortexConnection({
      transport: "http",
      http: { baseUrl: "http://localhost:8400", headers: { "X-Test": "val" } },
    });
    expect(conn).toBeDefined();
  });
});
