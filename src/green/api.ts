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
  listCarbonTargets,
  getTargetProgress,
} from "./store.js";
import {
  calculateEquivalents,
  formatConfidence,
  confidenceToUncertainty,
} from "./carbon-calculator.js";
import { DEFAULT_CARBON_FACTORS, FALLBACK_CARBON_FACTOR, resolveGreenConfig } from "./config.js";
import { exportGhgProtocol, exportCdp, exportTcfd, exportIso14064 } from "./exports.js";

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

    const route = url.pathname.slice(PREFIX.length).replace(/\/+$/, "");

    // Dashboard serves HTML on-the-fly — no DB needed, no filesystem writes.
    if (route === "dashboard") {
      if (req.method !== "GET") {
        res.statusCode = 405;
        res.setHeader("Allow", "GET");
        res.end("Method Not Allowed");
        return true;
      }
      const { generateGreenDashboardHtml } = await import("./dashboard-html.js");
      const html = generateGreenDashboardHtml({ apiBase: "/__openclaw__/api/green" });
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(html);
      return true;
    }

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
      const provider = url.searchParams.get("provider") ?? undefined;
      const model = url.searchParams.get("model") ?? undefined;
      const sinceParam = url.searchParams.get("since");
      const since = sinceParam ? Number(sinceParam) : undefined;
      sendJson(res, 200, listCarbonTraces(db, { limit, offset, provider, model, since }));
      return true;
    }

    if (route === "timeseries") {
      const windowKey = url.searchParams.get("window") ?? "1d";
      const windowMs = WINDOW_MAP[windowKey] ?? 86_400_000;
      sendJson(res, 200, { buckets: getCarbonTimeseries(db, windowMs) });
      return true;
    }

    // GET /api/green/intensity - TCFD intensity metrics
    if (route === "intensity") {
      const summary = getCarbonSummary(db);
      const uncertainty = confidenceToUncertainty(summary.avgConfidence);
      sendJson(res, 200, {
        totalTokens: summary.totalTokens,
        totalTraces: summary.traceCount,
        intensityPerMillionTokens: summary.intensityPerMillionTokens,
        intensityPerQuery: summary.intensityPerQuery,
        uncertainty: {
          lower: uncertainty.lower,
          upper: uncertainty.upper,
          percentRange: ((uncertainty.upper - uncertainty.lower) / 2) * 100,
        },
        avgConfidence: summary.avgConfidence,
      });
      return true;
    }

    // GET /api/green/targets - SBTi targets and progress
    if (route === "targets") {
      const targets = listCarbonTargets(db);
      const progress = targets
        .map((t) => getTargetProgress(db, t.targetId))
        .filter((p) => p !== null);
      sendJson(res, 200, { targets, progress });
      return true;
    }

    // GET /api/green/export/ghg-protocol?period=2025-Q1
    if (route === "export/ghg-protocol") {
      const period = url.searchParams.get("period") ?? String(new Date().getFullYear());
      sendJson(res, 200, exportGhgProtocol(db, period));
      return true;
    }

    // GET /api/green/export/cdp?year=2025
    if (route === "export/cdp") {
      const year = parseInt(url.searchParams.get("year") ?? String(new Date().getFullYear()), 10);
      sendJson(res, 200, exportCdp(db, year));
      return true;
    }

    // GET /api/green/export/tcfd?period=2025&baseYear=2024
    if (route === "export/tcfd") {
      const period = url.searchParams.get("period") ?? undefined;
      const baseYearStr = url.searchParams.get("baseYear");
      const baseYear = baseYearStr ? parseInt(baseYearStr, 10) : undefined;
      sendJson(res, 200, exportTcfd(db, { period, baseYear }));
      return true;
    }

    // GET /api/green/export/iso14064?period=2025&baseYear=2024
    if (route === "export/iso14064") {
      const period = url.searchParams.get("period") ?? String(new Date().getFullYear());
      const baseYearStr = url.searchParams.get("baseYear");
      const baseYear = baseYearStr ? parseInt(baseYearStr, 10) : undefined;
      sendJson(res, 200, exportIso14064(db, period, baseYear));
      return true;
    }

    sendJson(res, 404, { error: "Unknown green API route" });
    return true;
  };
}
