#!/usr/bin/env pnpm tsx
/**
 * E2E Grafana dogfood: prove openclaw's memory AND learning operations
 * light up Grafana dashboards through real infrastructure (no mocks).
 *
 * Prerequisites:
 *   1. Observability stack running on host:
 *        cd ../qortex-track-c/docker && docker compose up -d
 *   2. qortex-track-c checked out at ../qortex-track-c
 *   3. `cd ../qortex-track-c && uv pip install -e ".[mcp,vec]"`
 *
 * Usage (host):
 *   QORTEX_OTEL_ENABLED=true \
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
 *   OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
 *   QORTEX_PROMETHEUS_ENABLED=true \
 *   QORTEX_PROMETHEUS_PORT=9464 \
 *   pnpm tsx scripts/dogfood-grafana.ts
 *
 * Usage (sandbox):
 *   PROMETHEUS_HOST=host.lima.internal \
 *   GRAFANA_HOST=host.lima.internal \
 *   pnpm tsx scripts/dogfood-grafana.ts
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = something failed (see output)
 */
import path from "node:path";

import { QortexMcpConnection, parseCommandString } from "../src/qortex/connection.js";
import { QortexMemoryProvider, resolveQortexConfig } from "../src/memory/providers/qortex.js";
import { QortexLearningClient } from "../src/learning/qortex-client.js";

// ── Config ───────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const DEFAULT_QORTEX_DIR = path.resolve(REPO_ROOT, "..", "qortex-track-c");

function getQortexDir(): string {
  const idx = process.argv.indexOf("--qortex-dir");
  if (idx !== -1 && process.argv[idx + 1]) return path.resolve(process.argv[idx + 1]!);
  return DEFAULT_QORTEX_DIR;
}

const QORTEX_DIR = getQortexDir();

// Configurable hosts — defaults work on host; override for sandbox
const OTEL_HOST = process.env.OTEL_HOST ?? "localhost";
const PROMETHEUS_HOST = process.env.PROMETHEUS_HOST ?? "localhost";
const GRAFANA_HOST = process.env.GRAFANA_HOST ?? "localhost";
const PROMETHEUS_PORT = Number(process.env.PROMETHEUS_PORT ?? "9091");
const GRAFANA_PORT = Number(process.env.GRAFANA_PORT ?? "3010");

// Flush wait: OTel export interval + Prometheus scrape cycle
const FLUSH_WAIT_SECS = Number(process.env.FLUSH_WAIT_SECS ?? "25");

// ── Helpers ──────────────────────────────────────────────────────────────────

const passed: string[] = [];
const failed: string[] = [];
const skipped: string[] = [];

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

function skip(name: string, reason: string) {
  skipped.push(name);
  log(`  SKIP  ${name} — ${reason}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Port check ───────────────────────────────────────────────────────────────

async function isPortOpen(host: string, port: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://${host}:${port}/`, {
      signal: AbortSignal.timeout(3000),
    });
    // Any response (even 404) means the port is open
    void resp;
    return true;
  } catch {
    return false;
  }
}

async function checkPorts(): Promise<boolean> {
  const ports = [
    { name: "OTel Collector", host: OTEL_HOST, port: 4318, path: "/" },
    { name: "Prometheus", host: PROMETHEUS_HOST, port: PROMETHEUS_PORT, path: "/-/healthy" },
    { name: "Grafana", host: GRAFANA_HOST, port: GRAFANA_PORT, path: "/api/health" },
  ];

  let allUp = true;
  for (const p of ports) {
    const up = await isPortOpen(p.host, p.port);
    if (!up) {
      log(`  DOWN  ${p.name} at ${p.host}:${p.port}`);
      allUp = false;
    } else {
      log(`    UP  ${p.name} at ${p.host}:${p.port}`);
    }
  }
  return allUp;
}

// ── Prometheus / Grafana query helpers ───────────────────────────────────────

type PromResult = {
  status: string;
  data?: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value: [number, string];
    }>;
  };
};

async function promQuery(expr: string): Promise<PromResult> {
  const url = `http://${PROMETHEUS_HOST}:${PROMETHEUS_PORT}/api/v1/query?query=${encodeURIComponent(expr)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
  return (await resp.json()) as PromResult;
}

/** Query Prometheus through Grafana's datasource proxy (proves Grafana can see the data). */
async function grafanaQuery(expr: string): Promise<PromResult> {
  // datasource uid=1 is the default Prometheus datasource in our docker compose stack
  const url =
    `http://${GRAFANA_HOST}:${GRAFANA_PORT}/api/datasources/proxy/1/api/v1/query` +
    `?query=${encodeURIComponent(expr)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
  return (await resp.json()) as PromResult;
}

/** Check a metric exists and has a value satisfying the predicate. */
function assertMetric(
  result: PromResult,
  name: string,
  predicate: (val: number) => boolean,
  description: string,
): void {
  if (result.status !== "success" || !result.data?.result?.length) {
    check(`prom.${name}`, false, "no data returned");
    return;
  }
  const val = parseFloat(result.data.result[0]!.value[1]);
  check(`prom.${name}`, predicate(val), `${description}: ${val}`);
}

// ── Phase 1: Memory workload ─────────────────────────────────────────────────

const SEARCH_QUERIES = [
  "how to configure webhooks",
  "authentication flow for API keys",
  "rate limiting strategies",
  "memory provider architecture",
  "Thompson sampling for relevance",
  "session management lifecycle",
  "plugin system extension points",
  "gateway routing decisions",
  "command parsing pipeline",
  "observability and metrics collection",
];

const FEEDBACK_OUTCOMES: Array<"accepted" | "rejected" | "partial"> = [
  "accepted", "accepted", "accepted", "accepted",
  "rejected", "rejected", "rejected",
  "partial", "partial", "partial",
];

async function phase1(provider: QortexMemoryProvider): Promise<string[]> {
  log("Phase 1: Memory workload\n");

  // Search x 10
  const queryIds: string[] = [];
  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    const results = await provider.search(SEARCH_QUERIES[i]!, { maxResults: 5 });
    const qid = provider.currentQueryId;
    check(`memory.search[${i}]`, Array.isArray(results), `${results.length} results, qid=${qid}`);
    if (qid) queryIds.push(qid);
  }

  // Feedback x 10 (use the query IDs we collected)
  for (let i = 0; i < FEEDBACK_OUTCOMES.length; i++) {
    const qid = queryIds[i % queryIds.length]!;
    const outcome = FEEDBACK_OUTCOMES[i]!;
    try {
      await provider.feedback(qid, { [`item-${i}`]: outcome });
      check(`memory.feedback[${i}]`, true, `${outcome} on ${qid.slice(0, 8)}`);
    } catch (err) {
      check(`memory.feedback[${i}]`, false, String(err));
    }
  }

  log("");
  return queryIds;
}

// ── Phase 2: Learning workload ───────────────────────────────────────────────

const ARM_CANDIDATES = [
  { id: "tool:memory_search", metadata: { type: "tool" }, token_cost: 50 },
  { id: "tool:file_read", metadata: { type: "tool" }, token_cost: 100 },
  { id: "tool:web_fetch", metadata: { type: "tool" }, token_cost: 200 },
  { id: "skill:code_review", metadata: { type: "skill" }, token_cost: 150 },
  { id: "skill:summarize", metadata: { type: "skill" }, token_cost: 80 },
  { id: "file:src/config.ts", metadata: { type: "file" }, token_cost: 120 },
  { id: "file:src/routing.ts", metadata: { type: "file" }, token_cost: 90 },
  { id: "file:src/memory/manager.ts", metadata: { type: "file" }, token_cost: 110 },
];

const OBSERVE_OUTCOMES = [
  { armIdx: 0, outcome: "success", reward: 1.0 },
  { armIdx: 1, outcome: "success", reward: 0.8 },
  { armIdx: 2, outcome: "failure", reward: 0.0 },
  { armIdx: 3, outcome: "success", reward: 0.9 },
  { armIdx: 4, outcome: "partial", reward: 0.5 },
  { armIdx: 0, outcome: "success", reward: 1.0 },
  { armIdx: 5, outcome: "failure", reward: 0.1 },
  { armIdx: 6, outcome: "success", reward: 0.7 },
  { armIdx: 7, outcome: "partial", reward: 0.4 },
  { armIdx: 1, outcome: "success", reward: 0.9 },
];

async function phase2(client: QortexLearningClient): Promise<void> {
  log("Phase 2: Learning workload\n");

  // Session start
  const session = await client.sessionStart("dogfood-grafana-e2e");
  check("learning.sessionStart", session !== null, `session_id=${session?.session_id}`);

  // Select x 10
  for (let i = 0; i < 10; i++) {
    const result = await client.select(ARM_CANDIDATES, {
      context: { iteration: i, task: "dogfood-grafana" },
      token_budget: 500,
    });
    check(
      `learning.select[${i}]`,
      result.selected_arms.length > 0,
      `${result.selected_arms.length} selected, baseline=${result.is_baseline}`,
    );
  }

  // Observe x 10
  for (let i = 0; i < OBSERVE_OUTCOMES.length; i++) {
    const obs = OBSERVE_OUTCOMES[i]!;
    const armId = ARM_CANDIDATES[obs.armIdx]!.id;
    const result = await client.observe(armId, obs.outcome, { reward: obs.reward });
    check(
      `learning.observe[${i}]`,
      result !== null,
      `${armId} → ${obs.outcome} (r=${obs.reward})`,
    );
  }

  // Session end
  if (session?.session_id) {
    const end = await client.sessionEnd(session.session_id);
    check("learning.sessionEnd", end !== null, `ended session ${end?.session_id}`);
  }

  log("");
}

// ── Phase 3: Prometheus assertions ───────────────────────────────────────────

async function phase3(): Promise<void> {
  log("Phase 3: Prometheus metric assertions\n");

  // -- Memory metrics --
  const memoryMetrics: Array<{
    expr: string;
    name: string;
    pred: (v: number) => boolean;
    desc: string;
  }> = [
    {
      expr: "qortex_queries_total",
      name: "queries_total",
      pred: (v) => v >= 10,
      desc: ">= 10",
    },
    {
      expr: "qortex_query_duration_seconds_sum",
      name: "query_duration_sum",
      pred: (v) => v > 0,
      desc: "> 0",
    },
    {
      expr: "qortex_vec_search_duration_seconds_sum",
      name: "vec_search_duration_sum",
      pred: (v) => v > 0,
      desc: "> 0",
    },
    {
      expr: 'sum(qortex_feedback_total{outcome="accepted"})',
      name: "feedback_accepted",
      pred: (v) => v > 0,
      desc: "accepted present",
    },
    {
      expr: 'sum(qortex_feedback_total{outcome="rejected"})',
      name: "feedback_rejected",
      pred: (v) => v > 0,
      desc: "rejected present",
    },
    {
      expr: "qortex_factor_updates_total",
      name: "factor_updates_total",
      pred: (v) => v > 0,
      desc: "> 0",
    },
    {
      expr: "qortex_factor_mean",
      name: "factor_mean",
      pred: (v) => v !== 1.0,
      desc: "!= 1.0 (learning happened)",
    },
    {
      expr: "qortex_factor_entropy",
      name: "factor_entropy",
      pred: (v) => v > 0,
      desc: "> 0",
    },
  ];

  for (const m of memoryMetrics) {
    try {
      const result = await promQuery(m.expr);
      assertMetric(result, m.name, m.pred, m.desc);
    } catch (err) {
      check(`prom.${m.name}`, false, String(err));
    }
  }

  // -- Learning metrics --
  const learningMetrics: Array<{
    expr: string;
    name: string;
    pred: (v: number) => boolean;
    desc: string;
  }> = [
    {
      expr: "qortex_learning_selections_total",
      name: "learning_selections_total",
      pred: (v) => v > 0,
      desc: "> 0",
    },
    {
      expr: "qortex_learning_observations_total",
      name: "learning_observations_total",
      pred: (v) => v > 0,
      desc: "> 0",
    },
    {
      expr: "qortex_learning_posterior_mean",
      name: "learning_posterior_mean",
      pred: () => true, // just needs to exist
      desc: "exists",
    },
    {
      expr: "qortex_learning_arm_pulls_total",
      name: "learning_arm_pulls_total",
      pred: (v) => v > 0,
      desc: "> 0",
    },
  ];

  for (const m of learningMetrics) {
    try {
      const result = await promQuery(m.expr);
      assertMetric(result, m.name, m.pred, m.desc);
    } catch (err) {
      check(`prom.${m.name}`, false, String(err));
    }
  }

  // -- Credit propagation metrics (optional) --
  const creditEnabled = process.env.QORTEX_CREDIT_PROPAGATION === "on";
  const creditMetrics = [
    { expr: "qortex_credit_propagations_total", name: "credit_propagations_total", desc: "> 0" },
    { expr: "qortex_credit_concepts_per_propagation_sum", name: "credit_concepts_sum", desc: "> 0" },
    { expr: "qortex_credit_alpha_delta_total", name: "credit_alpha_delta", desc: "> 0" },
    { expr: "qortex_credit_beta_delta_total", name: "credit_beta_delta", desc: "> 0" },
  ];

  for (const m of creditMetrics) {
    if (!creditEnabled) {
      skip(`prom.${m.name}`, "QORTEX_CREDIT_PROPAGATION != on");
      continue;
    }
    try {
      const result = await promQuery(m.expr);
      assertMetric(result, m.name, (v) => v > 0, m.desc);
    } catch (err) {
      check(`prom.${m.name}`, false, String(err));
    }
  }

  log("");
}

// ── Phase 4: Grafana cross-check ─────────────────────────────────────────────

async function phase4(): Promise<void> {
  log("Phase 4: Grafana datasource cross-check\n");

  // Core metrics to verify through Grafana
  const coreExprs = [
    "qortex_queries_total",
    "qortex_feedback_total",
    "qortex_learning_selections_total",
    "qortex_learning_observations_total",
  ];

  for (const expr of coreExprs) {
    try {
      const result = await grafanaQuery(expr);
      const hasData =
        result.status === "success" && (result.data?.result?.length ?? 0) > 0;
      check(`grafana.${expr}`, hasData, hasData ? "visible in Grafana" : "no data via Grafana proxy");
    } catch (err) {
      check(`grafana.${expr}`, false, String(err));
    }
  }

  // Credit metrics through Grafana (optional)
  if (process.env.QORTEX_CREDIT_PROPAGATION === "on") {
    for (const expr of ["qortex_credit_propagations_total", "qortex_credit_alpha_delta_total"]) {
      try {
        const result = await grafanaQuery(expr);
        const hasData = result.status === "success" && (result.data?.result?.length ?? 0) > 0;
        check(`grafana.${expr}`, hasData, hasData ? "visible in Grafana" : "no data");
      } catch (err) {
        check(`grafana.${expr}`, false, String(err));
      }
    }
  }

  log("");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n========================================");
  console.log("  Grafana E2E Dogfood (Memory + Learning)");
  console.log("========================================\n");

  log(`qortex dir: ${QORTEX_DIR}`);
  log(`Prometheus: ${PROMETHEUS_HOST}:${PROMETHEUS_PORT}`);
  log(`Grafana:    ${GRAFANA_HOST}:${GRAFANA_PORT}`);
  log(`OTel:       ${OTEL_HOST}:4318`);
  log(`Credit:     ${process.env.QORTEX_CREDIT_PROPAGATION === "on" ? "ON" : "off"}`);
  log("");

  // Pre-flight: check services are reachable
  log("Port check:\n");
  const portsOk = await checkPorts();
  if (!portsOk) {
    console.error(
      "\nObservability stack not fully reachable. Start it with:\n" +
        "  cd ../qortex-track-c/docker && docker compose up -d\n\n" +
        "From sandbox, also open UFW ports:\n" +
        '  sudo ufw allow out to $(getent hosts host.lima.internal | awk \'{print $1}\') port 9091 proto tcp\n' +
        '  sudo ufw allow out to $(getent hosts host.lima.internal | awk \'{print $1}\') port 3010 proto tcp\n',
    );
    process.exit(1);
  }
  log("");

  // Shared qortex MCP connection for both memory + learning
  const qortexCommand = `uv run --project ${QORTEX_DIR} qortex mcp-serve`;
  const { command, args } = parseCommandString(qortexCommand);
  const connection = new QortexMcpConnection({ command, args });
  await connection.init();
  check("shared.connection", connection.isConnected, "qortex MCP subprocess up");
  log("");

  // Build providers using the shared connection
  const config = resolveQortexConfig(
    { command: qortexCommand },
    "dogfood-grafana",
  );
  const memProvider = new QortexMemoryProvider(
    config,
    "dogfood-grafana",
    { agents: { list: [{ id: "dogfood-grafana", default: true }] } } as any,
    connection,
  );
  const learningClient = new QortexLearningClient(connection, "openclaw-dogfood");

  try {
    await phase1(memProvider);
    await phase2(learningClient);

    // Wait for OTel export → Prometheus scrape
    log(`Waiting ${FLUSH_WAIT_SECS}s for metrics to flush...\n`);
    for (let i = FLUSH_WAIT_SECS; i > 0; i--) {
      process.stdout.write(`\r  ${i}s remaining...  `);
      await sleep(1000);
    }
    process.stdout.write("\r                       \n");
    log("");

    await phase3();
    await phase4();
  } finally {
    await connection.close();
  }

  // Summary
  console.log("========================================");
  console.log(`  ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
  console.log("========================================");

  if (failed.length > 0) {
    console.log("\nFailed checks:");
    for (const f of failed) console.log(`  - ${f}`);
    process.exit(1);
  }

  console.log("\nAll checks passed. Memory + Learning metrics are LIVE in Grafana.");
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
