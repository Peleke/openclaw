import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { ensureLearningSchema, insertRunTrace, savePosterior } from "./store.js";
import { createLearningApiHandler } from "./api.js";
import type { RunTrace, ArmPosterior } from "./types.js";

let db: DatabaseSync;
let tmpDir: string;

beforeEach(() => {
  const { DatabaseSync: DB } = require("node:sqlite") as typeof import("node:sqlite");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-api-test-"));
  db = new DB(path.join(tmpDir, "test.db"));
  ensureLearningSchema(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeTrace(overrides?: Partial<RunTrace>): RunTrace {
  return {
    traceId: `trace-${Math.random().toString(36).slice(2)}`,
    runId: "run-1",
    sessionId: "sess-1",
    timestamp: Date.now(),
    isBaseline: false,
    context: {},
    arms: [{ armId: "tool:exec:bash", included: true, referenced: true, tokenCost: 100 }],
    usage: { input: 300, output: 200, total: 500 },
    systemPromptChars: 5000,
    aborted: false,
    ...overrides,
  };
}

function mockReqRes(method: string, url: string) {
  const req = {
    method,
    url,
    headers: {},
  } as unknown as IncomingMessage;

  let statusCode = 0;
  let body = "";
  const headers: Record<string, string> = {};
  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(v: number) {
      statusCode = v;
    },
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    end(data?: string) {
      body = data ?? "";
    },
  } as unknown as ServerResponse;

  return { req, res, getStatus: () => statusCode, getBody: () => body, getHeaders: () => headers };
}

describe("learning API handler", () => {
  it("returns false for non-learning URLs", async () => {
    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res } = mockReqRes("GET", "/some/other/path");
    expect(await handler(req, res)).toBe(false);
  });

  it("returns 503 when DB unavailable", async () => {
    const handler = createLearningApiHandler({ getDb: () => null });
    const { req, res, getStatus, getBody } = mockReqRes(
      "GET",
      "/__openclaw__/api/learning/summary",
    );
    expect(await handler(req, res)).toBe(true);
    expect(getStatus()).toBe(503);
  });

  it("GET /summary returns summary", async () => {
    insertRunTrace(db, makeTrace());
    savePosterior(db, {
      armId: "tool:exec:bash",
      alpha: 3,
      beta: 1,
      pulls: 3,
      lastUpdated: Date.now(),
    });

    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/summary");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.traceCount).toBe(1);
    expect(data.armCount).toBe(1);
    expect(data.totalTokens).toBe(500);
  });

  it("GET /posteriors returns sorted posteriors", async () => {
    savePosterior(db, { armId: "a", alpha: 5, beta: 1, pulls: 5, lastUpdated: 1000 });
    savePosterior(db, { armId: "b", alpha: 1, beta: 5, pulls: 5, lastUpdated: 2000 });

    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/posteriors");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data).toHaveLength(2);
    expect(data[0].armId).toBe("a"); // higher mean
    expect(data[0].mean).toBeGreaterThan(data[1].mean);
  });

  it("GET /traces supports pagination", async () => {
    for (let i = 0; i < 5; i++) {
      insertRunTrace(db, makeTrace({ traceId: `t${i}`, timestamp: 1000 + i }));
    }

    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getBody } = mockReqRes(
      "GET",
      "/__openclaw__/api/learning/traces?limit=2&offset=1",
    );
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.total).toBe(5);
    expect(data.traces).toHaveLength(2);
  });

  it("GET /timeseries returns buckets", async () => {
    insertRunTrace(db, makeTrace({ timestamp: 1000000 }));

    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getBody } = mockReqRes(
      "GET",
      "/__openclaw__/api/learning/timeseries?metric=tokens&window=1h",
    );
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.buckets).toBeDefined();
    expect(Array.isArray(data.buckets)).toBe(true);
  });

  it("returns 404 for unknown routes", async () => {
    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getStatus } = mockReqRes("GET", "/__openclaw__/api/learning/unknown");
    await handler(req, res);
    expect(getStatus()).toBe(404);
  });

  it("returns 405 for non-GET methods", async () => {
    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getStatus } = mockReqRes("POST", "/__openclaw__/api/learning/summary");
    await handler(req, res);
    expect(getStatus()).toBe(405);
  });

  it("handles empty DB gracefully", async () => {
    const handler = createLearningApiHandler({ getDb: () => db });
    const { req, res, getBody } = mockReqRes("GET", "/__openclaw__/api/learning/summary");
    await handler(req, res);
    const data = JSON.parse(getBody());
    expect(data.traceCount).toBe(0);
    expect(data.totalTokens).toBe(0);
  });
});
