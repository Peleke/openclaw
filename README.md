# Vindler

**An instrumented agent runtime -- part of the [qlawbox](https://peleke.me/lab) stack.**

---

Vindler is a hardened fork of [OpenClaw](https://github.com/openclaw/openclaw), equipped with [qortex](https://github.com/Peleke/qortex)'s learning layer and sandboxed via [bilrost](https://github.com/Peleke/openclaw-sandbox). It turns a personal AI gateway into an observable, adaptive agent runtime.

## Modules

**Green** -- Environmental impact tracking for AI inference. Carbon emissions, water usage, confidence scoring, and compliance exports (GHG Protocol, CDP, TCFD, ISO 14064).

**Learning** -- Thompson Sampling bandit that learns which tools and system prompt sections help vs. hurt. Baseline A/B tracking, posterior visualization, and token savings analysis. Powered by [qortex](https://github.com/Peleke/qortex).

**Cadence** -- Ambient intelligence via typed signals, sources, and responders. The gateway reacts to events (vault edits, cron ticks, state transitions) without being asked.

## The qlawbox stack

| Component | Role | Docs |
|-----------|------|------|
| **vindler** | Agent runtime (this project) | [peleke.github.io/openclaw](https://peleke.github.io/openclaw/) |
| **[bilrost](https://github.com/Peleke/openclaw-sandbox)** | Hardened Lima VM with OverlayFS, UFW, dual-container Docker isolation | [Docs](https://peleke.github.io/openclaw-sandbox/) |
| **[qortex](https://github.com/Peleke/qortex)** | Knowledge graph with typed edges, adaptive learning, 7 framework adapters | [Docs](https://peleke.github.io/qortex/) |

## Install

Runtime: **Node >= 22**.

```bash
npm install -g openclaw@latest
# or: pnpm add -g openclaw@latest

openclaw onboard --install-daemon
```

The wizard installs the Gateway daemon (launchd/systemd user service) so it stays running.

## Quick start

```bash
openclaw onboard --install-daemon

openclaw gateway --port 18789 --verbose

# Send a message
openclaw message send --to +1234567890 --message "Hello from Vindler"

# Talk to the assistant
openclaw agent --message "Ship checklist" --thinking high
```

Upgrading? Run `openclaw doctor`.

## From source

Prefer `pnpm` for builds from source.

```bash
git clone https://github.com/Peleke/openclaw.git
cd openclaw

pnpm install
pnpm ui:build
pnpm build

pnpm openclaw onboard --install-daemon

# Dev loop (auto-reload on TS changes)
pnpm gateway:watch
```

## Configuration

Minimal `~/.openclaw/openclaw.json`:

```json5
{
  agent: {
    model: "anthropic/claude-opus-4-5"
  }
}
```

## Docs

Full documentation: [peleke.github.io/openclaw](https://peleke.github.io/openclaw/)

## License

MIT
