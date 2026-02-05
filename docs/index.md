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

<div style="border: 1px solid #2FBF71; border-radius: 8px; padding: 1.2em; background: #0d1117;">
<h3 style="color: #2FBF71; margin-top: 0;">Green</h3>
<p>Environmental impact tracking for AI inference. Carbon emissions, water usage, confidence scoring, and compliance exports (GHG Protocol, CDP, TCFD, ISO 14064).</p>
<p><strong>Status:</strong> Shipped</p>
<p><a href="green/">Docs &rarr;</a></p>
</div>

<div style="border: 1px solid #6C63FF; border-radius: 8px; padding: 1.2em; background: #0d1117;">
<h3 style="color: #6C63FF; margin-top: 0;">Learning</h3>
<p>Thompson Sampling bandit that learns which tools and system prompt sections help vs. hurt. Baseline A/B tracking, posterior visualization, and token savings analysis.</p>
<p><strong>Status:</strong> Shipped (docs coming soon)</p>
<p><a href="#">Docs &rarr;</a></p>
</div>

</div>

## Why a fork?

Upstream OpenClaw is a great gateway. But we wanted to answer questions it doesn't:

- **How much carbon does my AI usage produce?** (Green)
- **Which tools actually help the agent?** (Learning)
- **Can the system prompt get smaller without getting worse?** (Learning)
- **Can the gateway react to events without being asked?** ([Cadence](https://github.com/Peleke/cadence) — ambient intelligence via signals and responders)
- **Can we isolate agent execution beyond Docker?** ([OpenClaw Sandbox](https://github.com/Peleke/openclaw-sandbox) — process-level isolation for defense-in-depth around the built-in Docker sandbox)

Green and Learning run as **always-on, zero-config layers** inside the gateway. No opt-in, no setup. Data from the first request. Cadence and Sandbox are companion packages that plug in alongside.

## Quick links

| What | Where |
|------|-------|
| Green quick start | [5-minute walkthrough](green/getting-started/quick-start.md) |
| Green CLI reference | [All `openclaw green` commands](green/guides/cli-reference.md) |
| Green API reference | [REST endpoints](green/guides/api-reference.md) |
| Green dashboard | [Chart.js visualizations](green/guides/dashboard.md) |
| Standards compliance | [GHG Protocol](green/standards/ghg-protocol.md), [CDP](green/standards/cdp-climate.md), [TCFD](green/standards/tcfd.md), [ISO 14064](green/standards/iso-14064.md) |
| Source | [github.com/Peleke/openclaw](https://github.com/Peleke/openclaw) |

---

<p align="center" style="color: #555; font-size: 0.9em;">
  Built by <a href="https://github.com/Peleke">Peleke</a> + Claude.
  Lobster not included.
</p>
