/**
 * Green layer JSON API handler for the gateway HTTP chain.
 * Prefix: /__openclaw__/api/green/
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import type { GreenConfig } from "./types.js";
import {
  getCarbonSummary,
  listCarbonTraces,
  getProviderBreakdown,
  getCarbonTimeseries,
} from "./store.js";
import { calculateEquivalents, formatConfidence } from "./carbon-calculator.js";
import { DEFAULT_CARBON_FACTORS, FALLBACK_CARBON_FACTOR, resolveGreenConfig } from "./config.js";

const PREFIX = "/__openclaw__/api/green/";

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
  "7d": 604_800_000,
};

export function createGreenApiHandler(opts: {
  getDb: () => DatabaseSync | null;
  getConfig?: () => GreenConfig | null;
}): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const { getDb, getConfig } = opts;

  return async (req, res) => {
    const url = parseUrl(req);
    if (!url || !url.pathname.startsWith(PREFIX)) return false;

    const db = getDb();
    if (!db) {
      sendJson(res, 503, { error: "Green DB not available" });
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
      const summary = getCarbonSummary(db);
      const equivalents = calculateEquivalents(summary.totalCo2Grams);
      const providers = getProviderBreakdown(db);
      const confidence = formatConfidence(summary.avgConfidence);

      sendJson(res, 200, {
        ...summary,
        equivalents,
        providers,
        confidence,
      });
      return true;
    }

    if (route === "config") {
      const config = getConfig?.() ?? null;
      const resolved = resolveGreenConfig(config ?? undefined);
      sendJson(res, 200, resolved);
      return true;
    }

    if (route === "factors") {
      sendJson(res, 200, {
        factors: DEFAULT_CARBON_FACTORS,
        fallback: FALLBACK_CARBON_FACTOR,
      });
      return true;
    }

    if (route === "traces") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 1000);
      const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
      sendJson(res, 200, listCarbonTraces(db, { limit, offset }));
      return true;
    }

    if (route === "timeseries") {
      const windowKey = url.searchParams.get("window") ?? "1d";
      const windowMs = WINDOW_MAP[windowKey] ?? 86_400_000;
      sendJson(res, 200, { buckets: getCarbonTimeseries(db, windowMs) });
      return true;
    }

    sendJson(res, 404, { error: "Unknown green API route" });
    return true;
  };
}
