# Build Journal: Fix silent empty response when agent calls excluded tool

**Date:** 2026-02-12
**Duration:** ~1 hour

## What I Did

Fixed #80: when the learning bandit excluded all tools, the agent produced empty responses because (a) `minPulls` was never forwarded to qortex's `qortex_learning_select`, so under-observed arms got excluded instead of explored, and (b) no system guidance told the model tools were unavailable. Added `min_pulls` forwarding through `qortex-client.ts` and `qortex-adapter.ts`, and created `excluded-tools-guidance.ts` to inject a system prompt fragment listing unavailable tools so the model can explain gracefully.

## What Went Wrong

Existing test for `select()` in `qortex-client.test.ts` used exact object matching on callTool args, so adding `min_pulls` broke it. Had to update the existing assertion to include the new field. Lesson: when extending an API with new optional params that default to a value, existing exact-match tests will break.

## What I Learned

### Improvements

- When adding optional params with defaults to an MCP callTool payload, check existing tests that use exact matching on that payload
- Pure helper modules (like `excluded-tools-guidance.ts`) are easy to test and keep the integration layer (`attempt.ts`) thin
- Gauntlet caught a valid edge case: arm IDs with embedded colons (e.g. `tool:exec:mcp:my:tool`) need a test since `parseArmId` reassembles split segments
