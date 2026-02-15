/**
 * Fire-and-forget online indexing of conversation turns via qortex MCP tools.
 *
 * Calls `qortex_ingest_message` for the user prompt and each assistant response.
 * Non-blocking: failures are logged at debug level and never propagate.
 */

import type { QortexConnection } from "./types.js";

const INGEST_TIMEOUT_MS = 10_000;

type IngestTurnParams = {
  connection: QortexConnection;
  sessionId: string;
  userPrompt: string;
  assistantTexts: string[];
  domain?: string;
  log?: { debug: (msg: string) => void };
};

/**
 * Index a full conversation turn (user message + assistant responses).
 *
 * Runs all ingest calls concurrently via Promise.allSettled so one failure
 * doesn't block the rest. Swallows all errors — indexing must never break
 * the conversation flow.
 */
export async function ingestConversationTurn(params: IngestTurnParams): Promise<void> {
  const { connection, sessionId, userPrompt, assistantTexts, domain = "session", log } = params;

  if (!connection.isConnected) return;

  const calls: Promise<unknown>[] = [];

  // Index user message
  if (userPrompt.trim()) {
    calls.push(
      connection.callTool(
        "qortex_ingest_message",
        { text: userPrompt, session_id: sessionId, role: "user", domain },
        { timeout: INGEST_TIMEOUT_MS },
      ),
    );
  }

  // Index each assistant response
  for (const text of assistantTexts) {
    if (!text.trim()) continue;
    calls.push(
      connection.callTool(
        "qortex_ingest_message",
        { text, session_id: sessionId, role: "assistant", domain },
        { timeout: INGEST_TIMEOUT_MS },
      ),
    );
  }

  if (calls.length === 0) return;

  const results = await Promise.allSettled(calls);
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0 && log) {
    log.debug(
      `online-ingest: ${failures.length}/${calls.length} calls failed for session=${sessionId}`,
    );
  }
}
