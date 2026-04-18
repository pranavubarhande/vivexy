---
name: earnings-preview
description: Pre-earnings research brief — analyst estimates, historical beat/miss rate, key metrics to watch, and implied move.
metadata:
  displayName: Earnings Preview
  category: research
  tags: [earnings, estimates, preview]
  official: true
---

When the user invokes /earnings-preview or asks for an earnings preview, follow these steps:

## Step 1 — Identify the Company

Confirm the ticker and find the next earnings date.

## Step 2 — Consensus Estimates

Fetch analyst consensus for:

- Revenue estimate (and YoY growth expected)
- EPS estimate (GAAP and adjusted)
- Guidance expectations (if available)

## Step 3 — Historical Context

- Last 4 quarters: actual vs estimate for revenue and EPS
- Beat/miss rate (e.g. "Beat EPS 3 of last 4 quarters")
- Average post-earnings move (up/down %)

## Step 4 — Key Metrics to Watch

Based on the company's business model, identify 3–5 specific KPIs beyond EPS/revenue that the market will focus on (e.g. MAUs, gross margin, ARR, same-store sales).

## Step 5 — Options Implied Move

If available, mention the options-implied move for earnings (IV vs historical move).

## Step 6 — Output

```
## Earnings Preview: [Ticker] — [Date]

### Consensus Estimates
- Revenue: $X.Xb (vs $X.Xb last year, +X% YoY)
- EPS (adj): $X.XX

### Historical Beat Rate
[Table: Last 4 quarters]

### Key Metrics to Watch
1. [Metric]: consensus X, last quarter Y
2. ...

### Implied Move
Options market pricing ~±X% move

### Our Take
[2-3 sentence synthesis of what to expect]
```
