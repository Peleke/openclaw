import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSignalBus, type SignalBus } from "@peleke.s/cadence";
import type { OpenClawSignal } from "../../signals.js";
import type { LLMProvider, ChatMessage, ChatResponse } from "../../llm/types.js";
import type {
  GitHubClient,
  GitHubRepo,
  GitHubPR,
  BuildlogEntry,
  FileWriter,
  WatcherClock,
} from "./types.js";
import { createGitHubWatcherResponder } from "./index.js";

// --- Mocks ---

function createMockGhClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    listRepos: vi.fn<[string], Promise<GitHubRepo[]>>().mockResolvedValue([
      {
        name: "openclaw",
        fullName: "Peleke/openclaw",
        archived: false,
        fork: false,
        pushedAt: "2026-02-26T10:00:00Z",
      },
      {
        name: "linwheel",
        fullName: "Peleke/linwheel",
        archived: false,
        fork: false,
        pushedAt: "2026-02-26T08:00:00Z",
      },
    ]),
    getMergedPRsForDate: vi.fn<[string, string], Promise<GitHubPR[]>>().mockResolvedValue([]),
    getOpenPRs: vi.fn<[string, string], Promise<GitHubPR[]>>().mockResolvedValue([]),
    hasBuildlogDir: vi.fn<[string], Promise<boolean>>().mockResolvedValue(false),
    getRecentBuildlogEntries: vi
      .fn<[string, number], Promise<BuildlogEntry[]>>()
      .mockResolvedValue([]),
    ...overrides,
  };
}

function createMockLlm(
  text = "# Today's Engineering Log\n\nWe shipped some great features today across multiple repos. Lots of progress.",
): LLMProvider {
  return {
    name: "mock-llm",
    chat: vi.fn<[ChatMessage[]], Promise<ChatResponse>>().mockResolvedValue({
      text,
      model: "test-model",
    }),
  };
}

function createMockWriter(existsResult = false): FileWriter {
  return {
    exists: vi.fn<[string], Promise<boolean>>().mockResolvedValue(existsResult),
    write: vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined),
  };
}

function createMockClock(date = "2026-02-26"): WatcherClock {
  return { today: () => date };
}

function cronSignal(jobId: string) {
  return {
    type: "cadence.cron.fired" as const,
    id: "test-cron-signal",
    ts: Date.now(),
    payload: {
      jobId,
      jobName: "GitHub Watcher",
      expr: "0 21 * * *",
      firedAt: Date.now(),
    },
  };
}

// --- Tests ---

describe("createGitHubWatcherResponder", () => {
  let bus: SignalBus<OpenClawSignal>;

  beforeEach(() => {
    bus = createSignalBus<OpenClawSignal>();
  });

  it("has correct name and description", () => {
    const responder = createGitHubWatcherResponder({
      llm: createMockLlm(),
      vaultPath: "/vault",
    });
    expect(responder.name).toBe("github-watcher");
    expect(responder.description).toContain("GitHub");
  });

  it("ignores cron signals with non-matching jobId", async () => {
    const ghClient = createMockGhClient();
    const responder = createGitHubWatcherResponder({
      llm: createMockLlm(),
      ghClient,
      vaultPath: "/vault",
    });

    responder.register(bus);
    await bus.emit(cronSignal("nightly-digest"));

    expect(ghClient.listRepos).not.toHaveBeenCalled();
  });

  it("triggers on matching jobId", async () => {
    const ghClient = createMockGhClient();
    const writer = createMockWriter();
    const responder = createGitHubWatcherResponder({
      llm: createMockLlm(),
      ghClient,
      writer,
      clock: createMockClock(),
      vaultPath: "/vault",
    });

    responder.register(bus);
    await bus.emit(cronSignal("github-watcher"));

    expect(ghClient.listRepos).toHaveBeenCalledWith("Peleke");
  });

  it("skips if synthesis file already exists (dedup)", async () => {
    const ghClient = createMockGhClient();
    const writer = createMockWriter(true); // exists returns true
    const responder = createGitHubWatcherResponder({
      llm: createMockLlm(),
      ghClient,
      writer,
      clock: createMockClock(),
      vaultPath: "/vault",
    });

    responder.register(bus);
    await bus.emit(cronSignal("github-watcher"));

    expect(ghClient.listRepos).not.toHaveBeenCalled();
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("excludes configured repos", async () => {
    const ghClient = createMockGhClient();
    const writer = createMockWriter();
    const responder = createGitHubWatcherResponder({
      llm: createMockLlm(),
      ghClient,
      writer,
      clock: createMockClock(),
      vaultPath: "/vault",
      config: { excludeRepos: ["linwheel"] },
    });

    responder.register(bus);
    await bus.emit(cronSignal("github-watcher"));

    // getMergedPRsForDate should only be called for openclaw, not linwheel
    const calls = (ghClient.getMergedPRsForDate as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some((c: string[]) => c[0] === "Peleke/linwheel")).toBe(false);
    expect(calls.some((c: string[]) => c[0] === "Peleke/openclaw")).toBe(true);
  });

  it("skips synthesis when no activity found", async () => {
    const llm = createMockLlm();
    const writer = createMockWriter();
    const responder = createGitHubWatcherResponder({
      llm,
      ghClient: createMockGhClient(), // all repos return empty PRs
      writer,
      clock: createMockClock(),
      vaultPath: "/vault",
    });

    const emitted: OpenClawSignal[] = [];
    bus.on("github.scan.completed", (s) => {
      emitted.push(s);
    });

    responder.register(bus);
    await bus.emit(cronSignal("github-watcher"));

    // Scan signal emitted but no write
    expect(emitted.length).toBe(1);
    expect(llm.chat).not.toHaveBeenCalled();
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("runs full pipeline: scan → synthesize → write", async () => {
    const ghClient = createMockGhClient({
      getMergedPRsForDate: vi.fn().mockImplementation(async (repo: string) => {
        if (repo === "Peleke/openclaw") {
          return [
            {
              number: 70,
              title: "feat: cadence wiring",
              url: "https://github.com/Peleke/openclaw/pull/70",
              body: "Wire cadence into gateway",
              createdAt: "2026-02-26T10:00:00Z",
              mergedAt: "2026-02-26T15:00:00Z",
            },
          ];
        }
        return [];
      }),
    });

    const llm = createMockLlm(
      "# Engineering Log\n\nToday I shipped cadence wiring (PR #70) in openclaw. This connects the signal bus to the gateway for ambient content processing.",
    );
    const writer = createMockWriter();
    const clock = createMockClock("2026-02-26");

    const responder = createGitHubWatcherResponder({
      llm,
      ghClient,
      writer,
      clock,
      vaultPath: "/vault",
    });

    const scanSignals: OpenClawSignal[] = [];
    const synthSignals: OpenClawSignal[] = [];
    bus.on("github.scan.completed", (s) => {
      scanSignals.push(s);
    });
    bus.on("github.synthesis.written", (s) => {
      synthSignals.push(s);
    });

    responder.register(bus);
    await bus.emit(cronSignal("github-watcher"));

    // Scan signal
    expect(scanSignals.length).toBe(1);
    expect(scanSignals[0].payload.reposScanned).toBe(2);
    expect(scanSignals[0].payload.reposWithActivity).toBe(1);

    // LLM called
    expect(llm.chat).toHaveBeenCalledOnce();

    // File written with ::linkedin prefix
    expect(writer.write).toHaveBeenCalledOnce();
    const [writePath, writeContent] = (writer.write as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(writePath).toContain("2026-02-26-github-synthesis.md");
    expect(writePath).toContain("Buildlog");
    expect(writeContent).toMatch(/^::linkedin\n\n/);

    // Synthesis signal
    expect(synthSignals.length).toBe(1);
    expect(synthSignals[0].payload.linkedinReady).toBe(true);
    expect(synthSignals[0].payload.reposIncluded).toBe(1);
    expect(synthSignals[0].payload.totalPRs).toBe(1);
  });

  it("emits error signal on total failure", async () => {
    const ghClient = createMockGhClient({
      listRepos: vi.fn().mockRejectedValue(new Error("API rate limit")),
    });
    const writer = createMockWriter();

    const responder = createGitHubWatcherResponder({
      llm: createMockLlm(),
      ghClient,
      writer,
      clock: createMockClock(),
      vaultPath: "/vault",
    });

    const synthSignals: OpenClawSignal[] = [];
    bus.on("github.synthesis.written", (s) => {
      synthSignals.push(s);
    });

    responder.register(bus);
    await bus.emit(cronSignal("github-watcher"));

    expect(synthSignals.length).toBe(1);
    expect(synthSignals[0].payload.error).toContain("API rate limit");
    expect(synthSignals[0].payload.linkedinReady).toBe(false);
  });

  it("handles per-repo errors gracefully", async () => {
    const ghClient = createMockGhClient({
      getMergedPRsForDate: vi.fn().mockImplementation(async (repo: string) => {
        if (repo === "Peleke/openclaw") {
          throw new Error("timeout");
        }
        return [
          {
            number: 5,
            title: "Fix bug",
            url: "https://github.com/Peleke/linwheel/pull/5",
            body: "",
            createdAt: "2026-02-26T10:00:00Z",
            mergedAt: "2026-02-26T15:00:00Z",
          },
        ];
      }),
    });

    const writer = createMockWriter();
    const llm = createMockLlm(
      "# Engineering Log\n\nFixed a bug in linwheel today. Good progress on the publisher pipeline.",
    );

    const responder = createGitHubWatcherResponder({
      llm,
      ghClient,
      writer,
      clock: createMockClock(),
      vaultPath: "/vault",
    });

    const scanSignals: OpenClawSignal[] = [];
    bus.on("github.scan.completed", (s) => {
      scanSignals.push(s);
    });

    responder.register(bus);
    await bus.emit(cronSignal("github-watcher"));

    // Should still emit scan signal with errors
    expect(scanSignals.length).toBe(1);
    expect(scanSignals[0].payload.errors.length).toBe(1);
    expect(scanSignals[0].payload.errors[0].repo).toBe("Peleke/openclaw");

    // Should still synthesize the successful repo
    expect(llm.chat).toHaveBeenCalled();
    expect(writer.write).toHaveBeenCalled();
  });

  it("emits synthesis signal with error when LLM returns too-short response", async () => {
    const ghClient = createMockGhClient({
      getMergedPRsForDate: vi.fn().mockResolvedValue([
        {
          number: 1,
          title: "PR",
          url: "https://github.com/x/1",
          body: "",
          createdAt: "2026-02-26T10:00:00Z",
          mergedAt: "2026-02-26T15:00:00Z",
        },
      ]),
    });
    const llm = createMockLlm("Too short"); // under 50 chars
    const writer = createMockWriter();

    const responder = createGitHubWatcherResponder({
      llm,
      ghClient,
      writer,
      clock: createMockClock(),
      vaultPath: "/vault",
    });

    const synthSignals: OpenClawSignal[] = [];
    bus.on("github.synthesis.written", (s) => {
      synthSignals.push(s);
    });

    responder.register(bus);
    await bus.emit(cronSignal("github-watcher"));

    expect(writer.write).not.toHaveBeenCalled();
    expect(synthSignals.length).toBe(1);
    expect(synthSignals[0].payload.error).toContain("too short");
    expect(synthSignals[0].payload.linkedinReady).toBe(false);
  });

  it("reads buildlog entries when directory exists", async () => {
    const ghClient = createMockGhClient({
      hasBuildlogDir: vi.fn().mockResolvedValue(true),
      getRecentBuildlogEntries: vi
        .fn()
        .mockResolvedValue([{ name: "2026-02-26.md", content: "Shipped overlay fix" }]),
      getMergedPRsForDate: vi.fn().mockResolvedValue([
        {
          number: 1,
          title: "PR",
          url: "https://github.com/x/1",
          body: "",
          createdAt: "2026-02-26T10:00:00Z",
          mergedAt: "2026-02-26T15:00:00Z",
        },
      ]),
    });

    const llm = createMockLlm(
      "# Engineering Log\n\nShipped overlay fix today. Major progress on the infrastructure.",
    );
    const writer = createMockWriter();

    const responder = createGitHubWatcherResponder({
      llm,
      ghClient,
      writer,
      clock: createMockClock(),
      vaultPath: "/vault",
    });

    responder.register(bus);
    await bus.emit(cronSignal("github-watcher"));

    // LLM prompt should include buildlog content
    const llmCalls = (llm.chat as ReturnType<typeof vi.fn>).mock.calls;
    const userPrompt = llmCalls[0][0][1].content;
    expect(userPrompt).toContain("Shipped overlay fix");
  });

  it("supports custom cronTriggerJobIds", async () => {
    const ghClient = createMockGhClient();
    const responder = createGitHubWatcherResponder({
      llm: createMockLlm(),
      ghClient,
      writer: createMockWriter(),
      clock: createMockClock(),
      vaultPath: "/vault",
      cronTriggerJobIds: ["custom-github-scan"],
    });

    responder.register(bus);

    // Default job ID should NOT trigger
    await bus.emit(cronSignal("github-watcher"));
    expect(ghClient.listRepos).not.toHaveBeenCalled();

    // Custom job ID should trigger
    await bus.emit(cronSignal("custom-github-scan"));
    expect(ghClient.listRepos).toHaveBeenCalled();
  });

  it("cleanup unsubscribes from cron signal", async () => {
    const ghClient = createMockGhClient();
    const responder = createGitHubWatcherResponder({
      llm: createMockLlm(),
      ghClient,
      writer: createMockWriter(),
      clock: createMockClock(),
      vaultPath: "/vault",
    });

    const unsub = responder.register(bus);
    unsub();

    await bus.emit(cronSignal("github-watcher"));
    expect(ghClient.listRepos).not.toHaveBeenCalled();
  });
});
