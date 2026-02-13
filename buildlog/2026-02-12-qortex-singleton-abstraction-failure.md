# Build Journal: Qortex Singleton Connection + The Abstraction Failure

**Date:** 2026-02-12
**Duration:** ~4 hours (across two sessions)
**Status:** Complete (Path A); Path B planned

---

## The Goal

Get live Telegram messages to fire qortex memory + learning metrics that show up in Grafana dashboards. The qortex MCP subprocess was dying before OTel could flush, SentenceTransformer was reloading on every request (~10s), and the gateway was spawning 4 separate connections per message.

---

## What We Built

### Architecture

```
Before (broken):
  Telegram msg -> gateway -> attempt.ts -> NEW QortexMcpConnection -> select -> DIES (no flush)
                          -> run.ts     -> NEW QortexMcpConnection -> observe -> DIES
                          -> memory     -> NEW QortexMcpConnection -> search -> DIES
                          -> learning API -> NEW QortexMcpConnection (lazy)
  Result: 4 subprocesses, 4x SentenceTransformer loads, 0 metrics reaching Prometheus

After (fixed):
  Gateway boot -> ONE QortexMcpConnection -> setSharedQortexConnection()
  Telegram msg -> gateway -> attempt.ts -> getSharedQortexConnection() -> select (reuse)
                          -> run.ts     -> getSharedQortexConnection() -> observe (reuse)
                          -> memory     -> getSharedQortexConnection() -> search (reuse)
                          -> learning API -> getSharedQortexConnection() (reuse)
  Result: 1 subprocess, 1 model load, OTel flushes normally
```

### Components

| Component | Status | Notes |
|-----------|--------|-------|
| QortexConnection interface | Working | Transport-agnostic; MCP now, REST later |
| Singleton get/set | Working | Process-level, set at gateway boot |
| Gateway boot wiring | Working | Eager init, only exposed after connected |
| Agent runner threading | Working | 3 call sites pass shared conn |
| Memory plugin threading | Working | memory-core passes shared conn to tool factories |
| Tests | Working | 3 new tests for singleton, gauntlet clean |

---

## The Journey

### Phase 1: Diagnosing zero metrics

**What we tried:**
Deployed the learning bridge code to sandbox, set learning.phase to "active", sent Telegram messages.

**What happened:**
Qortex spawned, loaded SentenceTransformer, answered the query, then immediately exited. OTel batch exporter never got a chance to flush. Zero metrics in Prometheus.

**Lesson:**
MCP subprocess lifecycle is fundamentally incompatible with OTel batch export. Process must stay alive.

### Phase 2: The 4-connection disaster

**What we tried:**
First implementation created the singleton but initially only wired it to attempt.ts. Did not audit all spawn sites.

**What happened:**
Owner caught it immediately. Four separate `new QortexMcpConnection()` calls across the codebase, each spawning its own subprocess. The "singleton" was only used by one of four consumers.

**Lesson:**
When consolidating to a singleton, grep for ALL construction sites of the thing you're replacing. Do not assume you found them all.

### Phase 3: The abstraction failure (CRITICAL)

**What we tried:**
Built the entire singleton plumbing using the concrete `QortexMcpConnection` class everywhere. Types, params, function signatures, plugin API. All hardcoded to the MCP implementation.

**What happened:**
Owner called it out: we KNOW REST transport is coming (Peleke/qortex#63 is literally the next task). We shipped a concrete class through 18 files when we should have shipped an interface from the start. Had to go back and extract `QortexConnection` interface, update every type reference.

THIS IS THE EXACT FAILURE PATTERN THAT MOTIVATED THE QORTEX WORK IN THE FIRST PLACE. AI coding agents consistently fail to abstract obvious protocol boundaries. Every. Single. Time.

**The fix:**
Created `src/qortex/types.ts` with `QortexConnection` interface. Updated `QortexMcpConnection implements QortexConnection`. Changed all 18 files to use the interface type. Concrete class only imported where `new` is called.

**Lesson:**
**When you are building a transport/protocol/communication layer, ALWAYS start with an interface.** Not "we'll extract it later." Not "the callers pass it opaquely so it's fine." Define the contract FIRST, implement SECOND. This is not optional. This is not a nice-to-have. This is the single most common architectural mistake in this codebase and it happens because the agent sees the immediate task (make it work with MCP) and doesn't think about the next task (make it work with REST) even when that task is EXPLICITLY KNOWN AND PLANNED.

---

## Test Results

### Connection singleton tests

**Command:**
```bash
pnpm vitest run src/qortex/connection.test.ts
```

**Result:** 16 passed (13 existing + 3 new singleton tests)

### Full suite

**Command:**
```bash
pnpm test
```

**Result:** 5803 passed, 37 skipped, 0 failed

### Gauntlet

**Result:** Clean after iteration 2. Fixed: missing singleton tests, race condition (set before init), em-dashes in comments.

---

## Code Samples

### The interface (what should have existed from commit 1)

```typescript
// src/qortex/types.ts
export interface QortexConnection {
  readonly isConnected: boolean;
  init(): Promise<void>;
  callTool(
    name: string,
    args: Record<string, unknown>,
    opts?: { timeout?: number },
  ): Promise<unknown>;
  close(): Promise<void>;
}
```

Four methods. That's it. This is all that `QortexMemoryProvider`, `QortexLearningClient`, and every call site actually uses. When `QortexHttpClient` lands, it implements this interface and zero call sites change.

---

## What's Left

- [ ] Deploy to sandbox, restart gateway, verify metrics reach Grafana
- [ ] Push to learning/qortex-bridge, update PR #70
- [ ] Path B: implement QortexHttpClient (REST transport) per plan from agent a12edd1
- [ ] Add learning REST endpoints to qortex FastAPI (Peleke/qortex#63)
- [ ] Pre-download SentenceTransformer at provisioning time (less urgent with singleton)

---

## AI Experience Reflection

### What Was Frustrating

The agent (me) made the same architectural mistake that has been documented, discussed, and explicitly called out in prior sessions. Despite having the Path B plan running in the background, despite KNOWING the REST transport was coming, the initial implementation hardcoded the concrete MCP class everywhere. This is not a knowledge gap. The information was available. It's a cognitive pattern failure: the agent optimizes for "make this work now" and does not apply the design principle of "abstract at protocol boundaries" unless explicitly forced to.

### Communication Notes

Owner had to interrupt mid-implementation to point out the missing abstraction. The agent then wrote a long explanation of why it would be fine to extract the interface later. It would not have been fine. The owner was right. When the owner says "clownish," they mean it.

---

## Improvements

### Architectural

- **ALWAYS extract an interface when building transport/protocol/communication layers.** Not later. Not "when we need it." Now. If you are writing `new ConcreteTransport()` in more than one file, you already needed the interface yesterday.
- When consolidating to a singleton, `grep -r` for ALL construction sites of the class. Audit every one.
- When setting a shared resource, ensure it is fully initialized before exposing it (avoid the set-before-init race).

### Workflow

- Do not start implementing before the user finishes their sentence. Wait for explicit go-ahead.
- Run gauntlet_loop BEFORE committing, not after being asked.
- When the user calls something out as wrong, do not explain why it's "actually fine." Fix it.

### Domain Knowledge

- MCP subprocess lifecycle is incompatible with OTel batch export; process must persist.
- SentenceTransformer model load is ~10s cold start; singleton amortizes this to once per gateway boot.
- `bilrost restart` is the correct command for sandbox gateway restart, not manual pkill/systemctl.

---

## Files Changed

```
src/qortex/
  types.ts              # NEW: QortexConnection interface
  connection.ts         # Singleton get/set, implements interface
  connection.test.ts    # 3 new singleton tests
src/gateway/
  server-runtime-state.ts  # Shared connection at boot
src/agents/pi-embedded-runner/
  run.ts                # Learning observe uses shared conn
  run/attempt.ts        # Learning select uses shared conn
  run/params.ts         # Type: QortexConnection
  run/types.ts          # Type: QortexConnection
src/auto-reply/reply/
  agent-runner-execution.ts  # Passes shared conn
  agent-runner-memory.ts     # Passes shared conn
  followup-runner.ts         # Passes shared conn
src/memory/
  providers/qortex.ts   # Type: QortexConnection
  providers/index.ts    # Type: QortexConnection
  search-manager.ts     # Type: QortexConnection
src/agents/tools/
  memory-tool.ts        # Type: QortexConnection
src/learning/
  qortex-client.ts      # Constructor takes QortexConnection
src/plugins/runtime/
  index.ts              # Exposes getSharedQortexConnection
  types.ts              # Type for plugin API
extensions/memory-core/
  index.ts              # Passes shared conn to tool factories
```

---

*Next: deploy to sandbox, verify metrics flow, then Path B (QortexHttpClient).*
