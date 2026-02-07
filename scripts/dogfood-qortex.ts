#!/usr/bin/env pnpm tsx
/**
 * E2E dogfood: prove the qortex MCP backend works end-to-end.
 *
 * Prerequisites:
 *   1. qortex-track-c checked out at ../qortex-track-c (relative to repo root)
 *   2. `cd ../qortex-track-c && uv pip install -e ".[mcp,vec]"`
 *   3. `pnpm build` (this repo)
 *
 * What this tests (two phases):
 *
 *   Phase 1 — Raw MCP client
 *     Spawns qortex as a stdio MCP subprocess using @modelcontextprotocol/sdk,
 *     performs the JSON-RPC handshake, lists tools, and calls qortex_status,
 *     qortex_domains, and qortex_query directly.
 *
 *   Phase 2 — QortexMemoryProvider wrapper
 *     Uses our provider abstraction (same code path as `memory_search` tool).
 *     Exercises init → status → search → sync → close lifecycle.
 *
 * Usage:
 *   pnpm tsx scripts/dogfood-qortex.ts
 *   pnpm tsx scripts/dogfood-qortex.ts --qortex-dir /path/to/qortex-track-c
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = something failed (see output)
 */
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { resolveQortexConfig, QortexMemoryProvider, parseToolResult, mapQueryItems } from "../src/memory/providers/qortex.js";

// ── Config ───────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const DEFAULT_QORTEX_DIR = path.resolve(REPO_ROOT, "..", "qortex-track-c");

function getQortexDir(): string {
  const idx = process.argv.indexOf("--qortex-dir");
  if (idx !== -1 && process.argv[idx + 1]) return path.resolve(process.argv[idx + 1]!);
  return DEFAULT_QORTEX_DIR;
}

const QORTEX_DIR = getQortexDir();

// ── Helpers ──────────────────────────────────────────────────────────────────

type McpContent = Array<{ type: string; text?: string }>;
const passed: string[] = [];
const failed: string[] = [];

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed.push(name);
    log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed.push(name);
    log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function extractText(raw: Awaited<ReturnType<Client["callTool"]>>): string {
  return (raw.content as McpContent | undefined)
    ?.filter(c => c.type === "text")
    .map(c => c.text ?? "")
    .join("") ?? "";
}

// ── Phase 1: Raw MCP Client ─────────────────────────────────────────────────

async function phase1() {
  log("Phase 1: Raw MCP client");
  log(`  qortex dir: ${QORTEX_DIR}`);
  log(`  command: uv run qortex mcp-serve\n`);

  const transport = new StdioClientTransport({
    command: "uv",
    args: ["run", "qortex", "mcp-serve"],
    cwd: QORTEX_DIR,
    stderr: "pipe",
  });

  if (transport.stderr) {
    transport.stderr.on("data", (chunk: Buffer) => {
      // Suppress model loading progress bars, show real log lines
      const line = String(chunk).trim();
      if (line.includes("INFO") || line.includes("Error")) {
        process.stderr.write(`  [qortex] ${line}\n`);
      }
    });
  }

  const client = new Client(
    { name: "openclaw-dogfood", version: "0.0.1" },
    { capabilities: {} },
  );

  await client.connect(transport, { timeout: 30_000 });
  check("mcp.handshake", true);

  // List tools
  const { tools } = await client.listTools();
  const toolNames = tools.map(t => t.name);
  check("mcp.listTools", tools.length >= 5, `${tools.length} tools: ${toolNames.join(", ")}`);

  const requiredTools = ["qortex_query", "qortex_feedback", "qortex_status", "qortex_domains"];
  for (const name of requiredTools) {
    check(`mcp.tool.${name}`, toolNames.includes(name));
  }

  // qortex_status
  const statusRaw = await client.callTool({ name: "qortex_status", arguments: {} }, undefined, { timeout: 10_000 });
  const statusText = extractText(statusRaw);
  const statusJson = JSON.parse(statusText);
  check("mcp.qortex_status", statusJson.status === "ok", `backend=${statusJson.backend}`);

  // qortex_domains
  const domainsRaw = await client.callTool({ name: "qortex_domains", arguments: {} }, undefined, { timeout: 10_000 });
  const domainsText = extractText(domainsRaw);
  const domainsJson = JSON.parse(domainsText);
  check("mcp.qortex_domains", Array.isArray(domainsJson.domains), `${domainsJson.domains.length} domains`);

  // qortex_query
  const queryRaw = await client.callTool({
    name: "qortex_query",
    arguments: { context: "dogfood test", domains: ["memory/dogfood"], top_k: 5, min_confidence: 0, mode: "auto" },
  }, undefined, { timeout: 30_000 });
  const queryText = extractText(queryRaw);
  const queryJson = JSON.parse(queryText);
  check("mcp.qortex_query", !!queryJson.query_id, `query_id=${queryJson.query_id}`);
  check("mcp.qortex_query.items", Array.isArray(queryJson.items), `${queryJson.items.length} items`);

  // Validate parseToolResult works on real data
  const parsed = parseToolResult(statusRaw);
  check("parseToolResult", (parsed as Record<string, unknown>).status === "ok");

  const mapped = mapQueryItems(queryJson);
  check("mapQueryItems", Array.isArray(mapped), `${mapped.length} mapped results`);

  await client.close();
  log("");
}

// ── Phase 2: QortexMemoryProvider ────────────────────────────────────────────

async function phase2() {
  log("Phase 2: QortexMemoryProvider wrapper\n");

  const config = resolveQortexConfig(
    { command: `uv run --project ${QORTEX_DIR} qortex mcp-serve` },
    "dogfood-agent",
  );
  check("provider.resolveConfig", config.command === "uv", `${config.command} ${config.args.join(" ")}`);

  const minCfg = { agents: { list: [{ id: "dogfood-agent", default: true }] } } as any;
  const provider = new QortexMemoryProvider(config, "dogfood-agent", minCfg);

  await provider.init();
  check("provider.init", true);

  const status = provider.status();
  check("provider.status", status.available === true && status.provider === "qortex");

  const results = await provider.search("dogfood test", { maxResults: 5 });
  check("provider.search", Array.isArray(results), `${results.length} results`);

  const queryId = provider.currentQueryId;
  check("provider.currentQueryId", typeof queryId === "string" && queryId.length > 0, queryId ?? "null");

  const syncResult = await provider.sync();
  check("provider.sync", syncResult.indexed === 0 && syncResult.errors.length === 0);

  await provider.close();
  check("provider.close", true);

  const afterClose = provider.status();
  check("provider.status_after_close", afterClose.available === false);
  log("");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n========================================");
  console.log("  qortex MCP E2E Dogfood");
  console.log("========================================\n");

  await phase1();
  await phase2();

  console.log("========================================");
  console.log(`  ${passed.length} passed, ${failed.length} failed`);
  console.log("========================================");

  if (failed.length > 0) {
    console.log("\nFailed checks:");
    for (const f of failed) console.log(`  - ${f}`);
    process.exit(1);
  }

  console.log("\nAll checks passed. qortex backend is LIVE.");
}

main().catch(err => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
