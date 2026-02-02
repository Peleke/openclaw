# Learning Layer — Implementation Plan

Persisted from plan mode. See full details in the original plan.

## Tactical Objectives
1. **PR 1 (NOW):** Passive RunTrace capture — start collecting data tonight
2. **PR 2:** Thompson Sampling selection (active learning)
3. **PR 3:** CLI reporting + config + lightweight dashboard

## File Structure
```
src/learning/
  types.ts                       Core types
  store.ts                       SQLite storage (run_traces, arm_posteriors)
  trace-capture.ts               Post-run hook: attempt result -> RunTrace
  reference-detection.ts         Was an arm "used" in assistant output?
  strategy.ts                    ThompsonStrategy (PR 2)
  pre-run.ts                     selectPromptComponents() (PR 2)
  update.ts                      updatePosteriors() (PR 2)
  baseline.ts                    Bernoulli baseline sampling (PR 2)
```

## Integration Point (PR 1)
- `src/agents/pi-embedded-runner/run.ts` (~5 lines post-run hook)
- `src/config/zod-schema.ts` (add learning schema)
- `src/config/types.base.ts` (add LearningConfig)

## Config
```json
{ "learning": { "enabled": true, "phase": "passive" } }
```

## Storage
Separate SQLite DB at `~/.openclaw/learning/learning.db`
