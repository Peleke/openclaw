import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { ensureLearningSchema, insertRunTrace, savePosterior } from "./store.js";
import { exportLearningData } from "./cli-export.js";
import type { RunTrace } from "./types.js";

let db: DatabaseSync;
let tmpDir: string;

beforeEach(() => {
  const { DatabaseSync: DB } = require("node:sqlite") as typeof import("node:sqlite");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-export-test-"));
  db = new DB(path.join(tmpDir, "test.db"));
  ensureLearningSchema(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeTrace(overrides?: Partial<RunTrace>): RunTrace {
  return {
    traceId: "t1",
    runId: "run-1",
    sessionId: "sess-1",
    timestamp: 1700000000000,
    provider: "anthropic",
    model: "claude-3",
    isBaseline: false,
    context: {},
    arms: [{ armId: "tool:exec:bash", included: true, referenced: true, tokenCost: 100 }],
    usage: { total: 500 },
    systemPromptChars: 5000,
    aborted: false,
    ...overrides,
  };
}

describe("exportLearningData", () => {
  it("exports JSON with traces and posteriors", () => {
    insertRunTrace(db, makeTrace());
    savePosterior(db, { armId: "tool:exec:bash", alpha: 3, beta: 1, pulls: 3, lastUpdated: 1000 });

    const output = exportLearningData(db, { format: "json" });
    const data = JSON.parse(output);
    expect(data.traces).toHaveLength(1);
    expect(data.posteriors).toHaveLength(1);
    expect(data.traces[0].traceId).toBe("t1");
  });

  it("exports JSON with only traces", () => {
    insertRunTrace(db, makeTrace());
    const output = exportLearningData(db, { format: "json", traces: true, posteriors: false });
    const data = JSON.parse(output);
    expect(data.traces).toBeDefined();
    expect(data.posteriors).toBeUndefined();
  });

  it("exports CSV with traces", () => {
    insertRunTrace(db, makeTrace());
    const output = exportLearningData(db, { format: "csv", posteriors: false });
    const lines = output.split("\n");
    expect(lines[0]).toContain("traceId");
    expect(lines[1]).toContain("t1");
  });

  it("exports CSV with posteriors", () => {
    savePosterior(db, { armId: "tool:exec:bash", alpha: 3, beta: 1, pulls: 3, lastUpdated: 1000 });
    const output = exportLearningData(db, { format: "csv", traces: false });
    const lines = output.split("\n");
    expect(lines[0]).toContain("armId");
    expect(lines[1]).toContain("tool:exec:bash");
  });

  it("handles empty DB", () => {
    const jsonOutput = exportLearningData(db, { format: "json" });
    const data = JSON.parse(jsonOutput);
    expect(data.traces).toEqual([]);
    expect(data.posteriors).toEqual([]);

    const csvOutput = exportLearningData(db, { format: "csv" });
    expect(csvOutput).toContain("traceId");
  });
});
