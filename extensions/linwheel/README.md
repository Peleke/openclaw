# LinWheel

Agentic AI content surface for LinkedIn. A [Vindler](https://github.com/Peleke/openclaw) extension that turns engineering work into distribution.

## What It Does

LinWheel gives the agent a full LinkedIn content pipeline via 17 MCP tools. Drop raw content — an article, a build log, a commit summary — and the agent analyzes, reshapes, refines against a voice profile, drafts, generates visuals, and queues for your approval.

Nothing publishes without explicit approval. `post_approve` is a hard gate before `post_schedule` does anything.

## Tools

| Category | Tools | Description |
|----------|-------|-------------|
| Content Processing | `analyze`, `reshape`, `refine`, `split` | Analyze raw content, reshape for LinkedIn format, refine against active voice profile, split into multiple posts |
| Drafting | `draft`, `bundle` | Draft individual posts, bundle post + image + carousel in one call |
| Post Management | `posts_list`, `post_get`, `post_update`, `post_approve`, `post_schedule` | Full CRUD + approval gate + scheduling |
| Visuals | `post_image`, `post_carousel` | Generate images (5 style presets) and carousels (1-10 slides) |
| Voice Profiles | `voice_profiles_list`, `voice_profile_create`, `voice_profile_delete`, `voice_profile_activate` | Create and switch between voice profiles (technical, casual, executive) |

All 17 tools are registered as `optional: true` — they only activate when explicitly allowlisted in the plugin config.

## Content Angles

`reshape` supports 7 rhetorical angles: `contrarian`, `field_note`, `demystification`, `identity_validation`, `provocateur`, `synthesizer`, `curious_cat`.

## Refine Intensities

`refine` supports 3 levels: `light` (grammar only), `medium` (grammar + LinkedIn formatting), `heavy` (full rewrite preserving voice).

## Image Presets

`post_image` supports 5 styles: `typographic_minimal`, `gradient_text`, `dark_mode`, `accent_bar`, `abstract_shapes`.

## Configuration

```json
{
  "id": "linwheel",
  "config": {
    "apiKey": "...",
    "signingSecret": "...",
    "baseUrl": "https://api.linwheel.io",
    "timeout": 30000
  }
}
```

Or via environment: `LINWHEEL_API_KEY`, `LINWHEEL_SIGNING_SECRET`.

## The Feedback Loop

Ship code → agent captures what shipped → reshapes for the audience → queues for review → you approve or reject → approval decision feeds back into Vindler's learning loop → future drafts improve.

This is the content flywheel for build-in-public.

## Testing

33 unit tests covering the extension. 933 total tests across the full Vindler suite pass with zero new failures.

## Evolution

LinWheel started as a standalone Next.js app using Playwright and HMAC request signing to post through LinkedIn's unofficial API. It has since been rewritten as a Vindler extension — the agent interface is the product, the web UI is a demo.

## Package

`@openclaw/linwheel` · [Vindler](https://github.com/Peleke/openclaw) · [qlawbox](https://github.com/Peleke/openclaw-sandbox)
