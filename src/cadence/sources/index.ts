/**
 * Cadence Sources — Event producers for the signal bus.
 *
 * Sources watch external systems and emit signals when things happen.
 */

export { createCronBridge, getNextRun } from "./cron-bridge.js";
export type { CronJob, CronBridgeOptions } from "./cron-bridge.js";
