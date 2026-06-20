"""
Contract analysis tools — clause extraction and risk scoring.
Works on text already extracted from documents (via doc_parser tools or RAG).
"""

import json
import re
from typing import List

from langchain_core.tools import BaseTool, tool

# Standard clauses that should be present in most commercial agreements
_STANDARD_CLAUSES = [
    "indemnification",
    "limitation of liability",
    "governing law",
    "dispute resolution",
    "termination",
    "intellectual property",
    "confidentiality",
    "warranties",
    "payment terms",
    "force majeure",
    "assignment",
    "entire agreement",
]

# High-risk patterns worth flagging regardless of contract type
_RISK_PATTERNS = [
    (
        r"unlimited\s+liability",
        "HIGH",
        "Unlimited liability exposure — consider adding a cap.",
    ),
    (
        r"sole\s+discretion",
        "MEDIUM",
        "Unilateral discretion clause — may allow adverse changes without consent.",
    ),
    (
        r"perpetual|irrevocable",
        "MEDIUM",
        "Perpetual/irrevocable grant — verify this is intentional.",
    ),
    (
        r"indemnif(?:y|ication).{0,200}third.party",
        "HIGH",
        "Third-party indemnification — may expose party to unlimited third-party claims.",
    ),
    (
        r"automatic\s+renewal",
        "LOW",
        "Auto-renewal clause — ensure notice period is adequate.",
    ),
    (
        r"unilateral(?:ly)?\s+(?:amend|modify|change)",
        "HIGH",
        "Unilateral amendment right — counterparty can change terms without consent.",
    ),
    (
        r"liquidated\s+damages",
        "MEDIUM",
        "Liquidated damages clause — confirm amount is a genuine pre-estimate.",
    ),
    (
        r"exclusiv(?:e|ity)",
        "MEDIUM",
        "Exclusivity provision — check scope and duration.",
    ),
]


@tool
def analyze_contract_clauses(contract_text: str) -> str:
    """Analyse contract text to identify present/missing standard clauses and flag risk patterns.
    Args:
        contract_text: The full contract text to analyse
    """
    text_lower = contract_text.lower()

    present = [c for c in _STANDARD_CLAUSES if c in text_lower]
    missing = [c for c in _STANDARD_CLAUSES if c not in text_lower]

    risks = []
    for pattern, severity, note in _RISK_PATTERNS:
        matches = re.findall(pattern, text_lower)
        if matches:
            risks.append(
                {
                    "pattern": pattern,
                    "severity": severity,
                    "note": note,
                    "occurrences": len(matches),
                }
            )

    high_count = sum(1 for r in risks if r["severity"] == "HIGH")
    risk_score = "HIGH" if high_count >= 2 else "MEDIUM" if risks else "LOW"

    return json.dumps(
        {
            "risk_score": risk_score,
            "present_clauses": present,
            "missing_clauses": missing,
            "flagged_risks": risks,
            "summary": (
                f"Contract risk: {risk_score}. "
                f"{len(present)}/{len(_STANDARD_CLAUSES)} standard clauses present. "
                f"{len(risks)} risk pattern(s) found ({high_count} HIGH)."
            ),
        }
    )


@tool
def extract_contract_metadata(contract_text: str) -> str:
    """Extract key metadata from contract text: parties, effective date, term, governing law.
    Args:
        contract_text: The contract text to parse
    """
    patterns = {
        "effective_date": r"effective\s+(?:as\s+of\s+|date[:\s]+)?(\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        "governing_law": r"govern(?:ed|ing)\s+by\s+(?:the\s+laws?\s+of\s+)?([A-Z][a-zA-Z\s,]+?)(?:\.|,|\n)",
        "term": r"(?:initial\s+)?term\s+of\s+([\d]+\s+(?:year|month)s?)",
        "notice_period": r"(?:notice|termination)\s+(?:period\s+of\s+|with\s+)?(\d+\s+(?:day|business day)s?)",
    }
    extracted = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, contract_text, re.IGNORECASE)
        extracted[key] = match.group(1).strip() if match else None

    # Extract party names (heuristic: lines with "between", "and", proper nouns after "Party A")
    party_match = re.search(
        r"(?:between|among)\s+((?:[A-Z][^,\n]+?)(?:,?\s+(?:Inc|LLC|Ltd|Corp|LLP|LP|GmbH|PLC)\.?)?)\s*(?:and|,)\s*((?:[A-Z][^,\n]+?)(?:,?\s+(?:Inc|LLC|Ltd|Corp|LLP|LP|GmbH|PLC)\.?)?)",
        contract_text,
    )
    if party_match:
        extracted["party_a"] = party_match.group(1).strip()
        extracted["party_b"] = party_match.group(2).strip()

    return json.dumps(extracted)


def get_contract_tools() -> List[BaseTool]:
    return [analyze_contract_clauses, extract_contract_metadata]
