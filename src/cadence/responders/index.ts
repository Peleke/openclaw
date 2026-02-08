/**
 * Cadence responders — react to signals and take action.
 *
 * Responders are signal handlers that perform side effects:
 * - Send notifications
 * - Update state
 * - Trigger external APIs
 * - Chain signals
 */

import type { OpenClawSignal } from "../signals.js";
import type { SignalBus } from "@peleke.s/cadence";

export interface Responder {
  name: string;
  description: string;
  register(bus: SignalBus<OpenClawSignal>): () => void;
}

/**
 * Register all responders with the bus.
 * Returns an unsubscribe function to remove all handlers.
 */
export function registerResponders(
  bus: SignalBus<OpenClawSignal>,
  responders: Responder[],
): () => void {
  const unsubscribers = responders.map((r) => r.register(bus));
  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}

// Export individual responders
export { createTaskLoggerResponder } from "./task-logger.js";
export {
  createTelegramNotifierResponder,
  type TelegramNotifierConfig,
} from "./telegram-notifier.js";
export { createFileLogResponder, type FileLogResponderConfig } from "./file-log.js";
