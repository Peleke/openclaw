/**
 * HTTP implementation of QortexConnection.
 *
 * Talks to a running `qortex serve` HTTP endpoint instead of spawning
 * a subprocess. Drop-in replacement for QortexMcpConnection — same
 * interface, same error format, same callTool(name, args) contract.
 */

import type { QortexConnection } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_RETRY_MS = 100;
const HEALTH_INTERVAL_MS = 30_000;

export type QortexHttpConnectionConfig = {
  baseUrl: string;
  headers?: Record<string, string>;
  healthIntervalMs?: number;
};

type RouteEntry = {
  method: "GET" | "POST";
  path: string | ((args: Record<string, unknown>) => string);
  buildQuery?: (args: Record<string, unknown>) => Record<string, string>;
  stripBody?: boolean;
};

const TOOL_ROUTE_MAP: Record<string, RouteEntry> = {
  qortex_query: { method: "POST", path: "/v1/query" },
  qortex_feedback: { method: "POST", path: "/v1/feedback" },
  qortex_ingest: { method: "POST", path: "/v1/ingest" },
  qortex_ingest_text: { method: "POST", path: "/v1/ingest/text" },
  qortex_ingest_structured: { method: "POST", path: "/v1/ingest/structured" },
  qortex_ingest_message: { method: "POST", path: "/v1/ingest/message" },
  qortex_learning_select: { method: "POST", path: "/v1/learning/select" },
  qortex_learning_observe: { method: "POST", path: "/v1/learning/observe" },
  qortex_learning_posteriors: {
    method: "GET",
    path: (args) => `/v1/learning/${encodeURIComponent(String(args.learner))}/posteriors`,
    stripBody: true,
  },
  qortex_learning_metrics: {
    method: "GET",
    path: (args) => `/v1/learning/${encodeURIComponent(String(args.learner))}/metrics`,
    buildQuery: (args) =>
      args.window != null ? { window: String(args.window) } : ({} as Record<string, string>),
    stripBody: true,
  },
  qortex_learning_reset: { method: "POST", path: "/v1/learning/reset" },
  qortex_learning_session_start: { method: "POST", path: "/v1/learning/sessions/start" },
  qortex_learning_session_end: { method: "POST", path: "/v1/learning/sessions/end" },
  // Read-only endpoints
  qortex_status: { method: "GET", path: "/v1/status", stripBody: true },
  qortex_domains: { method: "GET", path: "/v1/domains", stripBody: true },
  qortex_explore: { method: "POST", path: "/v1/explore" },
  qortex_rules: { method: "POST", path: "/v1/rules" },
};

export class QortexHttpConnection implements QortexConnection {
  private _connected = false;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly healthIntervalMs: number;

  constructor(config: QortexHttpConnectionConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.headers = { "Content-Type": "application/json", ...config.headers };
    this.healthIntervalMs = config.healthIntervalMs ?? HEALTH_INTERVAL_MS;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  async init(): Promise<void> {
    if (this._connected) return;

    const resp = await fetch(`${this.baseUrl}/v1/health`, {
      method: "GET",
      headers: this.headers,
      signal: AbortSignal.timeout(5_000),
    });

    if (!resp.ok) {
      throw new Error(`qortex health check failed: HTTP ${resp.status} ${resp.statusText}`);
    }

    this._connected = true;

    if (this.healthIntervalMs > 0) {
      this.healthTimer = setInterval(() => void this.healthCheck(), this.healthIntervalMs);
      // Unref so the timer doesn't keep the process alive
      if (typeof this.healthTimer === "object" && "unref" in this.healthTimer) {
        this.healthTimer.unref();
      }
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    opts?: { timeout?: number },
  ): Promise<unknown> {
    const route = TOOL_ROUTE_MAP[name];
    if (!route) {
      throw new Error(`Unknown qortex tool: ${name}`);
    }

    const urlPath = typeof route.path === "function" ? route.path(args) : route.path;
    let url = `${this.baseUrl}${urlPath}`;

    if (route.buildQuery) {
      const params = new URLSearchParams(route.buildQuery(args));
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const timeout = opts?.timeout ?? DEFAULT_TIMEOUT_MS;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const fetchOpts: RequestInit = {
          method: route.method,
          headers: this.headers,
          signal: AbortSignal.timeout(timeout),
        };

        if (route.method === "POST" && !route.stripBody) {
          fetchOpts.body = JSON.stringify(args);
        }

        const resp = await fetch(url, fetchOpts);

        if (resp.ok) {
          const text = await resp.text();
          if (!text) return {};
          try {
            return JSON.parse(text);
          } catch {
            throw new Error(`qortex returned malformed JSON: ${text.slice(0, 200)}`);
          }
        }

        // 4xx — client error, don't retry
        if (resp.status >= 400 && resp.status < 500) {
          let msg: string;
          try {
            const body = await resp.json();
            msg = ((body as Record<string, unknown>).error as string) ?? resp.statusText;
          } catch {
            msg = resp.statusText;
          }
          throw new Error(`qortex tool error: ${msg}`);
        }

        // 5xx — server error, retry (consume body to release socket)
        await resp.text().catch(() => {});
        lastError = new Error(`qortex server error: HTTP ${resp.status} ${resp.statusText}`);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("qortex tool error:")) {
          throw err; // Don't retry 4xx
        }
        if (err instanceof Error && err.message.startsWith("qortex returned malformed")) {
          throw err; // Don't retry parse errors
        }
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      // Exponential backoff before retry
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, BASE_RETRY_MS * Math.pow(4, attempt)));
      }
    }

    throw lastError ?? new Error("qortex tool error: max retries exceeded");
  }

  async close(): Promise<void> {
    this._connected = false;
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private async healthCheck(): Promise<void> {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/health`, {
        method: "GET",
        headers: this.headers,
        signal: AbortSignal.timeout(5_000),
      });
      this._connected = resp.ok;
    } catch {
      this._connected = false;
    }
  }
}
