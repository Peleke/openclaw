/**
 * CLI-to-gateway HTTP fetch helper.
 * Returns null on any failure (network error, non-200, timeout)
 * so callers can fall back to local DB reads.
 */

import { resolveGatewayUrl, type ResolveGatewayUrlOpts } from "./gateway-url.js";

const DEFAULT_TIMEOUT_MS = 3_000;

export type FetchGatewayJsonOpts = ResolveGatewayUrlOpts & {
  timeoutMs?: number;
};

/**
 * Fetch JSON from a gateway API path.
 * @param apiPrefix  Full API prefix path, e.g. "/__openclaw__/api/green"
 * @param route      Route within the API, e.g. "/summary"
 * @param opts       Host/port/timeout overrides
 * @returns Parsed JSON or null on any failure
 */
export async function fetchGatewayJson<T>(
  apiPrefix: string,
  route: string,
  opts?: FetchGatewayJsonOpts,
): Promise<T | null> {
  const base = resolveGatewayUrl(opts);
  // Use URL constructor for safe composition instead of string concat
  const url = new URL(`${apiPrefix}${route}`, base).href;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
