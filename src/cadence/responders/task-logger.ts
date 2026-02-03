/**
 * Task logger responder — logs tasks found in Obsidian notes.
 *
 * This is a simple observability responder that demonstrates the pattern.
 */

import type { SignalBus } from "@peleke.s/cadence";
import type { OpenClawSignal } from "../signals.js";
import type { Responder } from "./index.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("cadence").child("task-logger");

export function createTaskLoggerResponder(): Responder {
  return {
    name: "task-logger",
    description: "Logs tasks found in Obsidian notes",

    register(bus: SignalBus<OpenClawSignal>): () => void {
      const unsub = bus.on("obsidian.task.found", async (signal) => {
        const { path, task, lineNumber } = signal.payload;
        const status = task.done ? "[x]" : "[ ]";
        log.info(`${status} ${task.text} (${path}:${lineNumber})`);
      });

      return unsub;
    },
  };
}
