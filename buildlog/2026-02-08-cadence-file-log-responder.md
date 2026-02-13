# Build Journal: FileLogResponder + Cadence Start Wrapper

**Date:** 2026-02-08
**Duration:** ~30 min

## What I Did

Implemented Gap 1 (FileLogResponder) and Gap 5 (cadence-start.sh) from the Cadence wiring plan. The FileLogResponder appends every Cadence signal to a JSONL file, bridging signals into sandbox Docker containers via bind mounts. Also created `scripts/cadence-start.sh` as a launchd-friendly wrapper that loads secrets from `~/.openclaw/.env` before starting the Cadence pipeline.

Files: `src/cadence/responders/file-log.ts` (new), `src/cadence/responders/index.ts` (export), `src/cadence/config.ts` (fileLogPath config), `scripts/cadence.ts` (wiring), `scripts/cadence-start.sh` (new), `src/cadence/responders/file-log.test.ts` (new).

## What Went Wrong

Nothing major. Gauntlet flagged missing tests (major) and an em dash in the doc comment (minor). Both fixed in a follow-up commit before push.

## What I Learned

### Improvements

- Always write tests alongside new responder code; the gauntlet will catch you if you don't
- The `bus.onAny()` API from `@peleke.s/cadence` is clean for "catch-all" responders like file logging
- Em dashes in doc comments: use colons instead (Bragi rule)

PR: https://github.com/Peleke/openclaw/pull/66
