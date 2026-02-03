import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { ensureLearningSchema, insertRunTrace, savePosterior } from "./store.js";
import { formatLearningStatus } from "./cli-status.js";
import type { RunTrace } from "./types.js";

let db: DatabaseSync;
let tmpDir: string;

beforeEach(() => {
  const { DatabaseSync: DB } = require("node:sqlite") as typeof import("node:sqlite");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-cli-test-"));
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
    usage: { total: 500 },
    systemPromptChars: 5000,
    aborted: false,
    ...overrides,
  };
}

describe("formatLearningStatus", () => {
  it("shows empty state message for empty DB", () => {
    const output = formatLearningStatus(db);
    expect(output).toContain("No traces recorded yet");
  });

  it("shows summary with trace count", () => {
    insertRunTrace(db, makeTrace());
    savePosterior(db, {
      armId: "tool:exec:bash",
      alpha: 5,
      beta: 1,
      pulls: 5,
      lastUpdated: Date.now(),
    });
    const output = formatLearningStatus(db);
    expect(output).toContain("Learning Layer Status");
    expect(output).toContain("Arm");
    expect(output).toContain("Mean");
    expect(output).toContain("Pulls");
  });

  it("shows top and bottom arms when enough posteriors", () => {
    insertRunTrace(db, makeTrace());
    for (let i = 0; i < 8; i++) {
      savePosterior(db, {
        armId: `tool:cat:arm${i}`,
        alpha: 10 - i,
        beta: i + 1,
        pulls: 10,
        lastUpdated: Date.now(),
      });
    }
    const output = formatLearningStatus(db);
    expect(output).toContain("Top Arms");
    expect(output).toContain("Bottom Arms");
  });
});
