/**
 * Learning layer JSON API handler for the gateway HTTP chain.
 * Prefix: /__openclaw__/api/learning/
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import {
  getTraceSummary,
  listRunTracesWithOffset,
  loadPosteriors,
  getTokenTimeseries,
  getConvergenceTimeseries,
} from "./store.js";

const PREFIX = "/__openclaw__/api/learning/";

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(body));
}

function parseUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url ?? "/", "http://localhost");
  } catch {
    return null;
  }
}

const WINDOW_MAP: Record<string, number> = {
  "1h": 3_600_000,
  "1d": 86_400_000,
};

export function createLearningApiHandler(opts: {
  getDb: () => DatabaseSync | null;
}): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const { getDb } = opts;

  return async (req, res) => {
    const url = parseUrl(req);
    if (!url || !url.pathname.startsWith(PREFIX)) return false;

    const db = getDb();
    if (!db) {
      sendJson(res, 503, { error: "Learning DB not available" });
      return true;
    }

    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      res.end("Method Not Allowed");
      return true;
    }

    const route = url.pathname.slice(PREFIX.length).replace(/\/+$/, "");

    if (route === "summary") {
      sendJson(res, 200, getTraceSummary(db));
      return true;
    }

    if (route === "posteriors") {
      const map = loadPosteriors(db);
      const arr = Array.from(map.values())
        .map((p) => ({
          armId: p.armId,
          alpha: p.alpha,
          beta: p.beta,
          mean: p.alpha / (p.alpha + p.beta),
          pulls: p.pulls,
          lastUpdated: p.lastUpdated,
        }))
        .sort((a, b) => b.mean - a.mean);
      sendJson(res, 200, arr);
      return true;
    }

    if (route === "traces") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 1000);
      const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
      sendJson(res, 200, listRunTracesWithOffset(db, { limit, offset }));
      return true;
    }

    if (route === "timeseries") {
      const metric = url.searchParams.get("metric") ?? "tokens";
      const windowKey = url.searchParams.get("window") ?? "1h";
      const windowMs = WINDOW_MAP[windowKey] ?? 3_600_000;

      if (metric === "convergence") {
        sendJson(res, 200, { buckets: getConvergenceTimeseries(db, windowMs) });
      } else {
        sendJson(res, 200, { buckets: getTokenTimeseries(db, windowMs) });
      }
      return true;
    }

    sendJson(res, 404, { error: "Unknown learning API route" });
    return true;
  };
}
