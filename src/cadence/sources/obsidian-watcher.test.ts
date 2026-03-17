import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// Mock chokidar — returns a fake FSWatcher that emits ready on next tick
const mockWatcher = new EventEmitter() as EventEmitter & { close: ReturnType<typeof vi.fn> };
mockWatcher.close = vi.fn().mockResolvedValue(undefined);

vi.mock("chokidar", () => ({
  watch: vi.fn(() => {
    queueMicrotask(() => mockWatcher.emit("ready"));
    return mockWatcher;
  }),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { createObsidianWatcherSource } from "./obsidian-watcher.js";

const mockReadFile = readFile as ReturnType<typeof vi.fn>;

describe("createObsidianWatcherSource", () => {
  let emitFn: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWatcher.removeAllListeners();
    mockWatcher.close.mockResolvedValue(undefined);
    emitFn = vi.fn().mockResolvedValue(undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("catches EACCES errors without crashing", async () => {
    const source = createObsidianWatcherSource({ vaultPath: "/fake/vault" });
    await source.start(emitFn);

    const err = Object.assign(new Error("EACCES: permission denied, watch '/fake/vault/root-owned.md'"), {
      code: "EACCES",
      path: "/fake/vault/root-owned.md",
    });
    mockWatcher.emit("error", err);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/EACCES/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/root-owned\.md/);

    await source.stop();
  });

  it("catches ESTALE errors without crashing", async () => {
    const source = createObsidianWatcherSource({ vaultPath: "/fake/vault" });
    await source.start(emitFn);

    const err = Object.assign(new Error("ESTALE: stale file handle"), {
      code: "ESTALE",
      errno: -116,
      path: "/fake/vault/stale.md",
    });
    mockWatcher.emit("error", err);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/ESTALE/);

    await source.stop();
  });

  it("handles errors without code or path gracefully", async () => {
    const source = createObsidianWatcherSource({ vaultPath: "/fake/vault" });
    await source.start(emitFn);

    mockWatcher.emit("error", new Error("something went wrong"));

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/unknown/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/something went wrong/);

    await source.stop();
  });

  it("continues processing files after an error", async () => {
    mockReadFile.mockResolvedValue("# Test note\nSome content");

    const source = createObsidianWatcherSource({ vaultPath: "/fake/vault", emitTasks: false });
    await source.start(emitFn);

    mockWatcher.emit("error", Object.assign(new Error("EACCES"), { code: "EACCES" }));
    mockWatcher.emit("change", "/fake/vault/note.md");

    await vi.waitFor(() => expect(emitFn).toHaveBeenCalled());

    expect(emitFn).toHaveBeenCalledWith(
      expect.objectContaining({ type: "obsidian.note.modified" }),
    );

    await source.stop();
  });

  it("swallows readFile errors (file deleted between event and read)", async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const source = createObsidianWatcherSource({ vaultPath: "/fake/vault" });
    await source.start(emitFn);

    mockWatcher.emit("change", "/fake/vault/deleted.md");
    await new Promise((r) => setTimeout(r, 50));

    expect(emitFn).not.toHaveBeenCalled();

    await source.stop();
  });

  it("ignores non-markdown files", async () => {
    const source = createObsidianWatcherSource({ vaultPath: "/fake/vault" });
    await source.start(emitFn);

    mockWatcher.emit("change", "/fake/vault/image.png");
    await new Promise((r) => setTimeout(r, 50));

    expect(emitFn).not.toHaveBeenCalled();
    expect(mockReadFile).not.toHaveBeenCalled();

    await source.stop();
  });
});
