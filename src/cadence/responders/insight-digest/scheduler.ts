/**
 * Digest scheduler — time-based flush triggers and quiet hours.
 *
 * Follows heartbeat pattern from src/infra/heartbeat-runner.ts.
 * Designed to be clock-pluggable for future biological timing models.
 */

import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { DigestConfig, DigestClock } from "./types.js";

const log = createSubsystemLogger("cadence").child("digest-scheduler");

/**
 * Parse HH:MM time string to minutes since midnight.
 */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time format: ${time}. Expected HH:MM.`);
  }
  return hours * 60 + minutes;
}

/**
 * Get current minutes since midnight in a specific timezone.
 */
export function getCurrentMinutesInTimezone(timezone: string, now: number = Date.now()): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date(now));
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    return hour * 60 + minute;
  } catch {
    // Fallback to local time if timezone is invalid
    log.warn(`Invalid timezone "${timezone}", falling back to local time`);
    const date = new Date(now);
    return date.getHours() * 60 + date.getMinutes();
  }
}

/**
 * Check if a given time (in minutes) is within a quiet window.
 * Handles wrap-around (e.g., 22:00 to 08:00 crosses midnight).
 */
export function isInQuietWindow(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  // Same start and end = quiet hours disabled
  if (startMinutes === endMinutes) {
    return false;
  }

  // Check for 24-hour quiet (start > end by full day, though unusual)
  // This would mean quiet all day, but let's treat it as no quiet hours

  if (startMinutes < endMinutes) {
    // Normal window (e.g., 09:00 to 17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Wrap-around window (e.g., 22:00 to 08:00)
    // Quiet if >= start OR < end
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Calculate milliseconds until the quiet window ends.
 * Returns 0 if not currently in quiet hours.
 */
export function msUntilQuietEnds(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number,
): number {
  if (!isInQuietWindow(currentMinutes, startMinutes, endMinutes)) {
    return 0;
  }

  let minutesUntilEnd: number;

  if (startMinutes < endMinutes) {
    // Normal window
    minutesUntilEnd = endMinutes - currentMinutes;
  } else {
    // Wrap-around window
    if (currentMinutes >= startMinutes) {
      // We're in the evening portion (after start, before midnight)
      // Minutes until midnight + minutes from midnight to end
      minutesUntilEnd = 24 * 60 - currentMinutes + endMinutes;
    } else {
      // We're in the morning portion (after midnight, before end)
      minutesUntilEnd = endMinutes - currentMinutes;
    }
  }

  return minutesUntilEnd * 60 * 1000;
}

/**
 * Simple clock implementation using config-based quiet hours.
 */
export function createSimpleClock(config: DigestConfig): DigestClock {
  const startMinutes = parseTimeToMinutes(config.quietHoursStart);
  const endMinutes = parseTimeToMinutes(config.quietHoursEnd);

  return {
    isQuietPeriod(): boolean {
      const currentMinutes = getCurrentMinutesInTimezone(config.timezone);
      return isInQuietWindow(currentMinutes, startMinutes, endMinutes);
    },

    msUntilNextWindow(): number {
      const currentMinutes = getCurrentMinutesInTimezone(config.timezone);
      return msUntilQuietEnds(currentMinutes, startMinutes, endMinutes);
    },

    now(): number {
      return Date.now();
    },
  };
}

export interface DigestScheduler {
  /** Check if currently in quiet hours */
  isQuietHours(): boolean;

  /** Schedule periodic flush checks */
  scheduleCheck(callback: () => Promise<void>): () => void;

  /** Get ms until next allowed flush window */
  msUntilNextWindow(): number;

  /** The underlying clock (for testing/extension) */
  clock: DigestClock;
}

/**
 * Create a digest scheduler with configurable clock.
 */
export function createDigestScheduler(config: DigestConfig, clock?: DigestClock): DigestScheduler {
  const activeClock = clock ?? createSimpleClock(config);
  let checkTimer: NodeJS.Timeout | null = null;

  return {
    clock: activeClock,

    isQuietHours(): boolean {
      return activeClock.isQuietPeriod();
    },

    msUntilNextWindow(): number {
      return activeClock.msUntilNextWindow();
    },

    scheduleCheck(callback: () => Promise<void>): () => void {
      let stopped = false;

      const runCheck = async () => {
        if (stopped) return;

        try {
          await callback();
        } catch (err) {
          log.error(`Flush check error: ${err instanceof Error ? err.message : String(err)}`);
        }

        // Schedule next check if not stopped
        if (!stopped) {
          checkTimer = setTimeout(runCheck, config.checkIntervalMs);
        }
      };

      // Start the first check after the interval
      checkTimer = setTimeout(runCheck, config.checkIntervalMs);

      // Return unsubscriber
      return () => {
        stopped = true;
        if (checkTimer) {
          clearTimeout(checkTimer);
          checkTimer = null;
        }
      };
    },
  };
}
