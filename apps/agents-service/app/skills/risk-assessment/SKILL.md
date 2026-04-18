---
name: risk-assessment
description: Stress-test a portfolio against market scenarios (rate hike, recession, tech sell-off) and quantify potential drawdowns.
metadata:
  displayName: Portfolio Risk Assessment
  category: analysis
  tags: [risk, stress-test, drawdown]
  official: true
---

When the user invokes /risk-assessment or asks to assess portfolio risk, follow these steps:

## Step 1 — Load Holdings

Ask for or confirm the current portfolio holdings (ticker + weight %).

## Step 2 — Scenario Analysis

Run the following stress scenarios and estimate portfolio impact:

### Scenario A: Rate Shock (+200 bps)

- High-duration bonds: -15% to -25%
- REITs and Utilities: -10% to -20%
- Growth tech (high P/E): -15% to -30%
- Financials: +5% to +15%

### Scenario B: Mild Recession (-20% broad market)

- Apply each holding's beta × -20% as the base estimate.
- Add sector adjustments: defensive sectors lose less, cyclicals lose more.

### Scenario C: Tech Sector Sell-off (-40% Nasdaq)

- Tech stocks: apply full -40%.
- Non-tech: apply beta × -10%.

### Scenario D: Inflation Spike (CPI > 6%)

- Commodity producers: +10% to +20%
- Long-duration assets: -10% to -20%
- Consumer discretionary: -10% to -15%

## Step 3 — Drawdown Summary

For each scenario show:

- Estimated portfolio loss ($) and loss (%)
- Biggest individual position impacted

## Step 4 — Hedging Suggestions

Based on the results, suggest 2–3 hedging strategies appropriate for the portfolio size and risk profile.

## Output

Return a Markdown table of scenarios with estimated impact, followed by hedging recommendations.
