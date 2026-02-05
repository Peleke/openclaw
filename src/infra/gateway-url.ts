/**
 * Unified gateway URL resolution for CLI → gateway communication.
 * Replaces duplicated Tailscale-first logic; aligns with env.sh.
 *
 * Priority chain:
 *   1. opts.host  (CLI --host flag)
 *   2. OPENCLAW_GATEWAY_HOST env var (set by env.sh, sandbox-aware)
 *   3. "127.0.0.1" (safe default — works with loopback, port forwarding, etc.)
 *
 * Port:
 *   1. opts.port
 *   2. resolveGatewayPort() from config/paths.ts
 */

import { resolveGatewayPort } from "../config/paths.js";

export type ResolveGatewayUrlOpts = {
  host?: string;
  port?: string | number;
};

export function resolveGatewayHost(opts?: ResolveGatewayUrlOpts): string {
  if (opts?.host) return opts.host;
  const envHost = process.env.OPENCLAW_GATEWAY_HOST?.trim();
  if (envHost) return envHost;
  return "127.0.0.1";
}

export function resolveGatewayUrlPort(opts?: ResolveGatewayUrlOpts): number {
  if (opts?.port != null) {
    const n = typeof opts.port === "number" ? opts.port : Number.parseInt(opts.port, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return resolveGatewayPort();
}

export function resolveGatewayUrl(opts?: ResolveGatewayUrlOpts): string {
  const host = resolveGatewayHost(opts);
  const port = resolveGatewayUrlPort(opts);
  return `http://${host}:${port}`;
}
