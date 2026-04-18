---
name: stock-deep-dive
description: Comprehensive single-stock research — fundamentals, valuation multiples, analyst consensus, recent news, and a bull/bear thesis.
metadata:
  displayName: Stock Deep Dive
  category: analysis
  tags: [stocks, fundamentals, valuation]
  official: true
---

When the user invokes /stock-deep-dive or asks for a deep dive on a stock, follow these steps:

## Step 1 — Identify the Ticker

- Confirm the ticker symbol. If the user gives a company name, search for the correct ticker.

## Step 2 — Fetch Fundamentals

Use the finance tools to gather:

- Company overview (sector, industry, description, employees)
- Key ratios: P/E, forward P/E, P/S, P/B, EV/EBITDA, PEG
- Revenue and EPS for last 4 quarters (and YoY growth)
- Profit margins (gross, operating, net)
- Balance sheet snapshot: total debt, cash, debt-to-equity
- Free cash flow (trailing 12 months)
- Dividend yield and payout ratio (if applicable)

## Step 3 — Technical Snapshot

- Current price vs 52-week high/low
- Distance from 50-day and 200-day moving averages
- Recent volume vs 30-day average

## Step 4 — News & Catalysts

- Fetch the 5 most recent news headlines.
- Identify upcoming catalysts: earnings date, product launches, regulatory events.

## Step 5 — Bull / Bear Thesis

Synthesize a short (3-bullet) bull case and a short (3-bullet) bear case based on the data.

## Output Format

Return a structured Markdown report:

1. **Company Overview**
2. **Valuation Snapshot** (key multiples vs sector averages)
3. **Financial Health** (growth, margins, balance sheet)
4. **Technical Picture**
5. **Recent News**
6. **Bull Case / Bear Case**
7. **Analyst Consensus** (if available)

Be data-driven. Cite the numbers you pull.
