---
summary: "How OpenClaw connects to qortex for graph-enhanced memory search"
read_when:
  - You want to set up qortex as the memory provider
  - You want to understand the connection between gateway and qortex
  - You're debugging qortex memory search
---

# Qortex Integration

qortex is a knowledge graph server that provides graph-enhanced memory search.
Instead of flat vector similarity, qortex combines embeddings with Personalized
PageRank over a typed graph to surface structurally relevant results. It also
supports Thompson Sampling feedback to improve retrieval over time.

## How it connects

The gateway supports two transport modes for qortex: **stdio** (child process)
and **HTTP** (plain REST). A single shared connection is created at gateway
boot; both the memory provider and the learning client reuse it.

### stdio transport (default)

The gateway spawns qortex as a child process communicating over stdio MCP:

```
OpenClaw Gateway
  └─ QortexMcpConnection (stdio)
       └─ qortex mcp-serve (Python subprocess)
            ├─ Vec layer (embeddings + similarity search)
            ├─ Graph layer (Memgraph or in-memory)
            └─ Learning layer (Thompson Sampling bandits)
```

The connection forwards environment variables matching these prefixes to
the subprocess: `QORTEX_*`, `OTEL_*`, `VIRTUAL_ENV`, `HF_*`, `MEMGRAPH_*`.

### HTTP transport

When `memorySearch.qortex.transport` is `"http"`, the gateway connects to a
running qortex REST API over plain HTTP instead of spawning a subprocess:

```
OpenClaw Gateway
  └─ QortexRestConnection (fetch)
       └─ POST http://localhost:8400/v1/query
       └─ POST http://localhost:8400/v1/ingest/message
       └─ ...
            └─ qortex.service (systemd)
                 ├─ Vec layer
                 ├─ Graph layer
                 └─ Learning layer
```

The gateway makes direct HTTP calls to qortex's REST endpoints (e.g.,
`POST /v1/query`, `POST /v1/ingest/message`) using `fetch()`. There is no
MCP protocol layer between gateway and qortex in HTTP mode.

This is the recommended mode for sandbox deployments where `qortex.service`
runs as a persistent systemd service. No subprocess management, no environment
variable forwarding — the service has its own environment via systemd
`EnvironmentFile`.

## Gateway config

Set qortex as the memory provider:

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        provider: "qortex"
      }
    }
  }
}
```

### Config keys

| Key | Default | Description |
|-----|---------|-------------|
| `memorySearch.provider` | `"openai"` | Set to `"qortex"` to enable graph-enhanced search. |
| `memorySearch.qortex.command` | `"uvx qortex mcp-serve"` | Server command to spawn (stdio transport). |
| `memorySearch.qortex.transport` | `"stdio"` | Transport mode: `"stdio"` (subprocess) or `"http"` (plain REST). |
| `memorySearch.qortex.http.baseUrl` | -- | qortex REST API base URL (required when transport is `"http"`). |
| `memorySearch.qortex.domains` | `["memory/{agentId}"]` | qortex domains to query. Auto-mapped per agent. |
| `memorySearch.qortex.topK` | `10` | Max results per query. |
| `memorySearch.qortex.feedback` | `true` | Enable `memory_feedback` tool for Thompson Sampling. |

### Full example (stdio)

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        provider: "qortex",
        qortex: {
          command: "uvx qortex mcp-serve",
          domains: ["memory/main"],
          topK: 15,
          feedback: true
        }
      }
    }
  }
}
```

### Full example (HTTP transport)

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        provider: "qortex",
        qortex: {
          transport: "http",
          http: {
            baseUrl: "http://localhost:8400"
          },
          domains: ["memory/main"],
          topK: 15,
          feedback: true
        }
      }
    }
  }
}
```

The HTTP transport is automatically configured by the Bilrost provisioner when
`qortex_serve_enabled` is true. The `learning` config block also supports the
same `transport` and `http.baseUrl` keys.

## Available operations

Once connected, the gateway calls qortex's API. In stdio mode, operations
are invoked as MCP tools; in HTTP mode, the gateway calls the equivalent
REST endpoints directly (e.g., `POST /v1/query`). The memory provider uses
these operations:

### Core tools

| Tool | Used by | Purpose |
|------|---------|---------|
| `qortex_query` | `memory_search` | Retrieve relevant knowledge (vec + graph PPR). |
| `qortex_feedback` | `memory_feedback` | Report accepted/rejected outcomes to improve retrieval. |
| `qortex_ingest` | `sync()` | Ingest a workspace file into the graph. |
| `qortex_ingest_message` | online ingest | Index a conversation turn (chunking + embedding, no LLM). |
| `qortex_ingest_tool_result` | online ingest | Index a tool's output text. |
| `qortex_domains` | status | List available knowledge domains. |
| `qortex_status` | status | Server health and backend info. |

### Learning tools

| Tool | Purpose |
|------|---------|
| `qortex_learning_select` | Select items using adaptive Thompson Sampling. |
| `qortex_learning_observe` | Record outcome for a selected item. |
| `qortex_learning_posteriors` | Inspect posterior distributions. |
| `qortex_learning_metrics` | Aggregate learning metrics. |

### Additional tools

qortex also exposes vector-level operations (`qortex_vector_*`), source
operations (`qortex_source_*`), and graph exploration operations
(`qortex_explore`, `qortex_rules`, `qortex_compare`, `qortex_stats`). See
the [qortex API reference](https://github.com/Peleke/qortex) for the full
list.

## Online auto-ingest

When qortex is the active memory provider, the gateway automatically indexes
conversation turns into the graph. After each agent turn completes, a
fire-and-forget call sends the user prompt and assistant responses to
`qortex_ingest_message`. This runs concurrently via `Promise.allSettled`
and never blocks the conversation.

See [Online Ingest](online-ingest) for details.

## Domain model

qortex organizes knowledge into **domains**. The default convention is
`memory/{agentId}`, mapping each OpenClaw agent to its own graph partition.

```
memory/main     ← default agent
memory/work     ← "work" agent
memory/home     ← "home" agent
```

Override this with `memorySearch.qortex.domains`:

```json5
{
  memorySearch: {
    qortex: {
      domains: ["project/acme", "memory/main"]
    }
  }
}
```

Queries search across all listed domains. Ingest writes to the first domain.

## Verifying it works

### memory_search tool

From any conversation, ask the agent to search memory. With qortex active,
results include graph scores and optional rules:

```
> Search memory for "deployment checklist"
```

The response includes `score` (combined vec + PPR), `domain`, and any
matching rules from the knowledge graph.

### openclaw memory status

```bash
openclaw memory status --deep
```

Shows the qortex provider status, connection state, and configured domains.

### Grafana dashboard

If the observability stack is running:

```bash
open http://localhost:3010/d/qortex-main/qortex-observability
```

Key panels to check:
- **Query Rate** and **Query Latency**: confirm queries are flowing.
- **KG Growth**: nodes and edges increasing from online ingest.
- **Vec Index Size**: embeddings accumulating.

### Memgraph Lab

When using the Memgraph backend:

```bash
open http://localhost:3000
```

Run a Cypher query to inspect the graph:

```cypher
MATCH (n:Concept {domain: "memory/main"})
RETURN n.name, n.domain
LIMIT 20;
```

## Environment variables

These are forwarded to the qortex subprocess automatically:

| Variable | Description |
|----------|-------------|
| `QORTEX_GRAPH` | Graph backend: `memory` (default) or `memgraph`. |
| `QORTEX_VEC` | Vec backend: `sqlite` (default) or `memory`. |
| `MEMGRAPH_HOST` | Memgraph host (default `localhost`). |
| `MEMGRAPH_PORT` | Memgraph Bolt port (default `7687`). |
| `MEMGRAPH_USER` | Memgraph auth username. |
| `MEMGRAPH_PASSWORD` | Memgraph auth password. |
| `QORTEX_OTEL_ENABLED` | Enable OTel metrics/traces export. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTel Collector endpoint. |

## Next steps

- [Online Ingest](online-ingest) -- auto-indexing conversation turns
- [Memory](/concepts/memory) -- OpenClaw memory architecture
