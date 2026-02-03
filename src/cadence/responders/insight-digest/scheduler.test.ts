/**
 * Scheduler tests — exhaustive coverage for time-based logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseTimeToMinutes,
  getCurrentMinutesInTimezone,
  isInQuietWindow,
  msUntilQuietEnds,
  createSimpleClock,
  createDigestScheduler,
} from "./scheduler.js";
import type { DigestConfig } from "./types.js";

const baseConfig: DigestConfig = {
  minInsightsToFlush: 5,
  maxHoursBetweenFlushes: 12,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  timezone: "America/New_York",
  cooldownHours: 4,
  storePath: "/tmp/test-digest.jsonl",
  checkIntervalMs: 1000,
};

describe("parseTimeToMinutes", () => {
  it("parses midnight", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
  });

  it("parses noon", () => {
    expect(parseTimeToMinutes("12:00")).toBe(720);
  });

  it("parses 22:00", () => {
    expect(parseTimeToMinutes("22:00")).toBe(22 * 60);
  });

  it("parses 08:00", () => {
    expect(parseTimeToMinutes("08:00")).toBe(8 * 60);
  });

  it("parses 23:59", () => {
    expect(parseTimeToMinutes("23:59")).toBe(23 * 60 + 59);
  });

  it("parses 00:30", () => {
    expect(parseTimeToMinutes("00:30")).toBe(30);
  });

  it("throws on invalid format", () => {
    expect(() => parseTimeToMinutes("25:00")).toThrow("Invalid time format");
    expect(() => parseTimeToMinutes("12:60")).toThrow("Invalid time format");
    expect(() => parseTimeToMinutes("abc")).toThrow("Invalid time format");
    expect(() => parseTimeToMinutes("12")).toThrow("Invalid time format");
    expect(() => parseTimeToMinutes("")).toThrow("Invalid time format");
  });

  it("throws on negative values", () => {
    expect(() => parseTimeToMinutes("-1:00")).toThrow("Invalid time format");
  });
});

describe("getCurrentMinutesInTimezone", () => {
  it("returns minutes in valid timezone", () => {
    // Use a fixed timestamp: 2024-01-15 14:30 UTC
    const ts = Date.UTC(2024, 0, 15, 14, 30, 0);
    const minutes = getCurrentMinutesInTimezone("UTC", ts);
    expect(minutes).toBe(14 * 60 + 30);
  });

  it("handles timezone offset", () => {
    // 14:30 UTC = 09:30 EST (UTC-5)
    const ts = Date.UTC(2024, 0, 15, 14, 30, 0);
    const minutes = getCurrentMinutesInTimezone("America/New_York", ts);
    expect(minutes).toBe(9 * 60 + 30);
  });

  it("falls back to local time on invalid timezone", () => {
    const ts = Date.now();
    // Should not throw, should return some valid number
    const minutes = getCurrentMinutesInTimezone("Invalid/Timezone", ts);
    expect(minutes).toBeGreaterThanOrEqual(0);
    expect(minutes).toBeLessThan(24 * 60);
  });
});

describe("isInQuietWindow", () => {
  describe("Normal window (same day)", () => {
    // 09:00 to 17:00
    const start = 9 * 60;
    const end = 17 * 60;

    it("returns true at start boundary", () => {
      expect(isInQuietWindow(start, start, end)).toBe(true);
    });

    it("returns false at end boundary", () => {
      expect(isInQuietWindow(end, start, end)).toBe(false);
    });

    it("returns true during window", () => {
      expect(isInQuietWindow(12 * 60, start, end)).toBe(true);
    });

    it("returns false before window", () => {
      expect(isInQuietWindow(8 * 60, start, end)).toBe(false);
    });

    it("returns false after window", () => {
      expect(isInQuietWindow(18 * 60, start, end)).toBe(false);
    });
  });

  describe("Wrap-around window (crosses midnight)", () => {
    // 22:00 to 08:00
    const start = 22 * 60;
    const end = 8 * 60;

    it("returns true at start boundary (22:00)", () => {
      expect(isInQuietWindow(start, start, end)).toBe(true);
    });

    it("returns false at end boundary (08:00)", () => {
      expect(isInQuietWindow(end, start, end)).toBe(false);
    });

    it("returns true during evening (23:00)", () => {
      expect(isInQuietWindow(23 * 60, start, end)).toBe(true);
    });

    it("returns true at midnight (00:00)", () => {
      expect(isInQuietWindow(0, start, end)).toBe(true);
    });

    it("returns true during morning (05:00)", () => {
      expect(isInQuietWindow(5 * 60, start, end)).toBe(true);
    });

    it("returns false just before start (21:59)", () => {
      expect(isInQuietWindow(21 * 60 + 59, start, end)).toBe(false);
    });

    it("returns false just after end (08:01)", () => {
      expect(isInQuietWindow(8 * 60 + 1, start, end)).toBe(false);
    });

    it("returns false during day (12:00)", () => {
      expect(isInQuietWindow(12 * 60, start, end)).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("returns false when start === end (disabled)", () => {
      expect(isInQuietWindow(12 * 60, 8 * 60, 8 * 60)).toBe(false);
    });

    it("handles just before midnight (23:59)", () => {
      expect(isInQuietWindow(23 * 60 + 59, 22 * 60, 8 * 60)).toBe(true);
    });

    it("handles just after midnight (00:01)", () => {
      expect(isInQuietWindow(1, 22 * 60, 8 * 60)).toBe(true);
    });
  });
});

describe("msUntilQuietEnds", () => {
  describe("Wrap-around window (22:00-08:00)", () => {
    const start = 22 * 60;
    const end = 8 * 60;

    it("returns 0 when not in quiet hours", () => {
      expect(msUntilQuietEnds(12 * 60, start, end)).toBe(0);
    });

    it("returns correct ms at 22:00", () => {
      // From 22:00 to 08:00 = 10 hours = 600 minutes
      expect(msUntilQuietEnds(22 * 60, start, end)).toBe(600 * 60 * 1000);
    });

    it("returns correct ms at 23:00", () => {
      // From 23:00 to 08:00 = 9 hours = 540 minutes
      expect(msUntilQuietEnds(23 * 60, start, end)).toBe(540 * 60 * 1000);
    });

    it("returns correct ms at midnight", () => {
      // From 00:00 to 08:00 = 8 hours = 480 minutes
      expect(msUntilQuietEnds(0, start, end)).toBe(480 * 60 * 1000);
    });

    it("returns correct ms at 05:00", () => {
      // From 05:00 to 08:00 = 3 hours = 180 minutes
      expect(msUntilQuietEnds(5 * 60, start, end)).toBe(180 * 60 * 1000);
    });

    it("returns correct ms at 07:59", () => {
      // From 07:59 to 08:00 = 1 minute
      expect(msUntilQuietEnds(7 * 60 + 59, start, end)).toBe(1 * 60 * 1000);
    });
  });

  describe("Normal window (09:00-17:00)", () => {
    const start = 9 * 60;
    const end = 17 * 60;

    it("returns correct ms at 09:00", () => {
      // From 09:00 to 17:00 = 8 hours
      expect(msUntilQuietEnds(9 * 60, start, end)).toBe(8 * 60 * 60 * 1000);
    });

    it("returns correct ms at 12:00", () => {
      // From 12:00 to 17:00 = 5 hours
      expect(msUntilQuietEnds(12 * 60, start, end)).toBe(5 * 60 * 60 * 1000);
    });
  });
});

describe("createSimpleClock", () => {
  it("creates clock with config timezone", () => {
    const clock = createSimpleClock(baseConfig);
    expect(clock).toBeDefined();
    expect(typeof clock.isQuietPeriod).toBe("function");
    expect(typeof clock.msUntilNextWindow).toBe("function");
    expect(typeof clock.now).toBe("function");
  });

  it("now() returns current time", () => {
    const clock = createSimpleClock(baseConfig);
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe("createDigestScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates scheduler with default clock", () => {
    const scheduler = createDigestScheduler(baseConfig);
    expect(scheduler).toBeDefined();
    expect(scheduler.clock).toBeDefined();
  });

  it("creates scheduler with custom clock", () => {
    const customClock = {
      isQuietPeriod: () => false,
      msUntilNextWindow: () => 0,
      now: () => Date.now(),
    };
    const scheduler = createDigestScheduler(baseConfig, customClock);
    expect(scheduler.clock).toBe(customClock);
  });

  it("isQuietHours delegates to clock", () => {
    const customClock = {
      isQuietPeriod: vi.fn().mockReturnValue(true),
      msUntilNextWindow: () => 0,
      now: () => Date.now(),
    };
    const scheduler = createDigestScheduler(baseConfig, customClock);

    expect(scheduler.isQuietHours()).toBe(true);
    expect(customClock.isQuietPeriod).toHaveBeenCalled();
  });

  it("msUntilNextWindow delegates to clock", () => {
    const customClock = {
      isQuietPeriod: () => true,
      msUntilNextWindow: vi.fn().mockReturnValue(5000),
      now: () => Date.now(),
    };
    const scheduler = createDigestScheduler(baseConfig, customClock);

    expect(scheduler.msUntilNextWindow()).toBe(5000);
    expect(customClock.msUntilNextWindow).toHaveBeenCalled();
  });

  describe("scheduleCheck", () => {
    it("calls callback after interval", async () => {
      const scheduler = createDigestScheduler(baseConfig);
      const callback = vi.fn().mockResolvedValue(undefined);

      const unsub = scheduler.scheduleCheck(callback);

      expect(callback).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(baseConfig.checkIntervalMs);

      expect(callback).toHaveBeenCalledTimes(1);
      unsub();
    });

    it("schedules repeated checks", async () => {
      const scheduler = createDigestScheduler(baseConfig);
      const callback = vi.fn().mockResolvedValue(undefined);

      const unsub = scheduler.scheduleCheck(callback);

      await vi.advanceTimersByTimeAsync(baseConfig.checkIntervalMs);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(baseConfig.checkIntervalMs);
      expect(callback).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(baseConfig.checkIntervalMs);
      expect(callback).toHaveBeenCalledTimes(3);

      unsub();
    });

    it("unsubscriber stops checks", async () => {
      const scheduler = createDigestScheduler(baseConfig);
      const callback = vi.fn().mockResolvedValue(undefined);

      const unsub = scheduler.scheduleCheck(callback);

      await vi.advanceTimersByTimeAsync(baseConfig.checkIntervalMs);
      expect(callback).toHaveBeenCalledTimes(1);

      unsub();

      await vi.advanceTimersByTimeAsync(baseConfig.checkIntervalMs * 10);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("handles callback errors gracefully", async () => {
      const scheduler = createDigestScheduler(baseConfig);
      const callback = vi.fn().mockRejectedValue(new Error("Callback failed"));

      const unsub = scheduler.scheduleCheck(callback);

      await vi.advanceTimersByTimeAsync(baseConfig.checkIntervalMs);

      expect(callback).toHaveBeenCalledTimes(1);

      // Should continue scheduling despite error
      await vi.advanceTimersByTimeAsync(baseConfig.checkIntervalMs);
      expect(callback).toHaveBeenCalledTimes(2);

      unsub();
    });
  });
});
