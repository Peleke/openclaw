import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QortexHttpConnection } from "./http-connection.js";

// ── Helpers ─────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, { status });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("QortexHttpConnection", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createConn(opts?: { baseUrl?: string; healthIntervalMs?: number }) {
    return new QortexHttpConnection({
      baseUrl: opts?.baseUrl ?? "http://localhost:8400",
      healthIntervalMs: opts?.healthIntervalMs ?? 0, // disable periodic health
    });
  }

  // ── init() ──────────────────────────────────────────────────────

  describe("init()", () => {
    it("connects when health check returns 200", async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: "ok" }));
      const conn = createConn();
      await conn.init();
      expect(conn.isConnected).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://localhost:8400/v1/health");
    });

    it("throws when health check returns non-200", async () => {
      fetchSpy.mockResolvedValueOnce(textResponse("down", 503));
      const conn = createConn();
      await expect(conn.init()).rejects.toThrow("health check failed");
      expect(conn.isConnected).toBe(false);
    });

    it("is idempotent after successful init", async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: "ok" }));
      const conn = createConn();
      await conn.init();
      await conn.init(); // second call should be no-op
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("strips trailing slashes from baseUrl", async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: "ok" }));
      const conn = createConn({ baseUrl: "http://localhost:8400///" });
      await conn.init();
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://localhost:8400/v1/health");
    });
  });

  // ── callTool() ──────────────────────────────────────────────────

  describe("callTool()", () => {
    it("dispatches POST to correct route", async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({ status: "ok" })) // init
        .mockResolvedValueOnce(jsonResponse({ items: [{ id: "x" }] })); // callTool

      const conn = createConn();
      await conn.init();
      const result = await conn.callTool("qortex_query", { context: "test" });

      expect(result).toEqual({ items: [{ id: "x" }] });
      const [url, opts] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect(url).toBe("http://localhost:8400/v1/query");
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body as string)).toEqual({ context: "test" });
    });

    it("dispatches GET with path params for posteriors", async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
        .mockResolvedValueOnce(jsonResponse({ learner: "test", arms: [] }));

      const conn = createConn();
      await conn.init();
      await conn.callTool("qortex_learning_posteriors", { learner: "test" });

      const [url, opts] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect(url).toBe("http://localhost:8400/v1/learning/test/posteriors");
      expect(opts.method).toBe("GET");
      expect(opts.body).toBeUndefined();
    });

    it("dispatches GET with query params for metrics", async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
        .mockResolvedValueOnce(jsonResponse({ learner: "test" }));

      const conn = createConn();
      await conn.init();
      await conn.callTool("qortex_learning_metrics", { learner: "test", window: 50 });

      const [url] = fetchSpy.mock.calls[1] as [string, RequestInit];
      expect(url).toBe("http://localhost:8400/v1/learning/test/metrics?window=50");
    });

    it("throws on unknown tool name", async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: "ok" }));
      const conn = createConn();
      await conn.init();
      await expect(conn.callTool("nonexistent_tool", {})).rejects.toThrow("Unknown qortex tool");
    });

    it("throws on 4xx without retrying", async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
        .mockResolvedValueOnce(jsonResponse({ error: "bad request" }, 400));

      const conn = createConn();
      await conn.init();
      await expect(conn.callTool("qortex_query", { context: "x" })).rejects.toThrow(
        "qortex tool error: bad request",
      );
      // Only 2 fetches: init + 1 attempt (no retries for 4xx)
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("retries on 5xx and eventually throws", async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({ status: "ok" })) // init
        .mockResolvedValueOnce(textResponse("error", 502)) // attempt 1
        .mockResolvedValueOnce(textResponse("error", 502)) // attempt 2
        .mockResolvedValueOnce(textResponse("error", 502)); // attempt 3

      const conn = createConn();
      await conn.init();
      await expect(conn.callTool("qortex_query", { context: "x" })).rejects.toThrow(
        "qortex server error",
      );
      // init + 3 retries = 4 total
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it("succeeds on retry after transient failure", async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({ status: "ok" })) // init
        .mockResolvedValueOnce(textResponse("error", 500)) // attempt 1 fails
        .mockResolvedValueOnce(jsonResponse({ items: [] })); // attempt 2 succeeds

      const conn = createConn();
      await conn.init();
      const result = await conn.callTool("qortex_query", { context: "x" });
      expect(result).toEqual({ items: [] });
    });

    it("returns empty object for empty response body", async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
        .mockResolvedValueOnce(new Response("", { status: 200 }));

      const conn = createConn();
      await conn.init();
      const result = await conn.callTool("qortex_status", {});
      expect(result).toEqual({});
    });

    it("throws on malformed JSON response", async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
        .mockResolvedValueOnce(new Response("not json {", { status: 200 }));

      const conn = createConn();
      await conn.init();
      await expect(conn.callTool("qortex_status", {})).rejects.toThrow(
        "qortex returned malformed JSON",
      );
    });

    it("passes custom headers", async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
        .mockResolvedValueOnce(jsonResponse({ items: [] }));

      const conn = new QortexHttpConnection({
        baseUrl: "http://localhost:8400",
        headers: { Authorization: "Bearer secret" },
        healthIntervalMs: 0,
      });
      await conn.init();
      await conn.callTool("qortex_query", { context: "x" });

      const [, opts] = fetchSpy.mock.calls[1] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer secret");
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  // ── close() ─────────────────────────────────────────────────────

  describe("close()", () => {
    it("marks connection as disconnected", async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: "ok" }));
      const conn = createConn();
      await conn.init();
      expect(conn.isConnected).toBe(true);
      await conn.close();
      expect(conn.isConnected).toBe(false);
    });
  });

  // ── TOOL_ROUTE_MAP completeness ─────────────────────────────────

  describe("route map coverage", () => {
    const EXPECTED_TOOLS = [
      "qortex_query",
      "qortex_feedback",
      "qortex_ingest",
      "qortex_ingest_text",
      "qortex_ingest_structured",
      "qortex_ingest_message",
      "qortex_learning_select",
      "qortex_learning_observe",
      "qortex_learning_posteriors",
      "qortex_learning_metrics",
      "qortex_learning_reset",
      "qortex_learning_session_start",
      "qortex_learning_session_end",
      "qortex_status",
      "qortex_domains",
      "qortex_explore",
      "qortex_rules",
    ];

    it.each(EXPECTED_TOOLS)("has route for %s", async (toolName) => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse({ status: "ok" }))
        .mockResolvedValueOnce(jsonResponse({}));

      const conn = createConn();
      await conn.init();
      // Should not throw "Unknown qortex tool"
      await expect(
        conn.callTool(toolName, {
          context: "x",
          learner: "t",
          node_id: "n",
          text: "t",
          session_id: "s",
        }),
      ).resolves.toBeDefined();
    });
  });
});
