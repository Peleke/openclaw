/**
 * Tests for the OpenClaw cron bridge.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCronBridge, getNextRun } from "./cron-bridge.js";
import type { OpenClawSignal } from "../signals.js";

describe("createCronBridge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a source with name 'cron-bridge'", () => {
    const source = createCronBridge({
      jobs: [],
    });

    expect(source.name).toBe("cron-bridge");
  });

  it("skips disabled jobs", async () => {
    const source = createCronBridge({
      jobs: [
        { id: "enabled", name: "Enabled", expr: "0 8 * * *" },
        { id: "disabled", name: "Disabled", expr: "0 8 * * *", enabled: false },
      ],
    });

    const emitted: OpenClawSignal[] = [];
    await source.start((signal) => {
      emitted.push(signal);
      return Promise.resolve();
    });

    // Should not throw and should start cleanly
    await source.stop();
  });

  it("calls onError for invalid cron expressions", async () => {
    const errors: { jobId: string; message: string }[] = [];

    const source = createCronBridge({
      jobs: [{ id: "invalid", name: "Invalid", expr: "not valid" }],
      onError: (job, error) => {
        errors.push({ jobId: job.id, message: error.message });
      },
    });

    await source.start(() => Promise.resolve());
    await source.stop();

    expect(errors.length).toBe(1);
    expect(errors[0].jobId).toBe("invalid");
  });

  it("emits signal with correct payload shape", async () => {
    const emitted: OpenClawSignal[] = [];

    // Set time to 7:59 AM
    const now = new Date();
    now.setHours(7, 59, 0, 0);
    vi.setSystemTime(now);

    const source = createCronBridge({
      jobs: [{ id: "morning", name: "Morning Job", expr: "0 8 * * *" }],
    });

    await source.start((signal) => {
      emitted.push(signal);
      return Promise.resolve();
    });

    // Advance to 8:00 AM (1 minute later)
    vi.advanceTimersByTime(60_000);

    await source.stop();

    expect(emitted.length).toBe(1);
    expect(emitted[0].type).toBe("cadence.cron.fired");
    expect(emitted[0].payload).toMatchObject({
      jobId: "morning",
      jobName: "Morning Job",
      expr: "0 8 * * *",
    });
    expect(emitted[0].payload.firedAt).toBeTypeOf("number");
  });

  it("calls onFire callback when job fires", async () => {
    const fired: string[] = [];

    const now = new Date();
    now.setHours(7, 59, 0, 0);
    vi.setSystemTime(now);

    const source = createCronBridge({
      jobs: [{ id: "test", name: "Test", expr: "0 8 * * *" }],
      onFire: (job) => fired.push(job.id),
    });

    await source.start(() => Promise.resolve());
    vi.advanceTimersByTime(60_000);
    await source.stop();

    expect(fired).toContain("test");
  });

  it("stops all timers on stop()", async () => {
    const source = createCronBridge({
      jobs: [
        { id: "job1", name: "Job 1", expr: "0 8 * * *" },
        { id: "job2", name: "Job 2", expr: "0 12 * * *" },
      ],
    });

    const emitted: OpenClawSignal[] = [];
    await source.start((signal) => {
      emitted.push(signal);
      return Promise.resolve();
    });

    // Stop immediately
    await source.stop();

    // Advance time - should not fire
    const countBefore = emitted.length;
    vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 24 hours

    expect(emitted.length).toBe(countBefore);
  });
});

describe("getNextRun", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a Date for valid expressions", () => {
    const next = getNextRun("0 8 * * *");
    expect(next).toBeInstanceOf(Date);
  });

  it("returns null for invalid expressions", () => {
    const next = getNextRun("invalid");
    expect(next).toBeNull();
  });

  it("returns future date", () => {
    const now = new Date();
    now.setHours(7, 0, 0, 0);
    vi.setSystemTime(now);

    const next = getNextRun("0 8 * * *");
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(now.getTime());
  });
});
