/**
 * Learning layer JSON API handler for the gateway HTTP chain.
 * Prefix: /__openclaw__/api/learning/
 *
 * Sources data from qortex learning MCP tools instead of local SQLite.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { LearningConfig } from "./types.js";
import type { QortexLearningClient } from "./qortex-client.js";

const PREFIX = "/__openclaw__/api/learning/";

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", process.env.OPENCLAW_CORS_ORIGIN ?? "*");
  res.end(JSON.stringify(body));
}

function parseUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url ?? "/", "http://localhost");
  } catch {
    return null;
  }
}

export function createLearningApiHandler(opts: {
  getClient: () => QortexLearningClient | null;
  getConfig?: () => LearningConfig | null;
}): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const { getClient, getConfig } = opts;

  return async (req, res) => {
    const url = parseUrl(req);
    if (!url || !url.pathname.startsWith(PREFIX)) return false;

    const route = url.pathname.slice(PREFIX.length).replace(/\/+$/, "");

    // Dashboard serves HTML on-the-fly — no qortex needed.
    if (route === "dashboard") {
      if (req.method !== "GET") {
        res.statusCode = 405;
        res.setHeader("Allow", "GET");
        res.end("Method Not Allowed");
        return true;
      }
      const { generateLearningDashboardHtml } = await import("./dashboard-html.js");
      const html = generateLearningDashboardHtml({ apiBase: "/__openclaw__/api/learning" });
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(html);
      return true;
    }

    const client = getClient();
    if (!client || !client.isAvailable) {
      sendJson(res, 503, { error: "Learning backend (qortex) not available" });
      return true;
    }

    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      res.end("Method Not Allowed");
      return true;
    }

    if (route === "summary" || route === "metrics") {
      const metrics = await client.metrics();
      if (!metrics) {
        sendJson(res, 503, { error: "Failed to fetch metrics from qortex" });
        return true;
      }
      // Map qortex metrics to dashboard-compatible shape
      sendJson(res, 200, {
        traceCount: metrics.total_pulls,
        armCount: metrics.arm_count,
        totalTokens: 0,
        accuracy: metrics.accuracy,
        exploreRatio: metrics.explore_ratio,
        totalReward: metrics.total_reward,
        minTimestamp: null,
        maxTimestamp: null,
        baseline: {
          baselineRuns: 0,
          selectedRuns: metrics.total_pulls,
          baselineAvgTokens: null,
          selectedAvgTokens: null,
          tokenSavingsPercent: null,
          baselineAvgDuration: null,
          selectedAvgDuration: null,
        },
      });
      return true;
    }

    if (route === "config") {
      const config = getConfig?.() ?? null;
      sendJson(res, 200, {
        enabled: config?.enabled ?? false,
        phase: config?.phase ?? "passive",
        tokenBudget: config?.tokenBudget ?? 8000,
        baselineRate: config?.baselineRate ?? 0.1,
        minPulls: config?.minPulls ?? 5,
        backend: "qortex",
      });
      return true;
    }

    if (route === "posteriors") {
      const result = await client.posteriors();
      if (!result) {
        sendJson(res, 503, { error: "Failed to fetch posteriors from qortex" });
        return true;
      }
      // Convert qortex posteriors map to dashboard-expected array
      const minPulls = getConfig?.()?.minPulls ?? 5;
      const arr = Object.entries(result.posteriors)
        .map(([armId, state]) => ({
          armId,
          alpha: state.alpha,
          beta: state.beta,
          mean: state.mean,
          pulls: state.pulls,
          lastUpdated: state.last_updated,
          confidence: state.pulls < 5 ? "low" : state.pulls < 20 ? "medium" : "high",
          isSeed: false,
          isUnderexplored: state.pulls < minPulls,
        }))
        .sort((a, b) => b.mean - a.mean);
      sendJson(res, 200, arr);
      return true;
    }

    if (route === "traces") {
      // Time-series data not yet available from qortex MCP — return placeholder
      sendJson(res, 200, {
        traces: [],
        total: 0,
        note: "Traces sourced from qortex observability layer",
      });
      return true;
    }

    if (route === "timeseries") {
      // Time-series not yet available from qortex MCP — return empty buckets
      sendJson(res, 200, { buckets: [], note: "Awaiting qortex timeseries MCP tool" });
      return true;
    }

    sendJson(res, 404, { error: "Unknown learning API route" });
    return true;
  };
}
