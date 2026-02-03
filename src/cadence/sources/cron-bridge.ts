/**
 * OpenClaw Cron Bridge.
 *
 * Bridges OpenClaw's scheduling infrastructure to Cadence's Source interface.
 * Produces the same `cadence.cron.fired` signal as the portable @peleke.s/cadence
 * cron source, allowing swapping between implementations via config.
 *
 * Design principle: Same signal contract, different backend.
 */

import type { Source } from "@peleke.s/cadence";
import type { OpenClawSignal } from "../signals.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("cadence").child("cron-bridge");

export interface CronJob {
  /** Unique job identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Cron expression (e.g., "0 8 * * *" = 8am daily) */
  expr: string;
  /** Timezone (e.g., "America/New_York") */
  tz?: string;
  /** Whether job is enabled (default: true) */
  enabled?: boolean;
}

export interface CronBridgeOptions {
  /** Jobs to schedule */
  jobs: CronJob[];

  /** Called when a job fires (for logging/debugging) */
  onFire?: (job: CronJob) => void;

  /** Called on cron parse error */
  onError?: (job: CronJob, error: Error) => void;
}

interface ActiveJob {
  job: CronJob;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Calculate milliseconds until next cron occurrence.
 * Simple implementation for standard cron expressions.
 */
function msUntilNextRun(expr: string, tz?: string): number {
  const now = new Date();
  const parts = expr.split(" ");

  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${expr}`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Parse target hour and minute (simple case: specific values)
  const targetMinute = minute === "*" ? 0 : parseInt(minute, 10);
  const targetHour = hour === "*" ? now.getHours() : parseInt(hour, 10);

  if (isNaN(targetMinute) || isNaN(targetHour)) {
    throw new Error(`Cannot parse cron expression: ${expr}`);
  }

  // Calculate next occurrence
  const target = new Date(now);
  target.setHours(targetHour, targetMinute, 0, 0);

  // If target is in the past today, move to tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

/**
 * Create an OpenClaw cron bridge source.
 *
 * This uses a simple setTimeout-based scheduler suitable for
 * process-lifetime jobs (e.g., background service).
 *
 * For production, consider using OpenClaw's heartbeat integration
 * or the portable @peleke.s/cadence cron source with croner.
 *
 * @example
 * ```typescript
 * const source = createCronBridge({
 *   jobs: [
 *     { id: "nightly-digest", name: "Nightly Digest", expr: "0 21 * * *", tz: "America/New_York" },
 *   ],
 * });
 *
 * await source.start((signal) => bus.emit(signal));
 * ```
 */
export function createCronBridge(options: CronBridgeOptions): Source<OpenClawSignal> {
  const activeJobs: ActiveJob[] = [];

  function scheduleJob(
    job: CronJob,
    emit: (signal: OpenClawSignal) => Promise<void>,
  ): ReturnType<typeof setTimeout> | null {
    try {
      const delay = msUntilNextRun(job.expr, job.tz);

      log.debug(`Scheduling job ${job.id} in ${Math.round(delay / 1000 / 60)} minutes`, {
        jobId: job.id,
        expr: job.expr,
        delay,
      });

      const timer = setTimeout(async () => {
        const firedAt = Date.now();
        options.onFire?.(job);

        log.info(`Cron job fired: ${job.name}`, { jobId: job.id });

        const signal: OpenClawSignal = {
          type: "cadence.cron.fired",
          id: crypto.randomUUID(),
          ts: firedAt,
          payload: {
            jobId: job.id,
            jobName: job.name,
            expr: job.expr,
            firedAt,
            tz: job.tz,
          },
        };

        await emit(signal);

        // Reschedule for next occurrence
        const nextTimer = scheduleJob(job, emit);
        if (nextTimer) {
          const idx = activeJobs.findIndex((aj) => aj.job.id === job.id);
          if (idx !== -1) {
            activeJobs[idx].timer = nextTimer;
          }
        }
      }, delay);

      return timer;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      options.onError?.(job, error);
      log.warn(`Failed to schedule job ${job.id}`, { error: error.message });
      return null;
    }
  }

  return {
    name: "cron-bridge",

    async start(emit) {
      for (const job of options.jobs) {
        // Skip disabled jobs
        if (job.enabled === false) {
          log.debug(`Skipping disabled job: ${job.id}`);
          continue;
        }

        const timer = scheduleJob(job, emit);
        if (timer) {
          activeJobs.push({ job, timer });
        }
      }

      log.info(`Cron bridge started with ${activeJobs.length} jobs`);
    },

    async stop() {
      for (const { timer } of activeJobs) {
        clearTimeout(timer);
      }
      activeJobs.length = 0;

      log.info("Cron bridge stopped");
    },
  };
}

/**
 * Get next run time for a cron expression.
 */
export function getNextRun(expr: string, tz?: string): Date | null {
  try {
    const delay = msUntilNextRun(expr, tz);
    return new Date(Date.now() + delay);
  } catch {
    return null;
  }
}
