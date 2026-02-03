/**
 * Lightweight typed pub/sub signal bus.
 *
 * In-process, ephemeral, sequential execution.
 * Errors are caught per-handler and never propagated.
 */

import type { Signal, SignalHandler, SignalType } from "./types.js";

export interface SignalBus {
  emit<T extends SignalType>(signal: Signal<T>): Promise<void>;
  subscribe<T extends SignalType>(type: T, handler: SignalHandler<T>): () => void;
  /** Alias for subscribe (compatible with @peleke.s/cadence SignalBus) */
  on<T extends SignalType>(type: T, handler: SignalHandler<T>): () => void;
  clear(): void;
}

export function createSignalBus(opts?: {
  onError?: (type: SignalType, handlerIndex: number, err: unknown) => void;
}): SignalBus {
  const handlers = new Map<SignalType, SignalHandler<any>[]>();

  function subscribe<T extends SignalType>(type: T, handler: SignalHandler<T>): () => void {
    if (!handlers.has(type)) handlers.set(type, []);
    const list = handlers.get(type)!;
    list.push(handler);
    return () => {
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  async function emit<T extends SignalType>(signal: Signal<T>): Promise<void> {
    const list = handlers.get(signal.type);
    if (!list?.length) return;
    for (let i = 0; i < list.length; i++) {
      try {
        await list[i](signal);
      } catch (err) {
        opts?.onError?.(signal.type, i, err);
      }
    }
  }

  function clear(): void {
    handlers.clear();
  }

  return { emit, subscribe, on: subscribe, clear };
}
