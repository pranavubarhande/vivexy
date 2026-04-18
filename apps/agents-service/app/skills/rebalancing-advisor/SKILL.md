---
name: rebalancing-advisor
description: Calculate drift from target allocation and generate trade instructions to rebalance the portfolio.
metadata:
  displayName: Rebalancing Advisor
  category: automation
  tags: [rebalancing, trades, allocation]
  official: true
---

When the user invokes /rebalancing-advisor or asks how to rebalance their portfolio, follow these steps:

## Step 1 — Gather Current State

Ask for (or read from context):

- Current holdings: ticker + shares + current price (or market value)
- Target allocation: ticker → target weight %

## Step 2 — Calculate Drift

For each position compute:

- Current weight % = position value / total portfolio value
- Drift = current weight − target weight
- Dollar deviation = drift × total portfolio value

## Step 3 — Rebalancing Threshold

Apply a 5% threshold: only suggest trades for positions with abs(drift) > 5% of portfolio.
(User can specify a different threshold.)

## Step 4 — Generate Trade Instructions

For each position outside threshold:

- **Buy** if underweight: shares to buy = dollar deviation / current price (rounded to whole shares)
- **Sell** if overweight: shares to sell = abs(dollar deviation) / current price

Consider tax implications:

- Flag positions with large unrealized gains where selling would trigger tax.
- Suggest using new cash contributions to buy underweight positions before selling overweight.

## Step 5 — Output

```
## Rebalancing Plan — [Date]

### Portfolio Drift
| Ticker | Target | Current | Drift | Action |
|--------|--------|---------|-------|--------|

### Trade Instructions
1. Buy X shares of [TICKER] (~$X,XXX)
2. Sell X shares of [TICKER] (~$X,XXX)

### Tax Notes
[Any flagged positions]
```
