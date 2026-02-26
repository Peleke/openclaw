/**
 * Plain HTTP REST client for a remote qortex server (`qortex serve`).
 *
 * Drop-in replacement for QortexHttpConnection (MCP-over-HTTP).
 * Uses standard fetch() against the qortex REST API instead of MCP protocol.
 *
 * Tool name → REST endpoint mapping is handled by an internal routing table,
 * so all existing consumers (online-ingest, learning client, memory provider)
 * continue calling `callTool("qortex_ingest_message", {...})` unchanged.
 */

import type { QortexConnection } from "./types.js";

// Timeouts (ms)
const INIT_TIMEOUT_MS = 10_000;
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Route table: MCP tool name → REST endpoint
// ---------------------------------------------------------------------------

type RouteSpec = {
  method: "GET" | "POST";
  path: string;
  /** Keys to extract from args and substitute into URL path (e.g., {learner}). */
  pathParams?: string[];
  /** Keys to extract from args and pass as query string parameters. */
  queryParams?: string[];
};

const ROUTE_TABLE: Record<string, RouteSpec> = {
  // Health / Status
  qortex_status: { method: "GET", path: "/v1/status" },
  qortex_domains: { method: "GET", path: "/v1/domains" },
  qortex_stats: { method: "GET", path: "/v1/stats" },

  // Query / Feedback
  qortex_query: { method: "POST", path: "/v1/query" },
  qortex_feedback: { method: "POST", path: "/v1/feedback" },

  // Ingest
  qortex_ingest: { method: "POST", path: "/v1/ingest" },
  qortex_ingest_text: { method: "POST", path: "/v1/ingest/text" },
  qortex_ingest_structured: { method: "POST", path: "/v1/ingest/structured" },
  qortex_ingest_message: { method: "POST", path: "/v1/ingest/message" },

  // Explore / Rules
  qortex_explore: { method: "POST", path: "/v1/explore" },
  qortex_rules: { method: "POST", path: "/v1/rules" },

  // Learning
  qortex_learning_select: { method: "POST", path: "/v1/learning/select" },
  qortex_learning_observe: { method: "POST", path: "/v1/learning/observe" },
  qortex_learning_posteriors: {
    method: "GET",
    path: "/v1/learning/{learner}/posteriors",
    pathParams: ["learner"],
  },
  qortex_learning_metrics: {
    method: "GET",
    path: "/v1/learning/{learner}/metrics",
    pathParams: ["learner"],
    queryParams: ["window"],
  },
  qortex_learning_reset: { method: "POST", path: "/v1/learning/reset" },
  qortex_learning_session_start: { method: "POST", path: "/v1/learning/sessions/start" },
  qortex_learning_session_end: { method: "POST", path: "/v1/learning/sessions/end" },
};

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * Plain HTTP REST client for a remote qortex server.
 *
 * Lifecycle: create → init() → callTool() / isConnected → close()
 *
 * Intended as a singleton per agent runtime (gateway or CLI run).
 */
export class QortexRestConnection implements QortexConnection {
  private connected = false;

  constructor(
    private readonly baseUrl: string,
    private readonly headers?: Record<string, string>,
  ) {}

  /** Verify the remote qortex server is reachable (GET /v1/health). */
  async init(): Promise<void> {
    if (this.connected) return;

    const url = new URL("/v1/health", this.baseUrl);
    const res = await fetch(url, {
      method: "GET",
      headers: this.headers,
      signal: AbortSignal.timeout(INIT_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`qortex health check failed: HTTP ${res.status} ${res.statusText}`);
    }

    this.connected = true;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Call a qortex operation by its MCP tool name.
   *
   * Internally routes to the corresponding REST endpoint so all existing
   * consumers (online-ingest, learning client, memory provider) work unchanged.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    opts?: { timeout?: number },
  ): Promise<unknown> {
    if (!this.connected) {
      throw new Error("QortexRestConnection not connected. Call init() first.");
    }

    const route = ROUTE_TABLE[name];
    if (!route) {
      throw new Error(`Unknown qortex tool: ${name}`);
    }

    const timeout = opts?.timeout ?? DEFAULT_TOOL_TIMEOUT_MS;
    const { url, body } = this.buildRequest(route, args);

    const fetchOpts: RequestInit = {
      method: route.method,
      headers: {
        ...this.headers,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(timeout),
    };
    if (body !== undefined) {
      fetchOpts.body = JSON.stringify(body);
    }

    const res = await fetch(url, fetchOpts);
    const json = await res.json();

    if (!res.ok) {
      const errMsg = (json as { error?: string }).error ?? `HTTP ${res.status}`;
      throw new Error(`qortex ${name} failed: ${errMsg}`);
    }

    return json;
  }

  async close(): Promise<void> {
    this.connected = false;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Build the fetch URL and body from route spec + tool args.
   *
   * - Path params (e.g., {learner}) are substituted into the URL path.
   * - Query params are appended to the URL search string.
   * - Remaining args become the JSON body (for POST) or are ignored (for GET).
   */
  private buildRequest(
    route: RouteSpec,
    args: Record<string, unknown>,
  ): { url: URL; body: Record<string, unknown> | undefined } {
    // Clone args so we don't mutate the caller's object
    const remaining = { ...args };

    // Substitute path params
    let resolvedPath = route.path;
    if (route.pathParams) {
      for (const key of route.pathParams) {
        const value = remaining[key];
        if (value === undefined || value === null) {
          throw new Error(`Missing required path param '${key}' for ${route.path}`);
        }
        resolvedPath = resolvedPath.replace(`{${key}}`, encodeURIComponent(String(value)));
        delete remaining[key];
      }
    }

    const url = new URL(resolvedPath, this.baseUrl);

    // Append query params
    if (route.queryParams) {
      for (const key of route.queryParams) {
        const value = remaining[key];
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
        delete remaining[key];
      }
    }

    // Body: POST sends remaining args, GET has no body
    const body = route.method === "POST" ? remaining : undefined;

    return { url, body };
  }
}
