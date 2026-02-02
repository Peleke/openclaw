import { describe, it, expect } from "vitest";
import type { SessionSystemPromptReport } from "../config/sessions/types.js";
import { extractArms, captureRunTrace } from "./trace-capture.js";

function mockReport(overrides?: Partial<SessionSystemPromptReport>): SessionSystemPromptReport {
  return {
    source: "run",
    generatedAt: Date.now(),
    systemPrompt: { chars: 5000, projectContextChars: 3000, nonProjectContextChars: 2000 },
    tools: {
      listChars: 200,
      schemaChars: 1600,
      entries: [
        { name: "bash", summaryChars: 40, schemaChars: 400 },
        { name: "read_file", summaryChars: 30, schemaChars: 300 },
        { name: "web_search", summaryChars: 35, schemaChars: 350 },
      ],
    },
    skills: {
      promptChars: 800,
      entries: [
        { name: "coding", blockChars: 500 },
        { name: "research", blockChars: 300 },
      ],
    },
    injectedWorkspaceFiles: [
      {
        name: "CLAUDE.md",
        path: "/proj/CLAUDE.md",
        missing: false,
        rawChars: 2000,
        injectedChars: 1800,
        truncated: false,
      },
      {
        name: "missing.md",
        path: "/proj/missing.md",
        missing: true,
        rawChars: 0,
        injectedChars: 0,
        truncated: false,
      },
    ],
    ...overrides,
  };
}

describe("extractArms", () => {
  it("extracts tools, skills, and workspace files", () => {
    const arms = extractArms(mockReport());
    // 3 tools + 2 skills + 1 file (missing.md excluded)
    expect(arms).toHaveLength(6);
  });

  it("assigns tool categories", () => {
    const arms = extractArms(mockReport());
    const bashArm = arms.find((a) => a.label === "bash")!;
    expect(bashArm.id).toBe("tool:exec:bash");
    expect(bashArm.type).toBe("tool");
    expect(bashArm.category).toBe("exec");

    const readArm = arms.find((a) => a.label === "read_file")!;
    expect(readArm.category).toBe("fs");

    const webArm = arms.find((a) => a.label === "web_search")!;
    expect(webArm.category).toBe("web");
  });

  it("calculates token costs from char counts", () => {
    const arms = extractArms(mockReport());
    const bashArm = arms.find((a) => a.label === "bash")!;
    expect(bashArm.tokenCost).toBe(Math.ceil(400 / 4)); // 100

    const codingArm = arms.find((a) => a.label === "coding")!;
    expect(codingArm.tokenCost).toBe(Math.ceil(500 / 4)); // 125

    const fileArm = arms.find((a) => a.label === "CLAUDE.md")!;
    expect(fileArm.tokenCost).toBe(Math.ceil(1800 / 4)); // 450
  });

  it("skips missing workspace files", () => {
    const arms = extractArms(mockReport());
    expect(arms.find((a) => a.label === "missing.md")).toBeUndefined();
  });
});

describe("captureRunTrace", () => {
  it("builds a complete RunTrace from params", () => {
    const report = mockReport();
    const trace = captureRunTrace({
      runId: "run-1",
      sessionId: "sess-1",
      sessionKey: "key-1",
      report,
      assistantTexts: ["I used bash to list files"],
      toolMetas: [{ toolName: "bash", meta: "ls -la" }],
      usage: { input: 500, output: 200, total: 700 },
      durationMs: 1234,
      channel: "telegram",
      provider: "anthropic",
      model: "claude-3",
      isBaseline: true,
      aborted: false,
    });

    expect(trace.traceId).toBeTruthy();
    expect(trace.runId).toBe("run-1");
    expect(trace.arms).toHaveLength(6);
    expect(trace.systemPromptChars).toBe(5000);
    expect(trace.isBaseline).toBe(true);

    // bash was used
    const bashOutcome = trace.arms.find((a) => a.armId === "tool:exec:bash")!;
    expect(bashOutcome.included).toBe(true);
    expect(bashOutcome.referenced).toBe(true);

    // read_file was not used
    const readOutcome = trace.arms.find((a) => a.armId === "tool:fs:read_file")!;
    expect(readOutcome.referenced).toBe(false);
  });

  it("captures context fields", () => {
    const trace = captureRunTrace({
      runId: "run-1",
      sessionId: "sess-1",
      sessionKey: "key-1",
      report: mockReport(),
      assistantTexts: [],
      toolMetas: [],
      durationMs: 100,
      provider: "openai",
      model: "gpt-4",
      isBaseline: false,
      aborted: false,
    });

    expect(trace.context.provider).toBe("openai");
    expect(trace.context.model).toBe("gpt-4");
    expect(trace.context.promptLength).toBe(5000);
  });
});
