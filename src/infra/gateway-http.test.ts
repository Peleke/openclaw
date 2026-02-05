import { describe, it, expect, afterEach } from "vitest";
import { fetchGatewayJson } from "./gateway-http.js";
import http from "node:http";

let server: http.Server;

function startTestServer(handler: http.RequestListener): Promise<number> {
  return new Promise((resolve, reject) => {
    server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        resolve(addr.port);
      } else {
        reject(new Error("No address"));
      }
    });
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

afterEach(async () => {
  await stopServer();
  delete process.env.OPENCLAW_GATEWAY_HOST;
  delete process.env.OPENCLAW_GATEWAY_PORT;
});

describe("fetchGatewayJson", () => {
  it("returns parsed JSON on 200", async () => {
    const port = await startTestServer((req, res) => {
      if (req.url === "/api/test/data") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ value: 42, name: "test" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const result = await fetchGatewayJson<{ value: number; name: string }>("/api/test", "/data", {
      host: "127.0.0.1",
      port,
    });
    expect(result).toEqual({ value: 42, name: "test" });
  });

  it("returns null on 404", async () => {
    const port = await startTestServer((req, res) => {
      res.writeHead(404);
      res.end("Not Found");
    });

    const result = await fetchGatewayJson("/api/test", "/missing", {
      host: "127.0.0.1",
      port,
    });
    expect(result).toBeNull();
  });

  it("returns null on 500", async () => {
    const port = await startTestServer((req, res) => {
      res.writeHead(500);
      res.end("Internal Error");
    });

    const result = await fetchGatewayJson("/api/test", "/error", {
      host: "127.0.0.1",
      port,
    });
    expect(result).toBeNull();
  });

  it("returns null on 503", async () => {
    const port = await startTestServer((req, res) => {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "not available" }));
    });

    const result = await fetchGatewayJson("/api/test", "/unavailable", {
      host: "127.0.0.1",
      port,
    });
    expect(result).toBeNull();
  });

  it("returns null on network error (connection refused)", async () => {
    // Get an ephemeral port that's provably closed
    const closedPort = await new Promise<number>((resolve) => {
      const tmp = http.createServer();
      tmp.listen(0, "127.0.0.1", () => {
        const addr = tmp.address();
        const port = typeof addr === "object" && addr ? addr.port : 1;
        tmp.close(() => resolve(port));
      });
    });

    const result = await fetchGatewayJson("/api/test", "/data", {
      host: "127.0.0.1",
      port: closedPort,
      timeoutMs: 500,
    });
    expect(result).toBeNull();
  });

  it("returns null on timeout", async () => {
    const port = await startTestServer((_req, _res) => {
      // Never respond — simulates slow/hung gateway
      // The test timeout (via AbortController) should kick in
    });

    const result = await fetchGatewayJson("/api/test", "/slow", {
      host: "127.0.0.1",
      port,
      timeoutMs: 100, // Very short timeout
    });
    expect(result).toBeNull();
  });

  it("constructs URL from apiPrefix + route", async () => {
    let receivedUrl = "";
    const port = await startTestServer((req, res) => {
      receivedUrl = req.url ?? "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });

    await fetchGatewayJson("/__openclaw__/api/green", "/summary", {
      host: "127.0.0.1",
      port,
    });
    expect(receivedUrl).toBe("/__openclaw__/api/green/summary");
  });

  it("uses resolveGatewayUrl for host/port defaults", async () => {
    // Without a server running on the default port, should gracefully return null
    const result = await fetchGatewayJson("/api/test", "/data", {
      timeoutMs: 200,
    });
    expect(result).toBeNull();
  });

  it("handles malformed JSON response gracefully", async () => {
    const port = await startTestServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("not valid json {{{");
    });

    const result = await fetchGatewayJson("/api/test", "/bad-json", {
      host: "127.0.0.1",
      port,
    });
    // fetch.json() will throw, caught by outer try/catch → null
    expect(result).toBeNull();
  });

  it("handles empty response body on 200", async () => {
    const port = await startTestServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("");
    });

    const result = await fetchGatewayJson("/api/test", "/empty", {
      host: "127.0.0.1",
      port,
    });
    expect(result).toBeNull();
  });

  it("uses env vars when no explicit opts", async () => {
    const port = await startTestServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ env: true }));
    });

    process.env.OPENCLAW_GATEWAY_HOST = "127.0.0.1";
    process.env.OPENCLAW_GATEWAY_PORT = String(port);

    const result = await fetchGatewayJson<{ env: boolean }>("/api/test", "/env");
    expect(result).toEqual({ env: true });
  });
});
