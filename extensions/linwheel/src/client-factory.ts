import { LinWheel, type LinWheelConfig } from "@linwheel/sdk";
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

type PluginCfg = {
  apiKey?: string;
  signingSecret?: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export function createLinWheelClient(api: OpenClawPluginApi): LinWheel | null {
  const cfg = (api.pluginConfig ?? {}) as PluginCfg;

  const apiKey = cfg.apiKey?.trim() || process.env.LINWHEEL_API_KEY?.trim() || undefined;
  if (!apiKey) return null;

  const signingSecret =
    cfg.signingSecret?.trim() || process.env.LINWHEEL_SIGNING_SECRET?.trim() || undefined;
  const baseUrl = cfg.baseUrl?.trim() || process.env.LINWHEEL_BASE_URL?.trim() || undefined;
  const timeoutMs = cfg.timeoutMs ?? undefined;

  const config: LinWheelConfig = {
    apiKey,
    ...(signingSecret ? { signingSecret } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
  };

  return new LinWheel(config);
}
