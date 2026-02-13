# Build Journal: Wire Qortex Learning Session Tracking on Gateway Hot Path

**Date:** 2026-02-13
**Duration:** ~4 hours (across 2 sessions)
**Issue:** #84

## What I Did

Wired qortex learning select/observe loop on the gateway hot path by closing three gaps:
1. `agentCommand` and cron never passed `qortexConnection` — fell back to expensive one-shot subprocesses. Now uses the shared gateway singleton via `getSharedQortexConnection()`.
2. No session tracking — `session_start`/`session_end` never called, so qortex couldn't correlate selects+observes within a single user turn. Now wraps the agent attempt loop.
3. Connection-acquisition boilerplate duplicated 2x across pi-embedded-runner. Extracted into `withLearningConnection<T>()` helper that handles shared vs one-shot, try/catch/finally, and returns null on error (non-blocking).

Files: `qortex-adapter.ts`, `run.ts`, `attempt.ts`, `agent.ts`, `cron/isolated-agent/run.ts` + tests.

## What Went Wrong

1. **Started implementing before plan was finalized.** First session, I jumped into code before the BMAD adversarial panel review finished. Had to revert everything and produce a proper Winston-fixed plan first. Lesson: plan mode exists for a reason.
2. **Arrow functions can't be constructors in vitest mocks.** `vi.fn().mockImplementation(() => ({...}))` fails with `"not a constructor"` when the mock is used with `new`. Fixed by using `function() { return {...}; }` instead.
3. **Partial vi.mock replaces entire module.** Mocking `../qortex/connection.js` with just `getSharedQortexConnection` broke `parseToolResult` import used elsewhere. Fixed with `importOriginal` pattern.
4. **Sandbox overlay stale file handles** caused gateway restart confusion during dogfood testing. The `sandbox_exec` prepends host-path `cd` commands that fail inside the VM, masking exit codes.

## What I Learned

### Improvements

- Always run BMAD adversarial panel review on the plan before touching code. The 2 CRITICALs + 5 MAJORs it found would have been expensive to fix after implementation.
- `withLearningConnection` pattern is reusable: acquire resource (shared or create), run callback, catch all errors, guarantee cleanup. Good candidate for extraction to a generic utility.
- Debug logs at `log.info` level for session_start/session_end are worth keeping during initial rollout to verify the pipeline in production without needing to grep debug-level logs.
- Dogfood verification script exists at `scripts/dogfood-grafana.ts` for full OTel pipeline validation.

### Gauntlet Results

0 criticals, 0 majors, 2 minors, 2 nitpicks. Clean pass.
- Minor: session lifecycle orchestration in run.ts lacks direct unit test (helper is tested, wiring is not).
- Minor: no test for qortexConnection pass-through in cron path (only agent.ts has one).
- Nitpick: non-null assertions in finally block bypass TS narrowing.
- Nitpick: log message format not asserted in tests.

### Dogfood Verification

Full pipeline confirmed on sandbox gateway:
```
session_start ok (sessionId=ccb6623c-757d-4611-8925-a6099d92e7c2)
  -> learning.selection: 23 arms (5668/8000 tokens, baseline=false)
  -> learning.observation: 23 observations
session_end (sessionId=ccb6623c-757d-4611-8925-a6099d92e7c2, result=ok)
```

Grafana metrics visible. No connection acquisition failures. Shared connection reused across all calls.
