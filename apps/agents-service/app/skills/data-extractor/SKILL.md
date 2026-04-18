---
name: data-extractor
description: Extract structured financial data from uploaded documents (PDFs, CSVs, spreadsheets) and produce clean tables or JSON.
metadata:
  displayName: Financial Data Extractor
  category: data
  tags: [extraction, PDF, spreadsheet]
  official: true
---

When the user invokes /data-extractor or asks to extract data from a document, follow these steps:

## Step 1 — Identify the Document

- Check for attached files in the current context.
- If none, ask the user to upload the document.
- Supported formats: PDF, CSV, XLSX, TXT, Markdown.

## Step 2 — Classify the Document Type

Determine the financial document type:

- Brokerage statement
- 10-K / annual report
- Earnings release / press release
- Portfolio export (CSV/XLSX)
- Bank statement
- Other

## Step 3 — Extract Key Data

Based on the document type, extract the relevant fields:

### Brokerage Statement

- Account summary (total value, cash, invested)
- Positions table (ticker, shares, price, market value, gain/loss)
- Transaction history

### Annual Report / 10-K

- Revenue, gross profit, operating income, net income (last 2 years)
- Total assets, total liabilities, shareholders equity
- Cash flow from operations, capex, free cash flow

### Portfolio CSV/XLSX

- Parse all rows and columns.
- Identify ticker, quantity, cost basis, current value columns.
- Flag any missing or malformed data.

## Step 4 — Output Format

Return the extracted data as:

1. A clean Markdown table (for display)
2. Offer to save as a CSV or JSON artifact for further analysis.

## Step 5 — Validation

- Cross-check totals (e.g. sum of positions ≈ total account value).
- Flag any obvious data quality issues.
