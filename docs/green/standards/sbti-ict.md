# SBTi ICT Sector Compliance

Guide for setting science-based emission reduction targets under SBTi ICT guidance.

## What is SBTi?

The [Science Based Targets initiative](https://sciencebasedtargets.org/) helps companies set emission reduction targets consistent with climate science. Targets are validated against pathways needed to limit warming to 1.5°C or 2°C.

## ICT Sector Guidance

SBTi provides [sector-specific guidance for ICT](https://sciencebasedtargets.org/sectors/ict) (Information and Communication Technology), including:

- Software and services companies
- Cloud computing providers
- Telecommunications

AI inference emissions fall under **software/services** using cloud infrastructure.

## Target Types

### Near-Term Targets (5-10 years)

Required for SBTi validation:

```bash
openclaw green targets:add \
  --name "2030 Near-Term" \
  --base-year 2025 \
  --target-year 2030 \
  --reduction 42 \
  --pathway 1.5C
```

For 1.5°C alignment: **≥42% reduction by 2030** (from 2020 or later base year)

### Long-Term Targets (by 2050)

Net-zero commitment:

```bash
openclaw green targets:add \
  --name "Net Zero 2050" \
  --base-year 2025 \
  --target-year 2050 \
  --reduction 90 \
  --pathway 1.5C
```

For net-zero: **≥90% reduction by 2050**

## Pathways

SBTi defines temperature-aligned pathways:

| Pathway | Near-Term Reduction | Ambition |
|---------|---------------------|----------|
| 1.5°C | ≥42% by 2030 | Highest |
| Well-below 2°C | ≥25% by 2030 | High |
| 2°C | ≥15% by 2030 | Minimum |

**Recommendation**: Use 1.5°C pathway for leadership position.

## Setting Targets

### 1. Establish Base Year

Choose a recent year with reliable data:

```bash
# Check current emissions
openclaw green status

# Emissions become base year reference
```

### 2. Create Target

```bash
openclaw green targets:add \
  --name "SBTi 1.5C Aligned" \
  --base-year 2025 \
  --target-year 2030 \
  --reduction 42 \
  --pathway 1.5C
```

### 3. Track Progress

```bash
openclaw green targets
```

Output:

```
Emission Reduction Targets

Target                      Reduction  Progress  Status
SBTi 1.5C Aligned (2025→2030)    42%      15.2%  ✓ On track
```

### 4. Report Annually

Export target progress:

```bash
openclaw green export --format tcfd --period 2026 --baseline 2025
```

## On-Track Calculation

Progress is calculated linearly:

```
Expected reduction at year Y:
  = (Y - base_year) / (target_year - base_year) × target_reduction

On track if:
  actual_reduction ≥ expected_reduction
```

Example:
- Base year: 2025 (100 kg)
- Target: 42% reduction by 2030
- Year 2027 (2 years in):
  - Expected: 2/5 × 42% = 16.8% reduction
  - Actual: 20% reduction → **On track**

## Reduction Strategies

### 1. Model Selection

Choose efficient models:

```bash
# Compare model efficiency
openclaw green status
# Look at "Top Models" - lower avg/request = more efficient
```

Smaller models (Haiku, GPT-4o-mini) are 5-10x more efficient than large models.

### 2. Caching

Cache reads are ~10% of input carbon:

- Enable prompt caching
- Reuse system prompts
- Cache common responses

### 3. Batching

Reduce per-request overhead:

- Batch similar requests
- Use longer contexts vs. multiple calls
- Optimize prompt length

### 4. Provider Selection

Compare provider efficiency:

```bash
openclaw green status
# Check provider breakdown
```

Some providers use more renewable energy.

### 5. Timing (Future)

When real-time grid data available:

- Schedule non-urgent requests for low-carbon times
- Use carbon-aware scheduling

## SBTi Submission

To submit targets for validation:

### 1. Commitment Letter

Sign the [SBTi commitment letter](https://sciencebasedtargets.org/step-by-step-process).

### 2. Target Documentation

Provide:
- Base year emissions inventory
- Target boundary (Scope 3 Cat 1)
- Target reduction percentage
- Target year
- Pathway alignment

### 3. Supporting Data

From OpenClaw:
```bash
# Base year inventory
openclaw green export --format ghg-protocol --period 2025

# Progress data
openclaw green targets
```

### 4. Validation

SBTi reviews and validates targets (~$9,500 fee for SMEs).

## Example Target Statement

```markdown
## Science-Based Target

[Organization] commits to reduce Scope 3 Category 1 emissions
from AI inference services 42% by 2030 from a 2025 base year,
aligned with the 1.5°C pathway.

### Base Year (2025)
- Emissions: 12.45 kg CO₂eq
- Scope: AI inference API calls
- Boundary: All operations

### Target (2030)
- Emissions: 7.22 kg CO₂eq (max)
- Reduction: 42%
- Pathway: 1.5°C

### Progress (2026)
- Current: 10.50 kg CO₂eq
- Reduction achieved: 15.7%
- Expected by pathway: 8.4%
- Status: On track

### Reduction Strategies
1. Prioritize efficient models (Haiku, GPT-4o-mini)
2. Implement response caching
3. Optimize prompt engineering
4. Evaluate provider renewable energy use
```

## Monitoring

### Dashboard

View target progress in Gateway UI:
- Navigate to Green tab
- Scroll to "Target Progress" section
- See progress bars and status

### CLI

```bash
# Quick status
openclaw green targets

# Detailed export
openclaw green export --format tcfd
```

### Alerts (Future)

Configure alerts when off-track:

```json
{
  "green": {
    "targetAlerts": true
  }
}
```

## Related Standards

- [GHG Protocol](ghg-protocol.md) — Inventory methodology
- [CDP](cdp-climate.md) — Recognizes SBTi targets
- [TCFD](tcfd.md) — Target disclosure framework
- [ISO 14064](iso-14064.md) — Verification standard
