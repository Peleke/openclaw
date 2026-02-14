/**
 * Chat command handler for `/learning` (reset, reward, status).
 * Talks to the learning API via the gateway HTTP layer.
 */

import type { CommandHandler } from "./commands-types.js";

const LEARNING_CMD_RE = /^\/learning(?:\s+(.*))?$/i;

export const handleLearningCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) return null;

  const match = params.command.commandBodyNormalized.match(LEARNING_CMD_RE);
  if (!match) return null;

  if (!params.command.isAuthorizedSender) {
    return {
      shouldContinue: false,
      reply: { text: "Learning commands require authorized sender." },
    };
  }

  const rawArgs = (match[1] ?? "").trim();
  const [action, ...rest] = rawArgs.split(/\s+/);
  const target = rest.join(" ");

  if (!action || action === "status") {
    return await handleLearningStatus();
  }

  if (action === "reset") {
    return await handleLearningReset();
  }

  if (action === "reward") {
    return await handleLearningReward(target);
  }

  return {
    shouldContinue: false,
    reply: { text: `Unknown learning action: ${action}. Use: reset, reward, status` },
  };
};

async function handleLearningStatus() {
  const { fetchGatewayJson } = await import("../../infra/gateway-http.js");
  const [summary, config, posteriors] = await Promise.all([
    fetchGatewayJson("/__openclaw__/api/learning", "/summary"),
    fetchGatewayJson("/__openclaw__/api/learning", "/config"),
    fetchGatewayJson("/__openclaw__/api/learning", "/posteriors"),
  ]);

  if (summary && config && posteriors) {
    const { formatLearningStatusFromApi } = await import("../../learning/cli-status.js");
    return {
      shouldContinue: false,
      reply: {
        text: formatLearningStatusFromApi({ summary, config, posteriors } as Parameters<
          typeof formatLearningStatusFromApi
        >[0]),
      },
    };
  }

  return {
    shouldContinue: false,
    reply: { text: "Learning status unavailable — gateway or qortex not reachable." },
  };
}

async function handleLearningReset() {
  const { postGatewayJson } = await import("../../infra/gateway-http.js");
  const result = await postGatewayJson<{ learner: string; reset_count: number }>(
    "/__openclaw__/api/learning",
    "/reset",
    {},
  );

  if (result) {
    return {
      shouldContinue: false,
      reply: {
        text: `Reset ${result.reset_count} arm(s) for learner "${result.learner}". All posteriors back to Beta(1,1).`,
      },
    };
  }

  return {
    shouldContinue: false,
    reply: { text: "Reset failed — gateway or qortex not reachable." },
  };
}

async function handleLearningReward(target: string) {
  if (!target) {
    return {
      shouldContinue: false,
      reply: { text: "Usage: /learning reward <arm_id_or_label> [0|1]" },
    };
  }

  // Parse optional reward value from the end: "/learning reward web_search 0"
  const parts = target.split(/\s+/);
  let reward = 1.0;
  let armLabel = target;
  const lastPart = parts[parts.length - 1];
  if (parts.length > 1 && (lastPart === "0" || lastPart === "1")) {
    reward = Number(lastPart);
    armLabel = parts.slice(0, -1).join(" ");
  }

  // Try to fuzzy-match arm label to full arm ID
  const armId = await resolveArmId(armLabel);
  const outcome = reward > 0 ? "accepted" : "rejected";

  const { postGatewayJson } = await import("../../infra/gateway-http.js");
  const result = await postGatewayJson<{ ok: boolean; arm_id: string }>(
    "/__openclaw__/api/learning",
    "/reward",
    { arm_id: armId, outcome, reward, reason: "user feedback via /learning reward" },
  );

  if (result?.ok) {
    return {
      shouldContinue: false,
      reply: { text: `Recorded ${outcome} (reward=${reward}) for ${result.arm_id}` },
    };
  }

  return {
    shouldContinue: false,
    reply: { text: `Reward failed for "${armLabel}" — gateway or qortex not reachable.` },
  };
}

/**
 * Resolve a short arm label (e.g. "web_search") to a full arm ID (e.g. "tool:web:web_search").
 * Fetches posteriors and fuzzy-matches. Falls back to the raw label.
 */
async function resolveArmId(label: string): Promise<string> {
  // Already a full arm ID?
  if (label.includes(":")) return label;

  const { fetchGatewayJson } = await import("../../infra/gateway-http.js");
  const posteriors = await fetchGatewayJson<Array<{ armId: string }>>(
    "/__openclaw__/api/learning",
    "/posteriors",
  );

  if (!posteriors) return label;

  const lower = label.toLowerCase();
  // Exact match on the last segment
  const exact = posteriors.find((p) => {
    const segments = p.armId.split(":");
    return segments[segments.length - 1]?.toLowerCase() === lower;
  });
  if (exact) return exact.armId;

  // Substring match
  const partial = posteriors.find((p) => p.armId.toLowerCase().includes(lower));
  if (partial) return partial.armId;

  return label;
}
