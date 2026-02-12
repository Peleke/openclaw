# OpenClaw

<p align="center" style="font-size: 4em; margin: 0.5em 0;">
  <img src="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png" alt="OpenClaw" width="360">
</p>

<p align="center" style="font-style: italic; color: #888; margin-bottom: 2em;">
  This is not a fork. It's a claw with opinions.
</p>

---

**OpenClaw** is an opinionated distribution of [openclaw](https://github.com/openclaw/openclaw) — the WhatsApp/Telegram/Discord/iMessage gateway for AI agents.

This fork adds **observability layers** that make your AI usage accountable, measurable, and improvable:

## Modules

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5em; margin: 2em 0;">

<div style="border: 1px solid #2FBF71; border-radius: 8px; padding: 1.2em; background: #0d1117; color: #c9d1d9;">
<h3 style="color: #2FBF71; margin-top: 0;">Green</h3>
<p>Environmental impact tracking for AI inference. Carbon emissions, water usage, confidence scoring, and compliance exports (GHG Protocol, CDP, TCFD, ISO 14064).</p>
<p><strong>Status:</strong> Shipped</p>
<p><a href="green/" style="color: #58a6ff;">Docs &rarr;</a></p>
</div>

<div style="border: 1px solid #6C63FF; border-radius: 8px; padding: 1.2em; background: #0d1117; color: #c9d1d9;">
<h3 style="color: #6C63FF; margin-top: 0;">Learning</h3>
<p>Thompson Sampling bandit that learns which tools and system prompt sections help vs. hurt. Baseline A/B tracking, posterior visualization, and token savings analysis.</p>
<p><strong>Status:</strong> Shipped</p>
<p><a href="learning/" style="color: #58a6ff;">Docs &rarr;</a></p>
</div>

<div style="border: 1px solid #FF6B35; border-radius: 8px; padding: 1.2em; background: #0d1117; color: #c9d1d9;">
<h3 style="color: #FF6B35; margin-top: 0;">Cadence</h3>
<p>Ambient intelligence via typed signals, sources, and responders. The gateway reacts to events (vault edits, cron ticks, state transitions) without being asked.</p>
<p><strong>Status:</strong> Shipped (core bus + P1 responders)</p>
<p><a href="cadence/" style="color: #58a6ff;">Docs &rarr;</a></p>
</div>

</div>

## Why a fork?

Upstream OpenClaw is a great gateway. But we wanted to answer questions it doesn't:

- **How much carbon does my AI usage produce?** (Green)
- **Which tools actually help the agent?** (Learning)
- **Can the system prompt get smaller without getting worse?** (Learning)
- **Can the gateway react to events without being asked?** ([Cadence](https://peleke.github.io/cadence/) — ambient intelligence via signals and responders)
- **Can we isolate agent execution beyond Docker?** ([OpenClaw Sandbox](https://peleke.github.io/openclaw-sandbox/) — process-level isolation for defense-in-depth around the built-in Docker sandbox)

Green and Learning run as **always-on, zero-config layers** inside the gateway. No opt-in, no setup. Data from the first request. Cadence and Sandbox are companion packages that plug in alongside.

## Quick links

| What | Where |
|------|-------|
| Green quick start | [5-minute walkthrough](green/getting-started/quick-start.md) |
| Green CLI reference | [All `openclaw green` commands](green/guides/cli-reference.md) |
| Green API reference | [REST endpoints](green/guides/api-reference.md) |
| Green dashboard | [Chart.js visualizations](green/guides/dashboard.md) |
| Standards compliance | [GHG Protocol](green/standards/ghg-protocol.md), [CDP](green/standards/cdp-climate.md), [TCFD](green/standards/tcfd.md), [ISO 14064](green/standards/iso-14064.md) |
| Learning quick start | [8-step walkthrough](learning/getting-started/quick-start.md) |
| Learning CLI reference | [All `openclaw learning` commands](learning/guides/cli-reference.md) |
| Learning API reference | [REST endpoints](learning/guides/api-reference.md) |
| Learning dashboard | [Thompson Sampling visualizations](learning/guides/dashboard.md) |
| Thompson Sampling theory | [How the bandit works](learning/theory/thompson-sampling.md) |
| Cadence overview | [Signals, sources, responders](cadence/index.md) |
| Cadence quick start | [Wire your first responder](cadence/getting-started/quick-start.md) |
| Cadence signal reference | [All signal types](cadence/reference/signals.md) |
| Source | [github.com/Peleke/openclaw](https://github.com/Peleke/openclaw) |

---

<p align="center" style="color: #555; font-size: 0.9em;">
  Built by <a href="https://github.com/Peleke">Peleke</a> + Claude.
  Lobster not included.
</p>
