---
name: market-summary
description: Generate a concise daily market recap — index performance, sector rotation, notable movers, and key macro events.
metadata:
  displayName: Daily Market Summary
  category: reporting
  tags: [market, daily, recap]
  official: true
---

When the user invokes /market-summary or asks for a market summary, follow these steps:

## Step 1 — Fetch Market Data

Pull data for:

- Major indices: S&P 500, Nasdaq 100, Dow Jones, Russell 2000
- VIX (fear index)
- 10-year Treasury yield
- Gold and WTI crude oil

## Step 2 — Sector Performance

Fetch performance for all 11 GICS sectors (or as many as available) for the day / week.
Identify: top 2 performing sectors, bottom 2 performing sectors.

## Step 3 — Notable Movers

Search for top gainers and losers among large-cap stocks. Fetch recent news to explain moves.

## Step 4 — Macro Calendar

Mention any major economic releases or Fed events that occurred or are upcoming.

## Step 5 — Output Format

```
## Market Summary — [Date]

### Index Performance
| Index | Price | Day Change | YTD |
|-------|-------|------------|-----|
| ...   |       |            |     |

### Sector Rotation
🟢 Leaders: [sectors]
🔴 Laggards: [sectors]

### Notable Movers
- [Ticker]: +X% — [reason]

### Macro Highlights
- [Event]: [impact]

### Outlook
[1–2 sentence forward-looking comment]
```

Keep it brief and scannable. The whole summary should be readable in under 2 minutes.
