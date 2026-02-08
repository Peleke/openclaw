/**
 * File log responder: appends all signals to a JSONL file.
 *
 * This bridges Cadence signals to sandbox Docker containers by writing
 * to a shared JSONL file that containers can tail/read.
 */

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { SignalBus } from "@peleke.s/cadence";
import type { OpenClawSignal } from "../signals.js";
import type { Responder } from "./index.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("cadence").child("file-log");

export interface FileLogResponderConfig {
  /** Path to the JSONL output file */
  filePath: string;
}

export function createFileLogResponder(config: FileLogResponderConfig): Responder {
  const { filePath } = config;

  return {
    name: "file-log",
    description: "Appends all signals to a JSONL file for container visibility",

    register(bus: SignalBus<OpenClawSignal>): () => void {
      // Ensure directory exists on first write
      let dirEnsured = false;

      const unsub = bus.onAny(async (signal) => {
        try {
          if (!dirEnsured) {
            await mkdir(path.dirname(filePath), { recursive: true });
            dirEnsured = true;
          }
          const line = JSON.stringify(signal) + "\n";
          await appendFile(filePath, line, "utf-8");
        } catch (err) {
          log.error(
            `Failed to write signal to ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      });

      log.info(`File log responder writing to ${filePath}`);
      return unsub;
    },
  };
}
