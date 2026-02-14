import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleLearningCommand } from "./commands-learning.js";
import type { HandleCommandsParams } from "./commands-types.js";

// Mock the gateway HTTP module
vi.mock("../../infra/gateway-http.js", () => ({
  fetchGatewayJson: vi.fn(async () => null),
  postGatewayJson: vi.fn(async () => null),
}));

// Mock the CLI status module
vi.mock("../../learning/cli-status.js", () => ({
  formatLearningStatusFromApi: vi.fn(() => "Status output"),
}));

function makeParams(
  commandBody: string,
  overrides?: Partial<HandleCommandsParams>,
): HandleCommandsParams {
  return {
    ctx: {} as HandleCommandsParams["ctx"],
    cfg: {} as HandleCommandsParams["cfg"],
    command: {
      surface: "telegram",
      channel: "telegram",
      ownerList: [],
      isAuthorizedSender: true,
      rawBodyNormalized: commandBody,
      commandBodyNormalized: commandBody,
    },
    directives: {} as HandleCommandsParams["directives"],
    elevated: { enabled: false, allowed: false, failures: [] },
    sessionKey: "test-session",
    workspaceDir: "/tmp",
    defaultGroupActivation: () => "mention",
    resolvedVerboseLevel: "off",
    resolvedReasoningLevel: "off",
    resolveDefaultThinkingLevel: async () => undefined,
    provider: "anthropic",
    model: "claude-3.5-sonnet",
    contextTokens: 0,
    isGroup: false,
    ...overrides,
  } as HandleCommandsParams;
}

describe("handleLearningCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for non-/learning commands", async () => {
    const result = await handleLearningCommand(makeParams("/status"), true);
    expect(result).toBeNull();
  });

  it("returns null when text commands disabled", async () => {
    const result = await handleLearningCommand(makeParams("/learning status"), false);
    expect(result).toBeNull();
  });

  it("blocks unauthorized senders", async () => {
    const params = makeParams("/learning reset", {
      command: {
        surface: "telegram",
        channel: "telegram",
        ownerList: [],
        isAuthorizedSender: false,
        rawBodyNormalized: "/learning reset",
        commandBodyNormalized: "/learning reset",
      },
    } as Partial<HandleCommandsParams>);
    const result = await handleLearningCommand(params, true);
    expect(result).not.toBeNull();
    expect(result!.shouldContinue).toBe(false);
    expect(result!.reply?.text).toContain("authorized");
  });

  it("handles /learning with no subcommand as status", async () => {
    const result = await handleLearningCommand(makeParams("/learning"), true);
    expect(result).not.toBeNull();
    expect(result!.shouldContinue).toBe(false);
    // Gateway unavailable in test, so falls back to "unavailable" message
    expect(result!.reply?.text).toBeDefined();
  });

  it("handles /learning status", async () => {
    const result = await handleLearningCommand(makeParams("/learning status"), true);
    expect(result).not.toBeNull();
    expect(result!.shouldContinue).toBe(false);
  });

  it("handles /learning reset", async () => {
    const { postGatewayJson } = await import("../../infra/gateway-http.js");
    vi.mocked(postGatewayJson).mockResolvedValueOnce({
      learner: "openclaw",
      reset_count: 5,
    });

    const result = await handleLearningCommand(makeParams("/learning reset"), true);
    expect(result).not.toBeNull();
    expect(result!.reply?.text).toContain("Reset 5 arm(s)");
  });

  it("handles /learning reset failure", async () => {
    const result = await handleLearningCommand(makeParams("/learning reset"), true);
    expect(result).not.toBeNull();
    expect(result!.reply?.text).toContain("failed");
  });

  it("handles /learning reward with arm label", async () => {
    const { postGatewayJson } = await import("../../infra/gateway-http.js");
    vi.mocked(postGatewayJson).mockResolvedValueOnce({
      ok: true,
      arm_id: "tool:web:web_search",
    });

    const result = await handleLearningCommand(makeParams("/learning reward web_search"), true);
    expect(result).not.toBeNull();
    expect(result!.reply?.text).toContain("accepted");
    expect(result!.reply?.text).toContain("tool:web:web_search");
  });

  it("handles /learning reward with explicit rejection", async () => {
    const { postGatewayJson } = await import("../../infra/gateway-http.js");
    vi.mocked(postGatewayJson).mockResolvedValueOnce({
      ok: true,
      arm_id: "tool:web:web_search",
    });

    const result = await handleLearningCommand(makeParams("/learning reward web_search 0"), true);
    expect(result).not.toBeNull();
    expect(result!.reply?.text).toContain("rejected");
  });

  it("requires target for /learning reward", async () => {
    const result = await handleLearningCommand(makeParams("/learning reward"), true);
    expect(result).not.toBeNull();
    expect(result!.reply?.text).toContain("Usage");
  });

  it("returns error for unknown action", async () => {
    const result = await handleLearningCommand(makeParams("/learning foobar"), true);
    expect(result).not.toBeNull();
    expect(result!.reply?.text).toContain("Unknown");
  });
});
