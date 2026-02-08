import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createSignalBus } from "@peleke.s/cadence";
import { createFileLogResponder } from "./file-log.js";
import type { OpenClawSignal } from "../signals.js";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";

function makeSignal(): OpenClawSignal {
  return {
    type: "file.changed",
    ts: Date.now(),
    payload: { path: "/vault/note.md", event: "change" },
  };
}

describe("FileLogResponder", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "file-log-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes JSONL line when signal is emitted", async () => {
    const filePath = path.join(tmpDir, "signals.jsonl");
    const bus = createSignalBus<OpenClawSignal>();
    const responder = createFileLogResponder({ filePath });

    const unsub = responder.register(bus);
    const signal = makeSignal();
    await bus.emit(signal);

    // Give async handler time to flush
    await new Promise((r) => setTimeout(r, 50));

    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.type).toBe("file.changed");
    expect(parsed.payload.path).toBe("/vault/note.md");

    unsub();
  });

  it("creates parent directory on first write", async () => {
    const filePath = path.join(tmpDir, "nested", "deep", "signals.jsonl");
    const bus = createSignalBus<OpenClawSignal>();
    const responder = createFileLogResponder({ filePath });

    const unsub = responder.register(bus);
    await bus.emit(makeSignal());
    await new Promise((r) => setTimeout(r, 50));

    const content = await readFile(filePath, "utf-8");
    expect(content.trim()).toBeTruthy();

    unsub();
  });

  it("appends multiple signals as separate lines", async () => {
    const filePath = path.join(tmpDir, "signals.jsonl");
    const bus = createSignalBus<OpenClawSignal>();
    const responder = createFileLogResponder({ filePath });

    const unsub = responder.register(bus);
    await bus.emit(makeSignal());
    await bus.emit(makeSignal());
    await bus.emit(makeSignal());
    await new Promise((r) => setTimeout(r, 50));

    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(JSON.parse(line).type).toBe("file.changed");
    }

    unsub();
  });

  it("unsubscribe stops writing", async () => {
    const filePath = path.join(tmpDir, "signals.jsonl");
    const bus = createSignalBus<OpenClawSignal>();
    const responder = createFileLogResponder({ filePath });

    const unsub = responder.register(bus);
    await bus.emit(makeSignal());
    await new Promise((r) => setTimeout(r, 50));
    unsub();

    await bus.emit(makeSignal());
    await new Promise((r) => setTimeout(r, 50));

    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("has correct name and description", () => {
    const responder = createFileLogResponder({ filePath: "/tmp/test.jsonl" });
    expect(responder.name).toBe("file-log");
    expect(responder.description).toContain("JSONL");
  });
});
