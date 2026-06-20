# Agent Testing Guide

Complete reference for testing all agents available in the chat interface.

## How to test

| Method | Where | When to use |
|---|---|---|
| **Prompt** | Chat tab → type message | Core capability check |
| **Attachment** | Chat tab → file upload icon | Agents that parse documents |
| **Scheduled task** | Scheduled Tasks tab → New Task | Agents that do recurring monitoring |

### What to verify in every test

1. **Response completeness** — does it address all parts of the prompt?
2. **Artifact generated** — does it produce a document/chart/spreadsheet in the Files panel?
3. **Tool calls visible** — does the reasoning panel show the expected tools (e.g. Document Parser, Web Search)?
4. **No hallucinated data** — cross-check any numbers or citations against known facts
5. **Scheduled task fires** — check Chat history after the scheduled time to confirm a new chat was created with results

---

## Base Agent

### Portfolio Assistant
**Description:** General AI assistant for portfolio tasks — stocks, documents, tasks, and files.

**Test prompt:**
```
What stocks are in my portfolio and what's their current weight?
```

**Verify:** responds conversationally, uses portfolio/document tools

---

## Finance Agents

### 1. Portfolio Analysis Agent
**Description:** Analyses equity and fixed-income portfolios against benchmarks, risk thresholds, and factor exposures.

**Test prompt:**
```
Give me a risk snapshot of a portfolio that's 60% SPY, 30% TLT, 10% GLD.
Show drawdown, Sharpe ratio, and sector weights.
```

**Verify:** chart artifact + structured risk analysis with benchmark comparison

---

### 2. Financial Statement Analyzer
**Description:** Parses P&L, balance sheets, and cash flow statements to extract ratios and flag anomalies.

**Test prompt:**
```
Extract the key financial ratios from this filing and flag any anomalies year-over-year.
```

**Attachment:** Any company's 10-K PDF or a sample P&L in Excel/PDF

**Verify:** outputs EBITDA, current ratio, debt-to-equity; flags margin changes

---

### 3. Earnings Call Intelligence Agent
**Description:** Transcribes and analyses earnings calls, extracting management guidance and tracking sentiment shifts.

**Test prompt:**
```
Summarise this earnings call, extract forward guidance, and note any sentiment shifts vs last quarter.
```

**Attachment:** Earnings call transcript PDF (available from SEC EDGAR)

**Verify:** structured summary with guidance bullets and sentiment section

---

### 4. Due Diligence Agent
**Description:** Aggregates company financials, leadership history, legal history, and press for structured DD memos.

**Test prompt:**
```
Run a due diligence summary on Stripe Inc — financials, ownership, leadership, funding history, and any red flags.
```

**Verify:** structured memo artifact with sections for each area

---

### 5. Invoice & AP Automation Agent
**Description:** Extracts invoice data, matches to POs, routes for approval, and flags duplicates and discrepancies.

**Test prompt:**
```
Extract all invoice fields, check for duplicates, and flag any discrepancies against a PO amount of $5,200.
```

**Attachment:** Sample invoice PDF

**Verify:** structured extraction output; discrepancy flagged if amounts differ

---

### 6. Cash Flow Forecasting Agent
**Description:** Projects 13-week cash flow with scenario modelling and covenant breach alerts.

**Test prompt:**
```
Build a 13-week cash flow projection with best/base/worst case scenarios.
Alert if liquidity drops below $100k.
```

**Attachment:** Excel/CSV with 3 months of actuals

**Verify:** chart artifact with three scenario lines; breach alert highlighted

---

### 7. Tax Research Agent
**Description:** Researches tax treatment for transactions, identifies applicable deductions and credits, and summarises law changes.

**Test prompt:**
```
What are the tax implications of converting a C-Corp to an S-Corp in California?
Summarise recent relevant law changes.
```

**Verify:** position memo artifact with citations; jurisdiction-specific language

---

### 8. Budget vs. Actuals Agent
**Description:** Pulls actuals against budget by department, identifies variances, and escalates significant overruns.

**Test prompt:**
```
Identify all departments with variance greater than 10% and generate an executive summary.
```

**Attachment:** Excel with budget vs actuals by department

**Scheduled task:** Monthly — `Pull actuals vs budget for all departments and flag variances over 10%.`

**Verify:** table of variances; escalation flags on overruns

---

### 9. M&A Valuation Agent
**Description:** Runs DCF, EV/EBITDA, and precedent transaction analysis to produce deal memos and synergy estimates.

**Test prompt:**
```
Run a DCF valuation on a SaaS company with $10M ARR, 30% growth, 70% gross margin.
Show a sensitivity table on WACC (8–12%) and growth (20–35%).
```

**Verify:** DCF output with sensitivity table as artifact; deal memo generated

---

### 10. FX Risk Monitoring Agent
**Description:** Monitors currency exposure across entities, calculates hedge effectiveness, and alerts on threshold breaches.

**Test prompt:**
```
I have $5M USD exposure to EUR and $2M to GBP.
Calculate hedge effectiveness and alert me if net exposure exceeds $3M.
```

**Scheduled task:** Daily — `Report current EUR/GBP/JPY exposure against $3M threshold. Alert on breach.`

**Verify:** exposure dashboard output; breach alert triggered

---

### 11. Vendor Spend Analytics Agent
**Description:** Categorises spend by vendor and category, identifies consolidation opportunities, and flags off-contract spending.

**Test prompt:**
```
Identify consolidation opportunities, flag off-contract spend, and rank vendors by total spend.
```

**Attachment:** CSV of vendor invoices (columns: vendor name, category, amount, date)

**Verify:** chart artifact + vendor ranking table; consolidation opportunities listed

---

### 12. Financial Report Writer
**Description:** Drafts investor reports, board decks, and MD&A sections by pulling live data into narrative prose.

**Test prompt:**
```
Draft an MD&A section for a company with Q3 revenue of $12M (up 18% YoY),
EBITDA margin of 22%, and $3M in new ARR from enterprise deals.
```

**Verify:** narrative prose artifact; numbers woven into commentary; investor-ready tone

---

## Legal Agents

### 13. Contract Review Agent
**Description:** Reviews contracts for non-standard clauses, missing provisions, and risk-scores each agreement with suggested redlines.

**Test prompt:**
```
Review this contract, flag non-standard clauses, missing provisions,
and give it a risk score with redline suggestions.
```

**Attachment:** Any NDA or service agreement PDF

**Verify:** risk score output; flagged clauses listed; suggested redlines as artifact

---

### 14. Contract Drafting Agent
**Description:** Drafts NDAs, MSAs, SOWs, and employment agreements from parameters with jurisdiction-appropriate language.

**Test prompt:**
```
Draft a mutual NDA between Acme Corp and Beta Ltd, governed by Delaware law,
with a 2-year term and standard IP carve-outs.
```

**Verify:** full NDA document artifact; Delaware-specific language present

---

### 15. Contract Lifecycle Management Agent
**Description:** Tracks contract expiry, renewal windows, and obligation deadlines — alerting owners and extracting key metadata.

**Test prompt:**
```
Extract key metadata — parties, value, term, notice period — and tell me when renewal alerts should fire.
```

**Attachment:** Contract PDF with a visible expiry/renewal date

**Scheduled task:** Weekly — `List all contracts expiring in the next 90 days and send renewal alerts.`

**Verify:** metadata table; renewal alert dates calculated correctly

---

### 16. Legal Research Agent
**Description:** Researches case law, statutes, and regulations by jurisdiction, summarising relevant precedents with validated citations.

**Test prompt:**
```
Research case law on non-compete enforceability in California.
Provide a plain-language summary and a memo with citations.
```

**Verify:** memo artifact with Bluebook citations; circuit split noted if applicable

---

### 17. Litigation Support Agent
**Description:** Reviews document sets for relevance and privilege, builds chronologies, and drafts deposition summaries.

**Test prompt:**
```
Review these documents for relevance to a breach of contract claim,
build a chronology, and flag any privilege concerns.
```

**Attachment:** PDF with multiple named parties and dated events

**Verify:** chronology artifact; privilege flags present; entity map generated

---

### 18. IP Portfolio Agent
**Description:** Monitors patent expiry and maintenance deadlines, searches for potential infringement, and maps freedom-to-operate.

**Test prompt:**
```
Search for prior art and freedom-to-operate risks for a method patent on
'AI-generated financial summaries using transformer models.'
```

**Verify:** landscape search output; FTO analysis with risk level; maintenance deadlines noted

---

### 19. Legal Spend Management Agent
**Description:** Reviews outside counsel invoices for billing guideline compliance and benchmarks rates against market data.

**Test prompt:**
```
Review this invoice for block billing, vague entries, or over-staffing.
Benchmark the hourly rates against market data.
```

**Attachment:** Law firm invoice PDF

**Verify:** flagged billing entries; rate comparison table; matter-level spend summary

---

### 20. Employment Law Agent
**Description:** Answers HR queries on leave, termination, and accommodation policies, flags policy gaps vs. current law.

**Test prompt:**
```
What are the leave entitlement requirements for a full-time employee in New York?
Flag any gaps between standard policy and current law.
```

**Verify:** jurisdiction-specific output; policy gap section; statutory references cited

---

### 21. Regulatory Filing Agent
**Description:** Identifies required filings and deadlines by jurisdiction, pre-fills standard forms, and tracks submission status.

**Test prompt:**
```
Build a filing calendar for a Delaware C-Corp operating in California and New York.
Include annual reports, licence renewals, and tax deadlines for 2025.
```

**Verify:** calendar artifact sorted by deadline; entity/jurisdiction columns present

---

### 22. Privacy & Data Rights Agent
**Description:** Handles DSARs end-to-end — identifying data held, generating response packages, and tracking regulatory deadlines.

**Test prompt:**
```
A user submitted a GDPR erasure request today. Walk me through the end-to-end workflow,
identify data that may be held, and draft the response letter.
```

**Verify:** step-by-step workflow; 30-day GDPR deadline flagged; draft letter artifact

---

### 23. Corporate Governance Agent
**Description:** Drafts board meeting minutes, tracks director consents and resolutions, and maintains entity ownership charts.

**Test prompt:**
```
Draft board minutes for a meeting on 2025-05-15 where the board approved
a $5M Series A and appointed a new CFO.
```

**Verify:** formal minutes artifact; resolutions properly formatted; action items listed

---

## Compliance Agents

### 24. KYC/AML Screening Agent
**Description:** Screens customers and counterparties against sanctions lists, PEP databases, and adverse media at onboarding and continuously.

**Test prompt:**
```
Screen 'Viktor Bout' as a new onboarding customer.
Check OFAC, UN, EU, and HMT sanctions lists. Run PEP and adverse media checks.
```

**Verify:** positive match flagged; SAR-ready alert package in output; risk score present

---

### 25. Transaction Monitoring Agent
**Description:** Flags structuring, layering, and unusual velocity patterns in payment data and scores transactions by AML risk.

**Test prompt:**
```
Analyse these transactions for structuring, unusual velocity, or layering patterns.
Score each by AML risk.
```

**Attachment:** CSV of transactions (columns: amount, date, counterparty)

**Verify:** risk-scored transaction list; flagged patterns with explanation; alert narrative present

---

### 26. Regulatory Change Monitoring Agent
**Description:** Monitors regulatory body feeds for new rules and guidance, maps changes to internal policies, and assigns remediation owners.

**Test prompt:**
```
What new SEC and FCA rules were issued in Q1 2025?
Map them to typical compliance policies and suggest remediation owners.
```

**Scheduled task:** Weekly (Monday 8am) — `Summarise any new SEC/FCA/EBA rulemaking this week and flag policy impacts.`

**Verify:** digest with source links; impact mapping table; owner assignment suggested

---

### 27. Policy Management Agent
**Description:** Maintains the policy library, routes policies for annual review, and manages employee attestation campaigns.

**Test prompt:**
```
Check this policy against GDPR and SOX requirements, identify any gaps,
and create a review routing plan with owner assignments.
```

**Attachment:** Policy document PDF

**Verify:** gap analysis table; review cycle plan as artifact; attestation workflow described

---

### 28. Compliance Training Agent
**Description:** Generates training content from policy documents, assigns by role and risk level, and tracks completion with escalating reminders.

**Test prompt:**
```
Generate a 5-question quiz and a short training module from this policy document.
Assign it to Finance and Legal roles.
```

**Attachment:** Policy document PDF

**Verify:** quiz artifact with answer key; role-based assignment noted; completion tracking described

---

### 29. Audit Management Agent
**Description:** Manages audit finding lifecycle from open to closure, collects evidence from system owners, and tracks overdue items.

**Test prompt:**
```
Create an audit finding lifecycle for 3 findings:
1. Missing MFA on admin accounts
2. Stale access reviews
3. Undocumented change management
Assign owners and 30-day deadlines.
```

**Verify:** finding tracker artifact; escalation rules described; heat map generated

---

### 30. Risk Assessment Agent
**Description:** Scores inherent and residual risk across the risk taxonomy, maps controls to risks, and identifies gaps.

**Test prompt:**
```
Score inherent and residual risk for cybersecurity, operational, and regulatory risk domains.
Map current controls and identify top-3 gaps for board reporting.
```

**Verify:** heat map artifact; top-10 risk summary; risk appetite comparison present

---

### 31. Third-Party Risk (TPRM) Agent
**Description:** Sends and scores vendor risk questionnaires, pulls continuous security ratings, and flags high-risk vendors.

**Test prompt:**
```
Assess vendor risk for Salesforce.com. Pull security ratings, check for recent breaches
or adverse news, and score overall TPRM risk.
```

**Verify:** vendor risk scorecard; fourth-party risk noted if applicable; annual review plan described

---

### 32. Regulatory Reporting Agent
**Description:** Compiles data from source systems for regulatory submissions, validates against reporting schemas, and tracks confirmations.

**Test prompt:**
```
Validate this data against a FinCEN CTR schema.
Flag any missing fields or format errors before submission.
```

**Attachment:** CSV of transaction data

**Verify:** validation report with error list; submission-ready confirmation; filing calendar shown

---

### 33. Whistleblower / Ethics Hotline Agent
**Description:** Receives and anonymises ethics tips, routes to appropriate investigators, and tracks investigation milestones.

**Test prompt:**
```
A tip has been received alleging expense fraud in the Finance department.
Anonymise the report, route it to the correct investigator,
and set up 90-day SEC window tracking.
```

**Verify:** anonymised intake artifact; routing and milestone tracker; case closure template generated

---

### 34. Data Governance & Lineage Agent
**Description:** Maps data assets to owners, classifications, and retention schedules, and traces lineage across pipelines.

**Test prompt:**
```
Classify a dataset containing customer names, emails, purchase history, and IP addresses.
Map retention schedules and flag PII fields.
```

**Verify:** classification table; retention schedule; PII fields highlighted; lineage map described

---

### 35. Trade Sanctions Screening Agent
**Description:** Screens trade transactions for restricted parties, countries, and goods, and generates licence determination memos.

**Test prompt:**
```
Screen a shipment of 'dual-use encryption hardware' to a buyer in Dubai.
Check BIS EAR classification and OFAC restricted party list.
```

**Verify:** EAR classification result; restricted party check; licence determination memo artifact

---

### 36. Incident Response Agent
**Description:** Triages compliance and security incidents, determines notification obligations, and drafts breach notifications.

**Test prompt:**
```
A data breach occurred today exposing 50,000 EU customer email addresses and hashed passwords.
Determine notification obligations and draft the GDPR 72-hour regulator notice.
```

**Verify:** 72-hour deadline flagged; draft notification artifact; SEC 4-day rule noted; severity classification shown

---

### 37. ESG Reporting Agent
**Description:** Collects and validates ESG metrics, maps to GRI/TCFD/CSRD frameworks, and drafts sustainability report sections.

**Test prompt:**
```
Calculate Scope 1 and Scope 2 emissions for an office of 200 employees using 500 MWh
of grid electricity annually and a 50-vehicle diesel fleet. Map to TCFD framework.
```

**Scheduled task:** Monthly — `Compile Scope 1/2 emissions data this month and update the TCFD tracker.`

**Verify:** emissions calculation; TCFD framework section mapping; chart artifact generated

---

## Cross-functional Agents

### 38. Deal Desk Agent
**Description:** Accelerates deal structuring by pulling standard terms, flagging deviations, and routing non-standard deals for approval.

**Test prompt:**
```
A sales rep wants to offer 35% discount on a $200k enterprise deal with custom payment terms (net 90).
Evaluate against the standard playbook and route for approval.
```

**Verify:** deviation flags; approval routing described; deal summary artifact; deal velocity metrics shown

---

### 39. Board Reporting Agent
**Description:** Assembles board packs from live finance, legal, and compliance data — including executive summaries and risk items.

**Test prompt:**
```
Assemble a board pack summary for Q2 2025: revenue $14M (+22% YoY), 2 open litigation matters,
3 overdue audit findings, FX exposure at $8M EUR. Include key decisions required.
```

**Verify:** board pack artifact with exec summary; risk items highlighted; decisions required section present

---

### 40. Regulatory Intelligence Agent
**Description:** Answers cross-jurisdictional regulatory applicability questions and maps new requirements to gap analyses.

**Test prompt:**
```
Does the EU AI Act apply to a US-based fintech that deploys an AI credit scoring model
used by EU consumers? Provide legal reasoning and a gap analysis against current controls.
```

**Verify:** applicability analysis with jurisdiction reasoning; gap analysis table; horizon scanning summary

---

## Scheduled Task Recommendations

Set these up under **Scheduled Tasks → New Task** to test recurring agent execution.

| Agent | Frequency | Prompt |
|---|---|---|
| Regulatory Change Monitoring | Weekly, Mon 8am | `Summarise new SEC/FCA/EBA rules this week and map to internal policies.` |
| FX Risk Monitoring | Daily | `Report current EUR/GBP/JPY exposure against $3M threshold. Alert on breach.` |
| Budget vs. Actuals | Monthly | `Pull actuals vs budget for all departments and flag variances over 10%.` |
| KYC/AML Screening | Daily | `Re-screen watchlist customers against updated OFAC/HMT sanctions lists.` |
| Contract Lifecycle | Weekly | `List all contracts expiring in the next 90 days and send renewal alerts.` |
| ESG Reporting | Monthly | `Compile Scope 1/2 emissions data this month and update the TCFD tracker.` |

After each scheduled task fires, verify a new chat appears in Chat history with the agent's results.
