import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRunlistResponder } from "../index.js";
import type { FileReader, RunlistClock } from "../index.js";

// Mock telegram send
vi.mock("../../../../telegram/send.js", () => ({
  sendMessageTelegram: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock logger
vi.mock("../../../../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

const fixturesDir = path.join(import.meta.dirname, "fixtures");

function createMockBus() {
  const handlers = new Map<string, Function[]>();
  return {
    on: vi.fn((type: string, handler: Function) => {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type)!.push(handler);
      return () => {};
    }),
    emit: vi.fn().mockResolvedValue(undefined),
    onAny: vi.fn(),
    // Helper to trigger handlers
    async fire(type: string, payload: Record<string, unknown>) {
      const fns = handlers.get(type) ?? [];
      for (const fn of fns) {
        await fn({
          type,
          id: "test-signal-id",
          ts: Date.now(),
          payload,
        });
      }
    },
  };
}

function createMockFileReader(files: Record<string, string>): FileReader {
  return {
    exists: (p: string) => p in files,
    read: async (p: string) => {
      if (!(p in files)) throw new Error(`File not found: ${p}`);
      return files[p];
    },
  };
}

function createMockClock(date: string): RunlistClock {
  return { today: () => date };
}

describe("createRunlistResponder", () => {
  let sendMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../../../telegram/send.js");
    sendMock = mod.sendMessageTelegram as unknown as ReturnType<typeof vi.fn>;
  });

  it("ignores cron signals with non-matching jobId", async () => {
    const bus = createMockBus();
    const responder = createRunlistResponder({
      vaultPath: "/vault",
      telegramChatId: "123",
      fileReader: createMockFileReader({}),
      clock: createMockClock("2026-03-13"),
    });

    responder.register(bus as any);

    await bus.fire("cadence.cron.fired", {
      jobId: "github-watcher",
      jobName: "GitHub Watcher",
      expr: "0 21 * * *",
      firedAt: Date.now(),
    });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips when no runlist file exists", async () => {
    const bus = createMockBus();
    const responder = createRunlistResponder({
      vaultPath: "/vault",
      telegramChatId: "123",
      fileReader: createMockFileReader({}),
      clock: createMockClock("2026-03-13"),
    });

    responder.register(bus as any);

    await bus.fire("cadence.cron.fired", {
      jobId: "runlist-morning",
      jobName: "Runlist Morning Ping",
      expr: "30 7 * * *",
      firedAt: Date.now(),
    });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends morning ping with correct message", async () => {
    const fullContent = readFileSync(path.join(fixturesDir, "runlist-full.md"), "utf-8");
    const bus = createMockBus();
    const responder = createRunlistResponder({
      vaultPath: "/vault",
      telegramChatId: "test-chat",
      fileReader: createMockFileReader({
        "/vault/Runlist/2026-03-13.md": fullContent,
      }),
      clock: createMockClock("2026-03-13"),
    });

    responder.register(bus as any);

    await bus.fire("cadence.cron.fired", {
      jobId: "runlist-morning",
      jobName: "Runlist Morning Ping",
      expr: "30 7 * * *",
      firedAt: Date.now(),
    });

    expect(sendMock).toHaveBeenCalledOnce();
    const [chatId, message] = sendMock.mock.calls[0];
    expect(chatId).toBe("test-chat");
    expect(message).toContain("Morning.");
    expect(message).toContain("3 Do First");
    expect(message).toContain("LinkedIn outreach");
  });

  it("sends nightly recap with completion info", async () => {
    const partialContent = readFileSync(path.join(fixturesDir, "runlist-partial.md"), "utf-8");
    const bus = createMockBus();
    const responder = createRunlistResponder({
      vaultPath: "/vault",
      telegramChatId: "test-chat",
      fileReader: createMockFileReader({
        "/vault/Runlist/2026-03-13.md": partialContent,
      }),
      clock: createMockClock("2026-03-13"),
    });

    responder.register(bus as any);

    await bus.fire("cadence.cron.fired", {
      jobId: "runlist-nightly",
      jobName: "Runlist Nightly Recap",
      expr: "0 22 * * *",
      firedAt: Date.now(),
    });

    expect(sendMock).toHaveBeenCalledOnce();
    const [, message] = sendMock.mock.calls[0];
    expect(message).toContain("Nightly.");
    expect(message).toContain("done.");
    expect(message).toContain("Unchecked:");
  });

  it("emits runlist.morning.sent signal after sending", async () => {
    const fullContent = readFileSync(path.join(fixturesDir, "runlist-full.md"), "utf-8");
    const bus = createMockBus();
    const responder = createRunlistResponder({
      vaultPath: "/vault",
      telegramChatId: "test-chat",
      fileReader: createMockFileReader({
        "/vault/Runlist/2026-03-13.md": fullContent,
      }),
      clock: createMockClock("2026-03-13"),
    });

    responder.register(bus as any);

    await bus.fire("cadence.cron.fired", {
      jobId: "runlist-morning",
      jobName: "Runlist Morning Ping",
      expr: "30 7 * * *",
      firedAt: Date.now(),
    });

    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "runlist.morning.sent",
        payload: expect.objectContaining({
          date: "2026-03-13",
          focus: "Money",
        }),
      }),
    );
  });

  it("returns unsubscribe function", () => {
    const bus = createMockBus();
    const responder = createRunlistResponder({
      vaultPath: "/vault",
      telegramChatId: "123",
    });

    const unsub = responder.register(bus as any);
    expect(typeof unsub).toBe("function");
  });
});
