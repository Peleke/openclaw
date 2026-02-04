import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureGreenTrace, captureAndStoreGreenTrace } from "./trace-capture.js";
import { countCarbonTraces, openGreenDb } from "./store.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "green-capture-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("trace-capture", () => {
  describe("captureGreenTrace", () => {
    it("creates trace with carbon calculation", () => {
      const trace = captureGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 1000, output: 500 },
        durationMs: 100,
        provider: "anthropic",
        model: "claude-sonnet-4",
        aborted: false,
        agentDir: tmpDir,
      });

      expect(trace.traceId).toBeTruthy();
      expect(trace.traceId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(trace.runId).toBe("run-1");
      expect(trace.sessionId).toBe("session-1");
      expect(trace.inputTokens).toBe(1000);
      expect(trace.outputTokens).toBe(500);
      expect(trace.cacheReadTokens).toBe(0);
      expect(trace.totalCo2Grams).toBeGreaterThan(0);
      expect(trace.factorConfidence).toBeGreaterThan(0);
      expect(trace.factorSource).toBe("estimated");
    });

    it("handles missing usage", () => {
      const trace = captureGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: undefined,
        durationMs: 100,
        provider: "anthropic",
        model: "claude-sonnet",
        aborted: false,
        agentDir: tmpDir,
      });

      expect(trace.inputTokens).toBe(0);
      expect(trace.outputTokens).toBe(0);
      expect(trace.cacheReadTokens).toBe(0);
      expect(trace.totalCo2Grams).toBe(0);
      expect(trace.waterMl).toBe(0);
    });

    it("handles partial usage", () => {
      const trace = captureGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 1000 }, // Only input tokens
        durationMs: 100,
        provider: "anthropic",
        model: "claude-sonnet",
        aborted: false,
        agentDir: tmpDir,
      });

      expect(trace.inputTokens).toBe(1000);
      expect(trace.outputTokens).toBe(0);
      expect(trace.inputCo2Grams).toBeGreaterThan(0);
      expect(trace.outputCo2Grams).toBe(0);
    });

    it("uses custom grid carbon", () => {
      const trace = captureGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 100 },
        durationMs: 100,
        provider: "anthropic",
        model: "claude-sonnet",
        aborted: false,
        agentDir: tmpDir,
        gridCarbon: 250,
      });

      expect(trace.gridCarbonUsed).toBe(250);
    });

    it("uses default grid carbon when not specified", () => {
      const trace = captureGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 100 },
        durationMs: 100,
        aborted: false,
        agentDir: tmpDir,
      });

      expect(trace.gridCarbonUsed).toBe(400);
    });

    it("captures error state", () => {
      const trace = captureGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 100 },
        durationMs: 100,
        aborted: true,
        error: "Test error",
        agentDir: tmpDir,
      });

      expect(trace.aborted).toBe(true);
      expect(trace.error).toBe("Test error");
    });

    it("captures optional fields", () => {
      const trace = captureGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        sessionKey: "key-123",
        usage: { input: 100 },
        durationMs: 1500,
        channel: "telegram",
        provider: "openai",
        model: "gpt-4o",
        aborted: false,
        agentDir: tmpDir,
      });

      expect(trace.sessionKey).toBe("key-123");
      expect(trace.durationMs).toBe(1500);
      expect(trace.channel).toBe("telegram");
      expect(trace.provider).toBe("openai");
      expect(trace.model).toBe("gpt-4o");
    });

    it("uses fallback factor for unknown provider/model", () => {
      const trace = captureGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 1_000_000 },
        durationMs: 100,
        provider: "unknown",
        model: "unknown",
        aborted: false,
        agentDir: tmpDir,
      });

      // Fallback: 200g per 1M input tokens
      expect(trace.inputCo2Grams).toBe(200);
      expect(trace.factorConfidence).toBe(0.15);
      expect(trace.factorSource).toBe("fallback");
    });

    it("calculates cache read tokens correctly", () => {
      const trace = captureGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 500, output: 200, cacheRead: 1000 },
        durationMs: 100,
        provider: "anthropic",
        model: "claude-sonnet",
        aborted: false,
        agentDir: tmpDir,
      });

      expect(trace.cacheReadTokens).toBe(1000);
      expect(trace.cacheCo2Grams).toBeGreaterThan(0);
    });

    it("sets timestamp to current time", () => {
      const before = Date.now();
      const trace = captureGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 100 },
        durationMs: 100,
        aborted: false,
        agentDir: tmpDir,
      });
      const after = Date.now();

      expect(trace.timestamp).toBeGreaterThanOrEqual(before);
      expect(trace.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("captureAndStoreGreenTrace", () => {
    it("stores trace to database", () => {
      const trace = captureAndStoreGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 1000, output: 500 },
        durationMs: 100,
        provider: "anthropic",
        model: "claude-sonnet",
        aborted: false,
        agentDir: tmpDir,
      });

      expect(trace).not.toBeNull();
      expect(trace!.traceId).toBeTruthy();

      const db = openGreenDb(tmpDir);
      try {
        expect(countCarbonTraces(db)).toBe(1);
      } finally {
        db.close();
      }
    });

    it("returns the created trace", () => {
      const trace = captureAndStoreGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 1000, output: 500 },
        durationMs: 100,
        provider: "anthropic",
        model: "claude-sonnet",
        aborted: false,
        agentDir: tmpDir,
      });

      expect(trace).not.toBeNull();
      expect(trace!.runId).toBe("run-1");
      expect(trace!.sessionId).toBe("session-1");
      expect(trace!.inputTokens).toBe(1000);
      expect(trace!.outputTokens).toBe(500);
    });

    it("stores multiple traces", () => {
      captureAndStoreGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 100 },
        durationMs: 50,
        aborted: false,
        agentDir: tmpDir,
      });

      captureAndStoreGreenTrace({
        runId: "run-2",
        sessionId: "session-1",
        usage: { input: 200 },
        durationMs: 100,
        aborted: false,
        agentDir: tmpDir,
      });

      const db = openGreenDb(tmpDir);
      try {
        expect(countCarbonTraces(db)).toBe(2);
      } finally {
        db.close();
      }
    });

    it("returns null on error (swallows)", () => {
      // Pass invalid agentDir to trigger error
      const trace = captureAndStoreGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 100 },
        durationMs: 100,
        aborted: false,
        agentDir: "/nonexistent/path/that/cannot/be/created/due/to/permissions",
      });

      // Should return null, not throw
      expect(trace).toBeNull();
    });

    it("creates green directory if not exists", () => {
      const newDir = path.join(tmpDir, "nested", "agent");
      fs.mkdirSync(newDir, { recursive: true });

      const trace = captureAndStoreGreenTrace({
        runId: "run-1",
        sessionId: "session-1",
        usage: { input: 100 },
        durationMs: 100,
        aborted: false,
        agentDir: newDir,
      });

      expect(trace).not.toBeNull();
      expect(fs.existsSync(path.join(newDir, "green", "green.db"))).toBe(true);
    });
  });
});
