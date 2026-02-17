---
summary: "How OpenClaw auto-indexes conversation turns into qortex"
read_when:
  - You want to understand online auto-indexing
  - You're debugging why conversation context isn't being indexed
  - You want to monitor graph growth from conversations
---

# Online Ingest

When qortex is the active memory provider, OpenClaw automatically indexes
every conversation turn into the knowledge graph. This builds a searchable
graph of session context without any user action.

## What it does

After each agent turn, the gateway calls `qortex_ingest_message` for:
1. The user's prompt (role: `user`)
2. Each assistant response (role: `assistant`)

Each message is chunked, embedded, stored as ConceptNodes in the graph,
and linked with CO_OCCURS edges. The graph grows continuously as
conversations happen.

## How it works

```
User message / Assistant response
  │
  ▼
SentenceBoundaryChunker
  │  splits text at sentence boundaries
  │  max_tokens=256, overlap_tokens=32
  │  deterministic chunk IDs (SHA-256)
  ▼
EmbeddingModel.embed(chunks)
  │  batch embed all chunks
  ▼
VectorIndex.add(ids, embeddings)
  │  add to vec layer for similarity search
  ▼
GraphBackend.add_node(ConceptNode)
  │  one node per chunk (name = first 80 chars, description = full text)
  ▼
GraphBackend.add_edge(CO_OCCURS)
  │  consecutive chunks get co-occurrence edges (confidence=0.8)
  ▼
emit(GraphNodesCreated, GraphEdgesCreated)
     observability events for Grafana/Prometheus
```

### Fire-and-forget

Online ingest uses `Promise.allSettled` to run all ingest calls
concurrently. Failures are logged at debug level and never propagate to
the conversation. Indexing must never block or break the user experience.

```typescript
// From src/qortex/online-ingest.ts
const results = await Promise.allSettled(calls);
// failures logged, never thrown
```

The ingest timeout is 10 seconds per call.

## Current state

Online ingest currently stores **raw text** as ConceptNodes with
co-occurrence edges. This is the M2 (Milestone 2) implementation.

M3 will add:
- Concept extraction (named entities, topics, relationships)
- Typed edges beyond co-occurrence (CAUSES, REQUIRES, RELATES_TO)
- Cross-session edge merging

For now, retrieval quality comes from the combination of vector similarity
and graph structure (PPR over co-occurrence edges + any manually ingested
knowledge).

## Configuration

### Domain

The ingest domain is resolved from `memorySearch.qortex.domains[0]`,
falling back to `memory/main` if not configured.

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        provider: "qortex",
        qortex: {
          domains: ["memory/main"]
          // ingest writes to domains[0] = "memory/main"
        }
      }
    }
  }
}
```

### When it triggers

Online ingest runs after each agent turn completes in the embedded Pi
runner. It only fires when:
1. The qortex connection is active (`connection.isConnected`)
2. The user prompt or assistant response has non-empty text

There is no separate config toggle. If `memorySearch.provider = "qortex"`,
online ingest is active.

## Monitoring

### Grafana panels

The qortex Grafana dashboard (`qortex-main`) has a **KG Growth** section
that tracks online ingest:

| Panel | Metric | What it shows |
|-------|--------|---------------|
| Total Nodes | `qortex_graph_nodes_created_total` | Lifetime ConceptNodes created. |
| Total Edges | `qortex_graph_edges_created_total` | Lifetime edges created. |
| Nodes vs Edges | Both metrics over time | Growth rate correlation. |
| By Origin | `sum by (origin)` | Breakdown: `online_index` vs `manifest` vs `co_occurrence`. |

### Jaeger traces

When OTel is enabled, each `qortex_ingest_message` call produces a trace
showing:
- Chunking duration
- Embedding batch size and latency
- VectorIndex add latency
- Graph node/edge creation

```bash
open http://localhost:16686
# Search service "qortex", operation "qortex_ingest_message"
```

### Observability events

The qortex subprocess emits these events per ingest call:

| Event | Fields |
|-------|--------|
| `MessageIngested` | `session_id`, `role`, `domain`, `chunk_count`, `concept_count`, `edge_count`, `latency_ms` |
| `ToolResultIngested` | `tool_name`, `session_id`, `domain`, `concept_count`, `edge_count`, `latency_ms` |
| `GraphNodesCreated` | `count`, `domain`, `origin="online_index"` |
| `GraphEdgesCreated` | `count`, `domain`, `origin="co_occurrence"` |

## Troubleshooting

**No graph growth after conversations:**
1. Check `memorySearch.provider` is `"qortex"` (not `"openai"` or `"local"`).
2. Verify the qortex subprocess is running: `openclaw memory status --deep`.
3. Check gateway logs for `[qortex]` stderr output.
4. Ensure `QORTEX_GRAPH=memgraph` is set if you expect persistent storage.

**High ingest latency:**
- Embedding is usually the bottleneck. Check `vec.embed.*` spans in Jaeger.
- If using sentence-transformers, the first call loads the model (~2-5s).
  Subsequent calls are fast.

**Missing co-occurrence edges:**
- Single-sentence messages produce one chunk, so no co-occurrence edge is
  created. This is expected. Longer messages produce multiple chunks with
  edges between them.
