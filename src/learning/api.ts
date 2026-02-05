/**
 * Learning layer JSON API handler for the gateway HTTP chain.
 * Prefix: /__openclaw__/api/learning/
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import type { LearningConfig } from "./types.js";
import {
  getTraceSummary,
  listRunTracesWithOffset,
  loadPosteriors,
  getTokenTimeseries,
  getConvergenceTimeseries,
  getBaselineComparison,
} from "./store.js";
import { betaCredibleInterval } from "./beta.js";
import { SEED_ARM_IDS } from "./strategy.js";

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
  getConfig?: () => LearningConfig | null;
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
      const { generateLearningDashboardHtml } = await import("./dashboard-html.js");
      const html = generateLearningDashboardHtml({ apiBase: "/__openclaw__/api/learning" });
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(html);
      return true;
    }

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

    if (route === "summary") {
      const summary = getTraceSummary(db);
      const baseline = getBaselineComparison(db);
      sendJson(res, 200, {
        ...summary,
        baseline,
      });
      return true;
    }

    if (route === "config") {
      const config = getConfig?.() ?? null;
      sendJson(res, 200, {
        enabled: config?.enabled ?? false,
        phase: config?.phase ?? "passive",
        strategy: config?.strategy ?? "thompson",
        tokenBudget: config?.tokenBudget ?? 8000,
        baselineRate: config?.baselineRate ?? 0.1,
        minPulls: config?.minPulls ?? 5,
        seedArmIds: SEED_ARM_IDS,
      });
      return true;
    }

    if (route === "posteriors") {
      const map = loadPosteriors(db);
      const config = getConfig?.() ?? null;
      const minPulls = config?.minPulls ?? 5;
      const seedSet = new Set(SEED_ARM_IDS);

      const arr = Array.from(map.values())
        .map((p) => {
          const credible = betaCredibleInterval({ alpha: p.alpha, beta: p.beta });
          return {
            armId: p.armId,
            alpha: p.alpha,
            beta: p.beta,
            mean: p.alpha / (p.alpha + p.beta),
            pulls: p.pulls,
            lastUpdated: p.lastUpdated,
            // Thompson context
            isSeed: seedSet.has(p.armId),
            isUnderexplored: p.pulls < minPulls,
            credibleInterval: {
              lower: credible.lower,
              upper: credible.upper,
            },
            confidence: p.pulls < 5 ? "low" : p.pulls < 20 ? "medium" : "high",
          };
        })
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
