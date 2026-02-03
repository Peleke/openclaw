/**
 * OpenClaw Cadence bus setup.
 *
 * Creates and manages the central signal bus for ambient agency.
 * Wire this to gateway start/stop lifecycle.
 */

import {
  createSignalBus,
  createMemoryTransport,
  createNoopStore,
  createSequentialExecutor,
  type SignalBus,
  type Source,
  type Middleware,
} from "@peleke.s/cadence";
import type { OpenClawSignal } from "./signals.js";

export interface OpenClawBusOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Custom error handler */
  onError?: (error: unknown, signal: OpenClawSignal) => void;
}

export interface OpenClawBus {
  /** The underlying Cadence signal bus */
  bus: SignalBus<OpenClawSignal>;
  /** Register a source to produce signals */
  addSource(source: Source<OpenClawSignal>): void;
  /** Start all sources and begin processing */
  start(): Promise<void>;
  /** Stop all sources and clean up */
  stop(): Promise<void>;
  /** Check if bus is running */
  isRunning(): boolean;
}

/**
 * Create the OpenClaw signal bus.
 */
export function createOpenClawBus(options: OpenClawBusOptions = {}): OpenClawBus {
  const { debug = false, onError } = options;

  const sources: Source<OpenClawSignal>[] = [];
  let running = false;

  // Create the Cadence bus with defaults
  const bus = createSignalBus<OpenClawSignal>({
    transport: createMemoryTransport(),
    store: createNoopStore(),
    executor: createSequentialExecutor(),
    onError: (signal, handlerName, err) => {
      if (debug) {
        console.error(`[cadence] Handler error for ${signal.type} (${handlerName}):`, err);
      }
      onError?.(err, signal);
    },
  });

  // Debug middleware
  if (debug) {
    const debugMiddleware: Middleware<OpenClawSignal> = async (signal, next) => {
      console.log(`[cadence] → ${signal.type}`, JSON.stringify(signal.payload).slice(0, 100));
      const start = Date.now();
      await next();
      console.log(`[cadence] ← ${signal.type} (${Date.now() - start}ms)`);
    };
    bus.use(debugMiddleware);
  }

  function addSource(source: Source<OpenClawSignal>): void {
    sources.push(source);
  }

  async function start(): Promise<void> {
    if (running) {
      throw new Error("OpenClawBus already running");
    }

    running = true;

    // Start all sources
    for (const source of sources) {
      if (debug) {
        console.log(`[cadence] Starting source: ${source.name}`);
      }
      await source.start((signal) => bus.emit(signal));
    }

    if (debug) {
      console.log(`[cadence] Bus started with ${sources.length} sources`);
    }
  }

  async function stop(): Promise<void> {
    if (!running) return;

    // Stop all sources
    for (const source of sources) {
      if (debug) {
        console.log(`[cadence] Stopping source: ${source.name}`);
      }
      await source.stop();
    }

    // Clear handlers
    bus.clear();
    running = false;

    if (debug) {
      console.log("[cadence] Bus stopped");
    }
  }

  function isRunning(): boolean {
    return running;
  }

  return {
    bus,
    addSource,
    start,
    stop,
    isRunning,
  };
}

/**
 * Singleton bus instance for the gateway.
 * Initialize via initOpenClawBus(), access via getOpenClawBus().
 */
let globalBus: OpenClawBus | null = null;

export function initOpenClawBus(options?: OpenClawBusOptions): OpenClawBus {
  if (globalBus) {
    throw new Error("OpenClawBus already initialized");
  }
  globalBus = createOpenClawBus(options);
  return globalBus;
}

export function getOpenClawBus(): OpenClawBus {
  if (!globalBus) {
    throw new Error("OpenClawBus not initialized. Call initOpenClawBus() first.");
  }
  return globalBus;
}

export function destroyOpenClawBus(): void {
  if (globalBus?.isRunning()) {
    throw new Error("Cannot destroy running bus. Call stop() first.");
  }
  globalBus = null;
}
