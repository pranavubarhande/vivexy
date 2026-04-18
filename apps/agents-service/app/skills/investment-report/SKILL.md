---
name: investment-report
description: Generate a polished, professional investment report (PDF-ready Markdown) from portfolio data or research notes.
metadata:
  displayName: Investment Report Generator
  category: reporting
  tags: [report, PDF, professional]
  official: true
---

When the user invokes /investment-report or asks to generate an investment report, follow these steps:

## Step 1 — Collect Inputs

Ask the user for:

- Report type: Portfolio Review | Single-Stock Research | Market Update | Custom
- Date range or as-of date
- Target audience: personal | client-facing | institutional
- Any specific talking points or data to highlight

## Step 2 — Structure the Report

Use this template structure:

```
# [Report Title]
**Date:** [Date] | **Prepared by:** Portfolio Helper AI

---

## Executive Summary
[2–3 sentence summary of key findings]

## Market Context
[Brief macro backdrop relevant to the report]

## Core Analysis
[Main content — portfolio data, stock analysis, or market review]

## Key Risks
[3–5 bullet risks]

## Recommendations
[Actionable items]

## Appendix
[Supporting tables and data]
```

## Step 3 — Populate with Data

- Pull all relevant data using the finance and search tools.
- Ensure all numbers are sourced and recent.

## Step 4 — Formatting Rules

- Use tables for comparative data.
- Use bold for key metrics.
- Keep paragraphs short (3–4 sentences max).
- Use professional language — avoid jargon unless client-facing content requires it.

## Step 5 — Offer Export

After generating the report, offer to export it as a PDF or DOCX artifact.
