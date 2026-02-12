import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildCandidates,
  selectViaQortex,
  observeRunOutcomes,
  type SkillEntry,
  type ContextFile,
} from "./qortex-adapter.js";
import type { QortexLearningClient, QortexSelectResult } from "./qortex-client.js";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { LearningConfig, SelectionResult } from "./types.js";

function makeTool(name: string): AgentTool {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: "object" as const, properties: {} },
  };
}

function mockClient(overrides?: Partial<QortexLearningClient>): QortexLearningClient {
  return {
    isAvailable: true,
    select: vi.fn(async () => ({
      selected_arms: [],
      excluded_arms: [],
      is_baseline: false,
      scores: {},
      token_budget: 8000,
      used_tokens: 0,
    })),
    observe: vi.fn(async () => null),
    posteriors: vi.fn(async () => null),
    metrics: vi.fn(async () => null),
    sessionStart: vi.fn(async () => null),
    sessionEnd: vi.fn(async () => null),
    ...overrides,
  } as unknown as QortexLearningClient;
}

describe("buildCandidates()", () => {
  it("builds tool arms with inferred categories", () => {
    const tools = [makeTool("bash"), makeTool("Read"), makeTool("webSearch")];
    const arms = buildCandidates({ tools, skillEntries: [], contextFiles: [] });

    expect(arms).toHaveLength(3);
    expect(arms[0].id).toBe("tool:exec:bash");
    expect(arms[1].id).toBe("tool:fs:Read");
    expect(arms[2].id).toBe("tool:web:webSearch");
  });

  it("builds skill arms", () => {
    const skillEntries: SkillEntry[] = [
      { name: "coding", promptChars: 2000 },
      { name: "testing", promptChars: 1000 },
    ];
    const arms = buildCandidates({ tools: [], skillEntries, contextFiles: [] });

    expect(arms).toHaveLength(2);
    expect(arms[0].id).toBe("skill:coding:main");
    expect(arms[0].token_cost).toBe(Math.ceil(2000 / 4));
    expect(arms[1].id).toBe("skill:testing:main");
  });

  it("builds file arms", () => {
    const contextFiles: ContextFile[] = [{ path: "notes.md", content: "hello world" }];
    const arms = buildCandidates({ tools: [], skillEntries: [], contextFiles });

    expect(arms).toHaveLength(1);
    expect(arms[0].id).toBe("file:workspace:notes.md");
    expect(arms[0].token_cost).toBe(Math.ceil(11 / 4)); // "hello world" is 11 chars
  });

  it("builds mixed candidates from all types", () => {
    const arms = buildCandidates({
      tools: [makeTool("bash")],
      skillEntries: [{ name: "coding", promptChars: 400 }],
      contextFiles: [{ path: "foo.md", content: "bar" }],
    });

    expect(arms).toHaveLength(3);
    expect(arms.map((a) => a.id)).toEqual([
      "tool:exec:bash",
      "skill:coding:main",
      "file:workspace:foo.md",
    ]);
  });

  it("returns empty array for no inputs", () => {
    const arms = buildCandidates({ tools: [], skillEntries: [], contextFiles: [] });
    expect(arms).toEqual([]);
  });

  it("assigns tool category 'other' for unrecognized tool names", () => {
    const arms = buildCandidates({
      tools: [makeTool("CustomTool")],
      skillEntries: [],
      contextFiles: [],
    });
    expect(arms[0].id).toBe("tool:other:CustomTool");
  });

  it("assigns 'messaging' category for send/reply/message tools", () => {
    const arms = buildCandidates({
      tools: [makeTool("sendMessage"), makeTool("replyUser")],
      skillEntries: [],
      contextFiles: [],
    });
    expect(arms[0].id).toBe("tool:messaging:sendMessage");
    expect(arms[1].id).toBe("tool:messaging:replyUser");
  });

  it("assigns 'memory' category for memory tools", () => {
    const arms = buildCandidates({
      tools: [makeTool("memoryStore"), makeTool("recallContext")],
      skillEntries: [],
      contextFiles: [],
    });
    expect(arms[0].id).toBe("tool:memory:memoryStore");
    expect(arms[1].id).toBe("tool:memory:recallContext");
  });

  it("includes metadata on arms", () => {
    const arms = buildCandidates({ tools: [makeTool("bash")], skillEntries: [], contextFiles: [] });
    expect(arms[0].metadata).toEqual({
      type: "tool",
      category: "exec",
      label: "bash",
    });
  });
});

describe("selectViaQortex()", () => {
  const baseConfig: LearningConfig = {
    enabled: true,
    phase: "active",
    tokenBudget: 8000,
  };

  it("calls client.select with correct token_budget and context", async () => {
    const selectFn = vi.fn(async () => ({
      selected_arms: ["tool:exec:bash"],
      excluded_arms: [],
      is_baseline: false,
      scores: { "tool:exec:bash": 0.8 },
      token_budget: 8000,
      used_tokens: 100,
    }));
    const client = mockClient({ select: selectFn });

    await selectViaQortex({
      client,
      config: baseConfig,
      tools: [makeTool("bash")],
      skillEntries: [],
      contextFiles: [],
      context: { channel: "telegram", model: "gpt-4" },
    });

    expect(selectFn).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "tool:exec:bash" })]),
      expect.objectContaining({
        token_budget: 8000,
        context: expect.objectContaining({
          channel: "telegram",
          model: "gpt-4",
          phase: "active",
        }),
      }),
    );
  });

  it("maps qortex selection back to domain types", async () => {
    const client = mockClient({
      select: vi.fn(async () => ({
        selected_arms: ["tool:exec:bash", "skill:coding:main"],
        excluded_arms: ["file:workspace:notes.md"],
        is_baseline: false,
        scores: {},
        token_budget: 8000,
        used_tokens: 500,
      })),
    });

    const result = await selectViaQortex({
      client,
      config: baseConfig,
      tools: [makeTool("bash"), makeTool("Read")],
      skillEntries: [{ name: "coding", promptChars: 400 }],
      contextFiles: [{ path: "notes.md", content: "stuff" }],
      context: {},
    });

    expect(result.selectedTools.map((t) => t.name)).toEqual(["bash"]);
    expect(result.selectedSkillNames).toEqual(["coding"]);
    expect(result.selectedFilePaths).toEqual([]);
    expect(result.selection.selectedArms).toEqual(["tool:exec:bash", "skill:coding:main"]);
    expect(result.selection.excludedArms).toEqual(["file:workspace:notes.md"]);
    expect(result.selection.isBaseline).toBe(false);
  });

  it("includes all components when qortex returns null (degraded mode)", async () => {
    const client = mockClient({
      select: vi.fn(async () => null as unknown as QortexSelectResult),
    });

    const result = await selectViaQortex({
      client,
      config: baseConfig,
      tools: [makeTool("bash")],
      skillEntries: [{ name: "coding", promptChars: 400 }],
      contextFiles: [{ path: "notes.md", content: "data" }],
      context: {},
    });

    expect(result.selectedTools).toHaveLength(1);
    expect(result.selectedSkillNames).toEqual(["coding"]);
    expect(result.selectedFilePaths).toEqual(["notes.md"]);
    expect(result.selection.isBaseline).toBe(true);
  });

  it("passes phase from config into qortex context", async () => {
    const selectFn = vi.fn(async () => ({
      selected_arms: [],
      excluded_arms: [],
      is_baseline: true,
      scores: {},
      token_budget: 4000,
      used_tokens: 0,
    }));
    const client = mockClient({ select: selectFn });

    await selectViaQortex({
      client,
      config: { ...baseConfig, phase: "passive", tokenBudget: 4000 },
      tools: [],
      skillEntries: [],
      contextFiles: [],
      context: { sessionKey: "abc" },
    });

    expect(selectFn).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        token_budget: 4000,
        context: expect.objectContaining({
          phase: "passive",
          session_key: "abc",
        }),
      }),
    );
  });

  it("uses default token budget of 8000", async () => {
    const selectFn = vi.fn(async () => ({
      selected_arms: [],
      excluded_arms: [],
      is_baseline: true,
      scores: {},
      token_budget: 8000,
      used_tokens: 0,
    }));
    const client = mockClient({ select: selectFn });

    await selectViaQortex({
      client,
      config: { enabled: true },
      tools: [],
      skillEntries: [],
      contextFiles: [],
      context: {},
    });

    expect(selectFn).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ token_budget: 8000 }),
    );
  });
});

describe("observeRunOutcomes()", () => {
  const baseConfig: LearningConfig = {
    enabled: true,
    phase: "active",
  };

  it("reports 'accepted' for referenced arms, 'rejected' for unreferenced", async () => {
    const observeFn = vi.fn(async () => null);
    const client = mockClient({ observe: observeFn });

    const selection: SelectionResult = {
      selectedArms: ["tool:exec:bash", "tool:fs:Read"],
      excludedArms: [],
      isBaseline: false,
      totalTokenBudget: 8000,
      usedTokens: 200,
    };

    await observeRunOutcomes({
      client,
      config: baseConfig,
      selection,
      assistantTexts: ["I used bash to run the command"],
      toolMetas: [{ toolName: "bash" }],
    });

    // bash was referenced (appears in toolMetas), Read was not
    expect(observeFn).toHaveBeenCalledTimes(2);
    expect(observeFn).toHaveBeenCalledWith(
      "tool:exec:bash",
      "accepted",
      expect.objectContaining({ reward: 1.0 }),
    );
    expect(observeFn).toHaveBeenCalledWith(
      "tool:fs:Read",
      "rejected",
      expect.objectContaining({ reward: 0.0 }),
    );
  });

  it("does nothing in passive phase", async () => {
    const observeFn = vi.fn(async () => null);
    const client = mockClient({ observe: observeFn });

    await observeRunOutcomes({
      client,
      config: { ...baseConfig, phase: "passive" },
      selection: {
        selectedArms: ["tool:exec:bash"],
        excludedArms: [],
        isBaseline: false,
        totalTokenBudget: 8000,
        usedTokens: 100,
      },
      assistantTexts: [],
      toolMetas: [{ toolName: "bash" }],
    });

    expect(observeFn).not.toHaveBeenCalled();
  });

  it("passes phase in context to qortex", async () => {
    const observeFn = vi.fn(async () => null);
    const client = mockClient({ observe: observeFn });

    await observeRunOutcomes({
      client,
      config: baseConfig,
      selection: {
        selectedArms: ["tool:exec:bash"],
        excludedArms: [],
        isBaseline: false,
        totalTokenBudget: 8000,
        usedTokens: 100,
      },
      assistantTexts: [],
      toolMetas: [{ toolName: "bash" }],
    });

    expect(observeFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        context: expect.objectContaining({ phase: "active" }),
      }),
    );
  });

  it("handles empty selectedArms gracefully", async () => {
    const observeFn = vi.fn(async () => null);
    const client = mockClient({ observe: observeFn });

    await observeRunOutcomes({
      client,
      config: baseConfig,
      selection: {
        selectedArms: [],
        excludedArms: [],
        isBaseline: true,
        totalTokenBudget: 8000,
        usedTokens: 0,
      },
      assistantTexts: ["hello"],
      toolMetas: [],
    });

    expect(observeFn).not.toHaveBeenCalled();
  });

  it("swallows errors from individual observe calls", async () => {
    const observeFn = vi
      .fn()
      .mockResolvedValueOnce(null) // first arm succeeds
      .mockRejectedValueOnce(new Error("timeout")); // second arm fails
    const client = mockClient({ observe: observeFn });

    // Should not throw
    await observeRunOutcomes({
      client,
      config: baseConfig,
      selection: {
        selectedArms: ["tool:exec:bash", "tool:fs:Read"],
        excludedArms: [],
        isBaseline: false,
        totalTokenBudget: 8000,
        usedTokens: 200,
      },
      assistantTexts: [],
      toolMetas: [],
    });

    expect(observeFn).toHaveBeenCalledTimes(2);
  });

  it("observes skill arms correctly", async () => {
    const observeFn = vi.fn(async () => null);
    const client = mockClient({ observe: observeFn });

    await observeRunOutcomes({
      client,
      config: baseConfig,
      selection: {
        selectedArms: ["skill:coding:main"],
        excludedArms: [],
        isBaseline: false,
        totalTokenBudget: 8000,
        usedTokens: 100,
      },
      assistantTexts: ["I used the coding skill"],
      toolMetas: [],
    });

    // "coding" appears in assistantTexts → referenced
    expect(observeFn).toHaveBeenCalledWith("skill:coding:main", "accepted", expect.any(Object));
  });
});
