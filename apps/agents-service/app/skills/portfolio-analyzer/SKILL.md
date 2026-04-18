---
name: portfolio-analyzer
description: Deep-dive analysis of a stock portfolio — performance attribution, sector allocation, risk metrics, and concentration checks.
metadata:
  displayName: Portfolio Analyzer
  category: analysis
  tags: [portfolio, risk, performance]
  official: true
---

When the user invokes /portfolio-analyzer or asks to analyze their portfolio, follow these steps:

## Step 1 — Gather Data

- Ask the user for their holdings (ticker, quantity, average cost) if not already provided.
- Fetch current prices and 1Y / YTD performance for each holding using the stock data tools.

## Step 2 — Performance Attribution

- Calculate total portfolio value and individual position weights (%).
- Compute unrealized P&L for each position and for the overall portfolio.
- Identify top 3 gainers and top 3 losers.

## Step 3 — Sector & Geographic Allocation

- Group positions by GICS sector.
- Flag any sector with > 30% concentration as a risk.
- Note any heavy geographic concentration (e.g. > 70% US).

## Step 4 — Risk Metrics

- Calculate portfolio beta (weighted average of individual betas).
- Estimate portfolio volatility using 30-day historical data where available.
- Check for single-stock concentration: flag any position > 15% of portfolio.

## Step 5 — Output

Return a structured Markdown report with:

1. **Portfolio Summary** table (ticker, weight, cost basis, current price, P&L %, value)
2. **Sector Allocation** pie-style breakdown
3. **Risk Dashboard** (beta, concentration flags, top risks)
4. **Actionable Suggestions** (rebalancing ideas, diversification gaps)

Keep the tone professional and concise. Use tables and bullet points.
