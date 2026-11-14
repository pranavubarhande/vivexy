"""Write a test set for review grids: 20 synthetic services agreements as Word
files, the questions to ask, and the answer each cell should give.

python -m agents_core.cli.make_review_test_set <out_dir>

Writes <out_dir>/contracts/*.docx, <out_dir>/questions.json and
<out_dir>/expected.jsonl. Upload the contracts, then score a review with
agents_core.cli.eval_document_analyses. Some contracts leave clauses out on
purpose, so "not found" answers are tested too. The values are fixed, so
every run produces the same files.
"""

import argparse
import json
import os
import sys
from typing import Any, Dict, List

from docx import Document as WordDocument

PROVIDERS = [
    "Northwind Analytics LLC",
    "Bluefin Logistics Inc.",
    "Cedar & Pine Software Ltd.",
    "Halcyon Data Services Corp.",
    "Ironbridge Consulting LLP",
]
CUSTOMERS = [
    "Harlow Pierce LLP",
    "Marston Retail Group",
    "Quayside Health Partners",
    "Orchard Valley Foods Inc.",
]
LAWS = ["New York", "Delaware", "California", "Texas", "England and Wales"]
TERMS = ["one (1) year", "two (2) years", "three (3) years", "thirty-six (36) months"]
CAPS = [
    "the fees paid in the twelve (12) months before the claim",
    "$250,000",
    "two times (2x) the annual fees",
    "$1,000,000",
]
NOTICE_DAYS = ["thirty (30)", "sixty (60)", "ninety (90)"]
PAYMENT_DAYS = ["thirty (30)", "forty-five (45)", "sixty (60)"]
CONFIDENTIALITY_YEARS = ["three (3)", "five (5)", "seven (7)"]

QUESTIONS = [
    {
        "label": "Governing law",
        "prompt": "Which jurisdiction's law governs this agreement?",
    },
    {"label": "Initial term", "prompt": "How long is the initial term?"},
    {
        "label": "Auto-renewal",
        "prompt": "Does the agreement renew automatically, and for how long?",
    },
    {
        "label": "Termination for convenience",
        "prompt": "Can a party terminate for convenience, and how much notice "
        "is required?",
    },
    {"label": "Liability cap", "prompt": "What is the cap on each party's liability?"},
    {"label": "Payment terms", "prompt": "Within how many days must invoices be paid?"},
    {
        "label": "Confidentiality period",
        "prompt": "How long do confidentiality obligations last after termination?",
    },
    {
        "label": "Assignment",
        "prompt": "Can either party assign the agreement without consent?",
    },
]

FILLER = [
    "Services. The Provider shall perform the services described in each "
    "Statement of Work with reasonable skill and care and in accordance with "
    "good industry practice.",
    "Personnel. The Provider shall ensure that its personnel are suitably "
    "qualified and comply with the Customer's reasonable site rules.",
    "Acceptance. Deliverables are accepted when the Customer confirms in "
    "writing that they materially conform to the Statement of Work.",
    "Insurance. The Provider shall maintain professional indemnity and "
    "general liability insurance with reputable insurers.",
    "Data protection. Each party shall comply with applicable data protection "
    "laws in connection with this Agreement.",
    "Force majeure. Neither party is liable for delay caused by events beyond "
    "its reasonable control, provided it gives prompt notice.",
    "Notices. Notices must be in writing and delivered by hand, courier or "
    "email to the addresses in the order form.",
    "Entire agreement. This Agreement is the entire agreement between the "
    "parties about its subject matter.",
]


def _contract(index: int) -> Dict[str, Any]:
    """The facts of one contract. A few clauses are dropped on a fixed pattern
    so the grid must answer "not found"."""
    renews = index % 3 != 0
    return {
        "filename": f"services-agreement-{index + 1:02d}.docx",
        "provider": PROVIDERS[index % len(PROVIDERS)],
        "customer": CUSTOMERS[index % len(CUSTOMERS)],
        "law": LAWS[index % len(LAWS)],
        "term": TERMS[index % len(TERMS)],
        "renewal": "successive one (1) year periods" if renews else None,
        "convenience": (
            NOTICE_DAYS[index % len(NOTICE_DAYS)] if index % 4 != 1 else None
        ),
        "cap": CAPS[index % len(CAPS)] if index % 5 != 2 else None,
        "payment": PAYMENT_DAYS[index % len(PAYMENT_DAYS)],
        "confidentiality": (
            CONFIDENTIALITY_YEARS[index % len(CONFIDENTIALITY_YEARS)]
            if index % 6 != 4
            else None
        ),
        "assignment_free": index % 2 == 0,
    }


def _clauses(facts: Dict[str, Any]) -> List[str]:
    clauses = [
        f"Term. This Agreement starts on the Effective Date and continues for "
        f"an initial term of {facts['term']}."
        + (
            f" It then renews automatically for {facts['renewal']} unless either "
            "party gives notice of non-renewal at least sixty (60) days before "
            "the end of the then-current term."
            if facts["renewal"]
            else " It does not renew automatically; any extension must be "
            "agreed in writing."
        ),
        f"Fees and payment. The Customer shall pay each undisputed invoice "
        f"within {facts['payment']} days of receipt.",
    ]
    if facts["convenience"]:
        clauses.append(
            "Termination for convenience. Either party may terminate this "
            f"Agreement for convenience on {facts['convenience']} days' written "
            "notice to the other party."
        )
    else:
        clauses.append(
            "Termination for cause. Either party may terminate this Agreement "
            "if the other party commits a material breach and fails to remedy "
            "it within thirty (30) days of notice."
        )
    if facts["cap"]:
        clauses.append(
            "Limitation of liability. Each party's total liability arising out "
            f"of or in connection with this Agreement is limited to {facts['cap']}."
        )
    if facts["confidentiality"]:
        clauses.append(
            "Confidentiality. Each party shall keep the other's Confidential "
            "Information confidential during the term and for "
            f"{facts['confidentiality']} years after termination."
        )
    clauses.append(
        "Assignment. Either party may assign this Agreement to an affiliate or "
        "successor without the other party's consent."
        if facts["assignment_free"]
        else "Assignment. Neither party may assign this Agreement without the "
        "prior written consent of the other party."
    )
    clauses.append(
        f"Governing law. This Agreement is governed by the laws of {facts['law']}."
    )
    return clauses


def _expected(facts: Dict[str, Any]) -> List[Dict[str, Any]]:
    """A cell is correct when its answer contains any of `expected` as whole
    words (case-insensitive), or it says not found when `found` is false."""

    def number(phrase: str) -> List[str]:
        words, digits = phrase.split(" (")[0], phrase.split("(")[1].split(")")[0]
        return [words, digits]

    renewal = facts["renewal"]
    rows = [
        ("Governing law", True, [facts["law"]]),
        ("Initial term", True, number(facts["term"])),
        (
            "Auto-renewal",
            True,
            (
                ["one (1) year", "1 year", "one year", "1-year", "one-year"]
                if renewal
                else ["not renew", "does not", "no"]
            ),
        ),
        (
            "Termination for convenience",
            True,
            (
                number(facts["convenience"])
                if facts["convenience"]
                else ["no", "not", "only for cause", "material breach"]
            ),
        ),
        (
            "Liability cap",
            bool(facts["cap"]),
            (
                {
                    "the fees paid in the twelve (12) months before the claim": [
                        "12",
                        "twelve",
                    ],
                    "$250,000": ["250,000"],
                    "two times (2x) the annual fees": ["2x", "two times", "twice"],
                    "$1,000,000": ["1,000,000", "1 million"],
                }[facts["cap"]]
                if facts["cap"]
                else []
            ),
        ),
        ("Payment terms", True, number(facts["payment"])),
        (
            "Confidentiality period",
            bool(facts["confidentiality"]),
            number(facts["confidentiality"]) if facts["confidentiality"] else [],
        ),
        (
            "Assignment",
            True,
            (
                ["affiliate", "successor"]
                if facts["assignment_free"]
                else ["prior written consent", "may not", "cannot", "not without"]
            ),
        ),
    ]
    return [
        {
            "filename": facts["filename"],
            "question": label,
            "found": found,
            "expected": expected,
        }
        for label, found, expected in rows
    ]


def _write_contract(path: str, facts: Dict[str, Any]) -> None:
    word = WordDocument()
    word.add_heading("Master Services Agreement", level=1)
    word.add_paragraph(
        f"This Master Services Agreement is made between {facts['provider']} "
        f"(the “Provider”) and {facts['customer']} (the “Customer”)."
    )
    clauses = _clauses(facts)
    body = []
    for index, clause in enumerate(clauses):
        body.append(clause)
        start = (index * 2) % len(FILLER)
        body.extend(FILLER[start : start + 2])
    for number, clause in enumerate(body, start=1):
        word.add_paragraph(f"{number}. {clause}")
    word.save(path)


def write_test_set(out_dir: str, count: int = 20) -> Dict[str, int]:
    contracts_dir = os.path.join(out_dir, "contracts")
    os.makedirs(contracts_dir, exist_ok=True)
    expected = []
    for index in range(count):
        facts = _contract(index)
        _write_contract(os.path.join(contracts_dir, facts["filename"]), facts)
        expected.extend(_expected(facts))
    with open(os.path.join(out_dir, "questions.json"), "w") as handle:
        json.dump(QUESTIONS, handle, indent=2)
    with open(os.path.join(out_dir, "expected.jsonl"), "w") as handle:
        for row in expected:
            handle.write(json.dumps(row) + "\n")
    return {"contracts": count, "cells": len(expected)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out_dir")
    parser.add_argument("--count", type=int, default=20)
    args = parser.parse_args()
    print(json.dumps(write_test_set(args.out_dir, args.count)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
