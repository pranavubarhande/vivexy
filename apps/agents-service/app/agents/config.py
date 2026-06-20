"""
Agent configuration, state schemas, and prompts.
Single source of truth for the unified agent and event contract.
"""

import os
from dataclasses import dataclass, field
from enum import Enum
from operator import add
from typing import Annotated, Any, Dict, List, Optional, TypedDict

from langchain_core.messages import BaseMessage

from app.enum.agent_enums import AgentPhase, AgentType, TaskStatus
from app.types.agent_types import (
    AgentState,
    ApprovalRequest,
    FileContext,
    ReasoningStep,
    TaskItem,
    ToolCall,
)

_PROVIDER_ENV_KEYS = {
    "google": ["GOOGLE_AI_API_KEY", "GOOGLE_API_KEY"],
    "openai": ["OPENAI_API_KEY"],
    "anthropic": ["ANTHROPIC_API_KEY"],
    "groq": ["GROQ_API_KEY"],
    "mistral": ["MISTRAL_API_KEY"],
    "together": ["TOGETHER_API_KEY"],
    "fireworks": ["FIREWORKS_API_KEY"],
    "cohere": ["COHERE_API_KEY"],
    "xai": ["XAI_API_KEY"],
    "ollama": [],
}


@dataclass
class AgentConfig:
    api_key: str
    model: str = "gemini-2.5-flash"
    provider: str = "google"
    temperature: float = 0.7
    max_tokens: int = 8192
    max_iterations: int = 200
    embedding_model: str = "all-MiniLM-L6-v2"

    @classmethod
    def from_env(
        cls,
        provider: str = "google",
        model: str = "gemini-2.5-flash",
        user_api_keys: Optional[dict] = None,
    ):
        user_key = (user_api_keys or {}).get(provider, "")
        if user_key:
            return cls(api_key=user_key, model=model, provider=provider)

        env_vars = _PROVIDER_ENV_KEYS.get(provider, [])
        api_key = ""
        for env_var in env_vars:
            api_key = os.getenv(env_var, "")
            if api_key:
                break

        return cls(api_key=api_key, model=model, provider=provider)


DEFAULT_AGENT_ID = "assistant"

AGENT_METADATA = {
    DEFAULT_AGENT_ID: {
        "id": DEFAULT_AGENT_ID,
        "name": "Portfolio Assistant",
        "description": "Your AI assistant for portfolio tasks: stocks, documents, tasks, and files.",
        "icon": "🤖",
        "color": "#6366f1",
        "tools": [
            "base",
            "rag",
            "todos",
            "artifacts",
            "files",
            "stocks",
            "news",
            "financial_sheets",
            "data_analysis",
        ],
    },
    # ── Finance ───────────────────────────────────────────────────────────────
    "portfolio-analysis": {
        "id": "portfolio-analysis",
        "name": "Portfolio Analysis Agent",
        "description": "Analyses equity and fixed-income portfolios against benchmarks and risk thresholds.",
        "icon": "📊",
        "color": "#6366f1",
        "tools": ["base", "finance", "document", "market_data", "sec_edgar"],
    },
    "financial-statement-analyzer": {
        "id": "financial-statement-analyzer",
        "name": "Financial Statement Analyzer",
        "description": "Parses P&L, balance sheets, and cash flow statements to extract ratios and flag anomalies.",
        "icon": "🧾",
        "color": "#8b5cf6",
        "tools": ["base", "finance", "document", "sec_edgar"],
    },
    "earnings-call-intelligence": {
        "id": "earnings-call-intelligence",
        "name": "Earnings Call Intelligence Agent",
        "description": "Transcribes and analyses earnings calls, extracting guidance and tracking sentiment shifts.",
        "icon": "🎙️",
        "color": "#a78bfa",
        "tools": ["base", "finance", "document", "sec_edgar"],
    },
    "due-diligence": {
        "id": "due-diligence",
        "name": "Due Diligence Agent",
        "description": "Aggregates company financials, leadership, and legal history for structured DD memos.",
        "icon": "🔍",
        "color": "#7c3aed",
        "tools": ["base", "finance", "document", "sec_edgar"],
    },
    "invoice-ap-automation": {
        "id": "invoice-ap-automation",
        "name": "Invoice & AP Automation Agent",
        "description": "Extracts invoice data, matches to POs, routes for approval, and flags discrepancies.",
        "icon": "🧮",
        "color": "#5b21b6",
        "tools": ["base", "document", "workflow"],
    },
    "cash-flow-forecasting": {
        "id": "cash-flow-forecasting",
        "name": "Cash Flow Forecasting Agent",
        "description": "Projects 13-week cash flow with scenario modelling and covenant breach alerts.",
        "icon": "💸",
        "color": "#4f46e5",
        "tools": ["base", "finance", "document", "market_data"],
    },
    "tax-research": {
        "id": "tax-research",
        "name": "Tax Research Agent",
        "description": "Researches tax treatment, identifies deductions and credits, summarises law changes.",
        "icon": "🏛️",
        "color": "#3730a3",
        "tools": ["base", "document", "reg_feeds"],
    },
    "budget-actuals": {
        "id": "budget-actuals",
        "name": "Budget vs. Actuals Agent",
        "description": "Pulls actuals against budget, identifies variances, and escalates significant overruns.",
        "icon": "📉",
        "color": "#1d4ed8",
        "tools": ["base", "finance", "document"],
    },
    "ma-valuation": {
        "id": "ma-valuation",
        "name": "M&A Valuation Agent",
        "description": "Runs DCF, EV/EBITDA, and precedent transaction analysis to produce deal memos.",
        "icon": "🤝",
        "color": "#2563eb",
        "tools": ["base", "finance", "document", "market_data", "sec_edgar"],
    },
    "fx-risk-monitoring": {
        "id": "fx-risk-monitoring",
        "name": "FX Risk Monitoring Agent",
        "description": "Monitors currency exposure, calculates hedge effectiveness, alerts on threshold breaches.",
        "icon": "💱",
        "color": "#0284c7",
        "tools": ["base", "finance", "document", "market_data"],
    },
    "vendor-spend-analytics": {
        "id": "vendor-spend-analytics",
        "name": "Vendor Spend Analytics Agent",
        "description": "Categorises spend by vendor, identifies consolidation opportunities, flags off-contract spend.",
        "icon": "🛒",
        "color": "#0369a1",
        "tools": ["base", "document"],
    },
    "financial-report-writer": {
        "id": "financial-report-writer",
        "name": "Financial Report Writer",
        "description": "Drafts investor reports, board decks, and MD&A sections from live financial data.",
        "icon": "📝",
        "color": "#075985",
        "tools": ["base", "finance", "document", "market_data", "sec_edgar"],
    },
    # ── Legal ─────────────────────────────────────────────────────────────────
    "contract-review": {
        "id": "contract-review",
        "name": "Contract Review Agent",
        "description": "Reviews contracts for non-standard clauses and produces risk-scored summaries with redlines.",
        "icon": "⚖️",
        "color": "#0891b2",
        "tools": ["base", "legal", "document"],
    },
    "contract-drafting": {
        "id": "contract-drafting",
        "name": "Contract Drafting Agent",
        "description": "Drafts NDAs, MSAs, SOWs, and employment agreements with jurisdiction-appropriate language.",
        "icon": "✍️",
        "color": "#0e7490",
        "tools": ["base", "legal", "document", "legal_db"],
    },
    "contract-lifecycle": {
        "id": "contract-lifecycle",
        "name": "Contract Lifecycle Management Agent",
        "description": "Tracks contract expiry, renewal windows, and obligations — alerting owners automatically.",
        "icon": "🗓️",
        "color": "#155e75",
        "tools": ["base", "legal", "document", "workflow"],
    },
    "legal-research": {
        "id": "legal-research",
        "name": "Legal Research Agent",
        "description": "Researches case law, statutes, and regulations by jurisdiction with validated citations.",
        "icon": "📚",
        "color": "#1e40af",
        "tools": ["base", "legal", "document", "legal_db", "reg_feeds"],
    },
    "litigation-support": {
        "id": "litigation-support",
        "name": "Litigation Support Agent",
        "description": "Reviews document sets for relevance and privilege, builds chronologies, drafts deposition summaries.",
        "icon": "🏛️",
        "color": "#1e3a8a",
        "tools": ["base", "legal", "document", "legal_db"],
    },
    "ip-portfolio": {
        "id": "ip-portfolio",
        "name": "IP Portfolio Agent",
        "description": "Monitors patent deadlines, searches for infringement, and maps freedom-to-operate.",
        "icon": "💡",
        "color": "#312e81",
        "tools": ["base", "legal", "document", "legal_db"],
    },
    "legal-spend-management": {
        "id": "legal-spend-management",
        "name": "Legal Spend Management Agent",
        "description": "Reviews outside counsel invoices for billing guideline compliance and benchmarks rates.",
        "icon": "💰",
        "color": "#4338ca",
        "tools": ["base", "legal", "document"],
    },
    "employment-law": {
        "id": "employment-law",
        "name": "Employment Law Agent",
        "description": "Answers HR queries on leave and termination, flags policy gaps vs. current law.",
        "icon": "👥",
        "color": "#4f46e5",
        "tools": ["base", "legal", "document", "legal_db", "reg_feeds"],
    },
    "regulatory-filing": {
        "id": "regulatory-filing",
        "name": "Regulatory Filing Agent",
        "description": "Identifies required filings by jurisdiction, pre-fills forms, and tracks submission status.",
        "icon": "📋",
        "color": "#6d28d9",
        "tools": ["base", "legal", "document", "reg_feeds", "workflow"],
    },
    "privacy-dsar": {
        "id": "privacy-dsar",
        "name": "Privacy & Data Rights Agent",
        "description": "Handles DSARs end-to-end — data identification, response packages, and deadline tracking.",
        "icon": "🔒",
        "color": "#7c3aed",
        "tools": ["base", "legal", "compliance", "document", "workflow"],
    },
    "corporate-governance": {
        "id": "corporate-governance",
        "name": "Corporate Governance Agent",
        "description": "Drafts board minutes, tracks director consents, and maintains entity ownership charts.",
        "icon": "🏢",
        "color": "#8b5cf6",
        "tools": ["base", "legal", "document", "workflow"],
    },
    # ── Compliance ────────────────────────────────────────────────────────────
    "kyc-aml-screening": {
        "id": "kyc-aml-screening",
        "name": "KYC/AML Screening Agent",
        "description": "Screens customers against sanctions lists, PEP databases, and adverse media.",
        "icon": "🛡️",
        "color": "#dc2626",
        "tools": ["base", "compliance", "document", "sanctions", "workflow"],
    },
    "transaction-monitoring": {
        "id": "transaction-monitoring",
        "name": "Transaction Monitoring Agent",
        "description": "Flags structuring, layering, and unusual velocity patterns and scores transactions by AML risk.",
        "icon": "📡",
        "color": "#b91c1c",
        "tools": ["base", "compliance", "document", "sanctions", "workflow"],
    },
    "regulatory-change-monitoring": {
        "id": "regulatory-change-monitoring",
        "name": "Regulatory Change Monitoring Agent",
        "description": "Monitors regulatory feeds for new rules, maps changes to internal policies, assigns owners.",
        "icon": "📡",
        "color": "#991b1b",
        "tools": ["base", "compliance", "document", "reg_feeds", "workflow"],
    },
    "policy-management": {
        "id": "policy-management",
        "name": "Policy Management Agent",
        "description": "Maintains the policy library, routes for annual review, manages attestation campaigns.",
        "icon": "📁",
        "color": "#7f1d1d",
        "tools": ["base", "compliance", "document", "workflow"],
    },
    "compliance-training": {
        "id": "compliance-training",
        "name": "Compliance Training Agent",
        "description": "Generates training content from policies, assigns by role, tracks completion.",
        "icon": "🎓",
        "color": "#92400e",
        "tools": ["base", "compliance", "document", "workflow"],
    },
    "audit-management": {
        "id": "audit-management",
        "name": "Audit Management Agent",
        "description": "Manages audit finding lifecycle, collects evidence, tracks overdue items.",
        "icon": "🔎",
        "color": "#78350f",
        "tools": ["base", "compliance", "document", "workflow"],
    },
    "risk-assessment": {
        "id": "risk-assessment",
        "name": "Risk Assessment Agent",
        "description": "Scores inherent and residual risk across the taxonomy, maps controls, identifies gaps.",
        "icon": "⚠️",
        "color": "#d97706",
        "tools": ["base", "compliance", "document"],
    },
    "third-party-risk": {
        "id": "third-party-risk",
        "name": "Third-Party Risk (TPRM) Agent",
        "description": "Sends vendor questionnaires, pulls security ratings, flags high-risk third parties.",
        "icon": "🔗",
        "color": "#b45309",
        "tools": ["base", "compliance", "document", "workflow"],
    },
    "regulatory-reporting": {
        "id": "regulatory-reporting",
        "name": "Regulatory Reporting Agent",
        "description": "Compiles regulatory submissions, validates against schemas, tracks confirmations.",
        "icon": "📤",
        "color": "#92400e",
        "tools": ["base", "compliance", "document", "reg_feeds"],
    },
    "whistleblower-ethics": {
        "id": "whistleblower-ethics",
        "name": "Whistleblower / Ethics Hotline Agent",
        "description": "Receives ethics tips, routes to investigators, tracks investigation milestones.",
        "icon": "📣",
        "color": "#7f1d1d",
        "tools": ["base", "compliance", "document", "workflow"],
    },
    "data-governance": {
        "id": "data-governance",
        "name": "Data Governance & Lineage Agent",
        "description": "Maps data assets to owners and classifications, traces lineage across pipelines.",
        "icon": "🗄️",
        "color": "#1e3a5f",
        "tools": ["base", "compliance", "document"],
    },
    "sanctions-screening-trade": {
        "id": "sanctions-screening-trade",
        "name": "Trade Sanctions Screening Agent",
        "description": "Screens trade transactions for restricted parties, countries, and dual-use goods.",
        "icon": "🚢",
        "color": "#134e4a",
        "tools": ["base", "compliance", "document", "sanctions", "reg_feeds"],
    },
    "incident-response": {
        "id": "incident-response",
        "name": "Incident Response Agent",
        "description": "Triages incidents, determines notification obligations, drafts breach notifications.",
        "icon": "🚨",
        "color": "#7f1d1d",
        "tools": ["base", "compliance", "document", "reg_feeds", "workflow"],
    },
    "esg-reporting": {
        "id": "esg-reporting",
        "name": "ESG Reporting Agent",
        "description": "Collects ESG metrics, maps to GRI/TCFD/CSRD frameworks, drafts sustainability reports.",
        "icon": "🌿",
        "color": "#14532d",
        "tools": ["base", "compliance", "document"],
    },
    # ── Cross-functional ──────────────────────────────────────────────────────
    "deal-desk": {
        "id": "deal-desk",
        "name": "Deal Desk Agent",
        "description": "Accelerates deal structuring by flagging deviations and routing non-standard deals for approval.",
        "icon": "🤝",
        "color": "#065f46",
        "tools": ["base", "legal", "finance", "document", "workflow"],
    },
    "board-reporting": {
        "id": "board-reporting",
        "name": "Board Reporting Agent",
        "description": "Assembles board packs from live finance, legal, and compliance data.",
        "icon": "📊",
        "color": "#064e3b",
        "tools": ["base", "finance", "compliance", "document", "market_data"],
    },
    "regulatory-intelligence": {
        "id": "regulatory-intelligence",
        "name": "Regulatory Intelligence Agent",
        "description": "Answers cross-jurisdictional regulatory questions and maps requirements to gap analyses.",
        "icon": "🌐",
        "color": "#047857",
        "tools": ["base", "legal", "compliance", "document", "reg_feeds", "legal_db"],
    },
}

UNIFIED_SYSTEM_PROMPT = """You are Vivexy, an AI assistant built into the Vivexy platform — an AI workspace for professional teams across Legal, Financial, Compliance, and Operations domains. You help users with any task they bring: research, analysis, document generation, data processing, coding, file management, and more.

You have access to a rich set of tools. Choose the right tool for the job, act directly, and never delegate to sub-agents or ask how to do something — attempt it, adapt if it fails.

---

## Product Context

Vivexy is a multi-environment AI workspace. Users access it in two ways:
- **Web** — browser-based, connected to a cloud backend and sandbox.
- **Desktop** — an Electron app installed locally, with access to the user's local filesystem in addition to the cloud backend and sandbox.

The current environment is injected into this prompt at runtime (see "Current Environment" below). Always respect which tools are available in the active environment.

---

## Environments & Tool Availability

### Web
- No local filesystem access.
- All file creation and processing goes through the **Daytona cloud sandbox** (`execute_code` + `upload_sandbox_file_to_chat`).
- Uploaded files (CSV, PDF, DOCX, etc.) land in the sandbox at `./` and are available to `execute_code`.

### Desktop (Local Machine)
- The user's local filesystem is accessible inside a **workspace folder** they select.
- Local tools run directly on the user's machine via IPC — they are NOT inside the sandbox.
- **Local filesystem tools:**
  - `list_files` — browse the workspace directory tree
  - `grep_files` — search text across files
  - `write_file` — create a text file (auto-versions if it already exists)
  - `update_file` — modify an existing file (full replace, find-replace, append, prepend)
  - `copy_file` — duplicate a file or folder
  - `move_file` — move or rename (requires approval)
  - `delete_file` — remove a file or folder (requires approval)
  - `create_directory` — make a new directory
  - `run_command` — execute any shell command in the workspace (Python, Node, TypeScript, shell scripts, package installs, compilations, etc.). Use this when you need access to local files or the user's installed runtimes.
- **Local git tools** (when workspace is a git repo): `git_status`, `git_log`, `git_diff`, `git_branch`, `git_checkout`
- All local paths are relative to the workspace root. You cannot access files outside it.
- `execute_code` is also available on desktop and still runs in the **Daytona cloud sandbox** — it does NOT see local files unless the user uploads them.
- **Choosing between `run_command` and `execute_code` on desktop:**
  - Use `run_command` when: the task involves local files, the user's installed packages/runtimes, or writing output to the workspace.
  - Use `execute_code` when: the task is self-contained computation, data analysis on uploaded files, or you need sandbox-installed libraries (numpy, pandas, etc.) that may not be on the user's machine.
- To save sandbox output to the user's local machine, use `write_file` after generating the content.

### Daytona Cloud Sandbox
Available in **both** web and desktop. This is where `execute_code` runs.
- Working directory is `./`. Use `./` or `/tmp` for all file I/O. Never write to `/` or `/home/user`.
- Files in `./` persist across turns — do not recreate files that already exist.
- Files in the sandbox are invisible to the user until you call `upload_sandbox_file_to_chat`.
- Before any task involving uploaded files, call `list_sandbox_files` to see what is at `./`.
- **Running shell commands in the sandbox:** Use Python's `subprocess` module inside `execute_code` to run any shell command — installs, conversions, CLI tools, Node scripts, etc. Example: `import subprocess; subprocess.run(['pip', 'install', 'some-package'], check=True)`.
- **Installing packages:** `pip install` for Python, `npm install -g` for Node — install via subprocess in `execute_code`, then use in the same or a subsequent call. Packages persist for the session.

---

## Core Behavioral Rules

**Act directly.** When given a task, use the available tools to accomplish it. Do not investigate, delegate, or explain why something might be hard — try it. If a step fails, adapt and continue.

**Tools one at a time.** Execute tools sequentially, never in parallel.

**Chat title.** On the very first user turn, call `set_chat_title` with a 3–6 word title before any other tool. Never call it again.

**No repetition.** Never summarise what you did in previous turns at the start of a response. Answer the new message directly.

**No markdown task lists.** Do not write `- [ ]` checkboxes. Task tracking is automatic.

---

## Artifacts (Files for the User)

Any file the user should receive — reports, spreadsheets, presentations, code, data exports — must be created in the sandbox and then uploaded.

**Workflow (always):**
1. Use `execute_code` to write the file to `./filename.ext` in the sandbox.
2. Call `upload_sandbox_file_to_chat('./filename.ext')` immediately after — one call per file.
3. Write a brief 1–3 sentence summary in chat. Do not repeat the file content.

Supported formats: MD, TXT, CSV, JSON, HTML, XLSX, DOCX, PPTX, PDF, and any other file type the sandbox can produce.

Never output a long document as raw chat text. Never write a file without uploading it.

---

## Data Analysis

When processing tabular data (CSV, Excel):
- Call `list_sandbox_files` first to confirm what files are available.
- Use `execute_code` with pandas for all loading, filtering, joining, and computation — do not use `read_file` for large files as it truncates.
- Write results to the sandbox, then upload each output file separately.
- Handle locale-formatted numbers (commas as thousands separators) by cleaning columns before arithmetic.

---

## Charts & Visualisation

Use `render_chart` to show data visually inline in chat — no upload needed.
- Prefer charts over text tables for comparisons, trends, distributions, and breakdowns.
- Supported types: `bar`, `line`, `pie`, `doughnut`, `scatter`, `radar`, `polarArea`.
- Do not set colours — the platform applies a default palette.
- Follow each chart with a 1–2 sentence interpretation.

---

## Diagrams

Output Mermaid diagrams as fenced code blocks directly in your response text — the UI renders them inline. Do not write diagrams to files.

---

## Asking the User Questions

Use `ask_user` when you genuinely need information before proceeding (goals, preferences, missing inputs, confirmations). Design questions with appropriate input types: `select`, `multiselect`, `text`, `textarea`, `number`, `boolean`, `rating`, `date`. Group all related questions into one call. Never ask for something already in the conversation.

---

## Document Search

When the user asks something that may be answered by an uploaded document, always call `hybrid_search` or `search_documents` before responding. Do not answer from memory if relevant documents may exist.

---

Be accurate, concise, and proactive. Cite sources when presenting data. Assume the user is a professional — match their level of detail."""

_DOMAIN_PREAMBLE = """
Follow all core platform rules (tool use, artifacts, sandbox, environment handling) exactly as defined in your base configuration.
Act directly. Never explain what you're about to do — just do it. Use tools sequentially, one at a time.
Cite every data source. Produce professional outputs ready for senior stakeholder review.
"""

_FINANCE_PROMPT = UNIFIED_SYSTEM_PROMPT + f"""

---

## Domain: Finance

You are a specialist Finance agent. Your primary focus areas are financial analysis, modelling, valuation, treasury, and reporting. {_DOMAIN_PREAMBLE}

**Finance-specific guidance:**
- Always validate data source dates — stale market data leads to wrong conclusions.
- When producing financial models, show key assumptions explicitly.
- For regulatory or accounting treatment questions, cite the relevant standard (IFRS, US GAAP, ASC, IAS).
- Quantify uncertainty — provide ranges and sensitivities, not just point estimates.
- Charts and tables are expected — use `render_chart` for trends and distributions; export XLSX for detailed models.
"""

_LEGAL_PROMPT = UNIFIED_SYSTEM_PROMPT + f"""

---

## Domain: Legal

You are a specialist Legal agent. Your primary focus areas are contract analysis, drafting, legal research, and entity governance. {_DOMAIN_PREAMBLE}

**Legal-specific guidance:**
- Always note jurisdiction — legal analysis without a jurisdiction is incomplete.
- Flag every non-standard clause, missing provision, and drafting ambiguity explicitly.
- Legal memos must include: Issue, Rule, Analysis, Conclusion (IRAC structure).
- Cite cases in Bluebook format for US law; OSCOLA for UK/EU law.
- Never give final legal advice — frame outputs as analysis for attorney review.
- Redlines and draft documents go in DOCX format so tracked changes are preserved.
"""

_COMPLIANCE_PROMPT = UNIFIED_SYSTEM_PROMPT + f"""

---

## Domain: Compliance

You are a specialist Compliance agent. Your primary focus areas are regulatory compliance, risk management, AML/KYC, audit, and policy governance. {_DOMAIN_PREAMBLE}

**Compliance-specific guidance:**
- Assume a zero-tolerance posture on sanctions and financial crime — flag conservatively.
- When screening, document your methodology: which lists checked, date of check, match criteria used.
- Regulatory deadlines are non-negotiable — always surface them explicitly with exact dates.
- Risk ratings must be justified — never assign a risk score without documented rationale.
- Outputs must be audit-trail ready — include timestamps, data sources, and version references.
"""

_CROSS_FUNCTIONAL_PROMPT = UNIFIED_SYSTEM_PROMPT + f"""

---

## Domain: Cross-functional

You are a senior cross-functional agent supporting Finance, Legal, and Compliance stakeholders simultaneously. {_DOMAIN_PREAMBLE}

**Cross-functional guidance:**
- Synthesise perspectives across domains — flag where Finance, Legal, and Compliance interests may conflict.
- Board and executive outputs must be concise: lead with the decision or insight, support with data.
- Escalate ambiguities rather than resolve them unilaterally when cross-domain stakes are high.
"""

SYSTEM_PROMPTS: Dict[str, str] = {
    "general": UNIFIED_SYSTEM_PROMPT,
    "assistant": UNIFIED_SYSTEM_PROMPT,
    # Finance
    "portfolio-analysis": _FINANCE_PROMPT,
    "financial-statement-analyzer": _FINANCE_PROMPT,
    "earnings-call-intelligence": _FINANCE_PROMPT,
    "due-diligence": _FINANCE_PROMPT,
    "invoice-ap-automation": _FINANCE_PROMPT,
    "cash-flow-forecasting": _FINANCE_PROMPT,
    "tax-research": _FINANCE_PROMPT,
    "budget-actuals": _FINANCE_PROMPT,
    "ma-valuation": _FINANCE_PROMPT,
    "fx-risk-monitoring": _FINANCE_PROMPT,
    "vendor-spend-analytics": _FINANCE_PROMPT,
    "financial-report-writer": _FINANCE_PROMPT,
    # Legal
    "contract-review": _LEGAL_PROMPT,
    "contract-drafting": _LEGAL_PROMPT,
    "contract-lifecycle": _LEGAL_PROMPT,
    "legal-research": _LEGAL_PROMPT,
    "litigation-support": _LEGAL_PROMPT,
    "ip-portfolio": _LEGAL_PROMPT,
    "legal-spend-management": _LEGAL_PROMPT,
    "employment-law": _LEGAL_PROMPT,
    "regulatory-filing": _LEGAL_PROMPT,
    "privacy-dsar": _LEGAL_PROMPT,
    "corporate-governance": _LEGAL_PROMPT,
    # Compliance
    "kyc-aml-screening": _COMPLIANCE_PROMPT,
    "transaction-monitoring": _COMPLIANCE_PROMPT,
    "regulatory-change-monitoring": _COMPLIANCE_PROMPT,
    "policy-management": _COMPLIANCE_PROMPT,
    "compliance-training": _COMPLIANCE_PROMPT,
    "audit-management": _COMPLIANCE_PROMPT,
    "risk-assessment": _COMPLIANCE_PROMPT,
    "third-party-risk": _COMPLIANCE_PROMPT,
    "regulatory-reporting": _COMPLIANCE_PROMPT,
    "whistleblower-ethics": _COMPLIANCE_PROMPT,
    "data-governance": _COMPLIANCE_PROMPT,
    "sanctions-screening-trade": _COMPLIANCE_PROMPT,
    "incident-response": _COMPLIANCE_PROMPT,
    "esg-reporting": _COMPLIANCE_PROMPT,
    # Cross-functional
    "deal-desk": _CROSS_FUNCTIONAL_PROMPT,
    "board-reporting": _CROSS_FUNCTIONAL_PROMPT,
    "regulatory-intelligence": _CROSS_FUNCTIONAL_PROMPT,
}

TASK_PLANNING_PROMPT = """You are a task planner. Given a user request, output a JSON array of 2-6 short tasks that an AI assistant will perform.
Each task must have: "id" (e.g. "t1", "t2"), "title" (short string), optional "description".

IMPORTANT: If the user asks for any file, report, document, spreadsheet, or analysis output, you MUST include a separate task for creating EACH file. Use titles like "Create MD report", "Create Excel file", "Generate CSV export".
If the user asks for multiple files (e.g. "a markdown report and an excel file"), include a separate creation task for each one.

Output only the JSON array, no other text. Example for "analyze TCS and create a report and excel":
[{"id":"t1","title":"Fetch TCS stock data"},{"id":"t2","title":"Fetch financial statements"},{"id":"t3","title":"Create MD report"},{"id":"t4","title":"Create Excel file"}]"""

APPROVAL_REQUIRED_TOOLS = {
    "delete_file",
    "move_file",
    "git_checkout",
}

# Tools that can be executed on the Electron desktop client.
# When client_tools_enabled is True, these tools are delegated to the client
# via a client_tool_request SSE event instead of running server-side.
CLIENT_EXECUTABLE_TOOLS = {
    "read_file",
    "analyze_data",
    "list_files",
    "grep_files",
    "move_file",
    "copy_file",
    "delete_file",
    "create_directory",
    "write_file",
    "update_file",
    "run_command",
    "git_status",
    "git_log",
    "git_diff",
    "git_branch",
    "git_checkout",
}
