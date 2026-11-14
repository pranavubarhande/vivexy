import json
import logging
import re
from dataclasses import replace
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage

from agents_core.agents.config import AgentConfig
from agents_core.agents.llm_factory import create_llm
from agents_core.models import DocumentPage

logger = logging.getLogger(__name__)

CITATION_MARKER_PATTERN = re.compile(r"\[\^([0-9a-f]{8})\]")
GROUPED_MARKER_PATTERN = re.compile(r"\[\^[0-9a-f]{8}(?:\s*[,;]\s*\^?[0-9a-f]{8})+\]")
MARKER_ID_PATTERN = re.compile(r"[0-9a-f]{8}")
OPENING_CHARS = 600
SPACE_BEFORE_PUNCTUATION = re.compile(r"\s+([.,;:!?])")
SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])|\n+")
MAX_STATEMENTS = 25
MAX_QUOTE_CHARS = 1500

VERIFY_PROMPT = (
    "You check whether statements in a legal assistant's answer are supported "
    "by the source passages they cite.\n\n"
    "For each statement, decide whether its cited passages fully support it. A "
    "statement is supported only if every factual claim in it can be found in, or "
    "directly follows from, the passages. Paraphrase is fine. Added facts, "
    "numbers, dates, names or legal conclusions not in the passages are not "
    "supported.\n\n"
    "A defined term and the party or thing it names are the same: if a "
    'document\'s opening defines Acme Inc. as "the Customer", a statement '
    "about Acme is supported by a passage about the Customer. Use the "
    "document openings below to resolve such names.\n\n"
    "{openings}"
    "{statements}\n\n"
    "Reply with only a JSON array, one object per statement, in order:\n"
    '[{{"index": 0, "supported": true, "reason": "short reason"}}]'
)


def normalize_citation_markers(text: str) -> str:
    """Models sometimes group markers as [^a, ^b]; split them into [^a][^b]."""
    return GROUPED_MARKER_PATTERN.sub(
        lambda match: "".join(
            f"[^{marker_id}]" for marker_id in MARKER_ID_PATTERN.findall(match.group(0))
        ),
        text,
    )


def cited_ids_in_order(answer: str) -> List[str]:
    seen: List[str] = []
    for marker_id in CITATION_MARKER_PATTERN.findall(
        normalize_citation_markers(answer)
    ):
        if marker_id not in seen:
            seen.append(marker_id)
    return seen


def extract_cited_statements(answer: str) -> List[Dict[str, Any]]:
    statements = []
    for sentence in SENTENCE_BOUNDARY.split(normalize_citation_markers(answer)):
        marker_ids = list(dict.fromkeys(CITATION_MARKER_PATTERN.findall(sentence)))
        if not marker_ids:
            continue
        text = CITATION_MARKER_PATTERN.sub("", sentence).strip(" -*#>\t")
        text = SPACE_BEFORE_PUNCTUATION.sub(r"\1", text)
        if text:
            statements.append({"text": text, "citationIds": marker_ids})
    return statements[:MAX_STATEMENTS]


def _quote(citation: Dict[str, Any]) -> str:
    return citation["quote"][:MAX_QUOTE_CHARS]


def _format_statements(
    statements: List[Dict[str, Any]], citations: Dict[str, Dict[str, Any]]
) -> str:
    blocks = []
    for index, statement in enumerate(statements):
        passages = "\n".join(
            f'  Passage {citation_id}: "{_quote(citations[citation_id])}"'
            for citation_id in statement["citationIds"]
            if citation_id in citations
        )
        blocks.append(f"Statement {index}: {statement['text']}\n{passages}")
    return "\n\n".join(blocks)


def _parse_verdicts(raw: str) -> List[Dict[str, Any]]:
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        raise ValueError("No JSON array in verification response")
    return json.loads(match.group(0))


def _first_pages(document_ids: List[str]) -> Dict[str, str]:
    pages = DocumentPage.query.filter(
        DocumentPage.document_id.in_(document_ids), DocumentPage.page_number == 1
    ).all()
    return {page.document_id: page.text for page in pages}


def _document_openings(
    statements: List[Dict[str, Any]], citations: Dict[str, Dict[str, Any]]
) -> str:
    """The start of each cited document, where parties and defined terms are
    usually introduced."""
    documents: Dict[str, str] = {}
    for statement in statements:
        for citation_id in statement["citationIds"]:
            citation = citations.get(citation_id)
            if citation and citation.get("documentId"):
                documents.setdefault(citation["documentId"], citation.get("filename"))
    if not documents:
        return ""
    lines = [
        f'- {documents[document_id]}: "{" ".join(text.split())[:OPENING_CHARS]}"'
        for document_id, text in _first_pages(list(documents)).items()
        if text and text.strip()
    ]
    if not lines:
        return ""
    return "Document openings:\n" + "\n".join(lines) + "\n\n"


def check_citations(
    answer: str,
    citations: Dict[str, Dict[str, Any]],
    provider: str,
    model_id: str,
    user_api_keys: Optional[dict] = None,
) -> Optional[Dict[str, Any]]:
    """Ask the chat's own model whether each cited sentence is supported by
    the passages it cites. Returns None when there is nothing to check or
    the check itself fails, so a broken verifier never blocks an answer."""
    statements = [
        statement
        for statement in extract_cited_statements(answer)
        if any(citation_id in citations for citation_id in statement["citationIds"])
    ]
    unknown_ids = [
        citation_id
        for citation_id in cited_ids_in_order(answer)
        if citation_id not in citations
    ]
    if not statements and not unknown_ids:
        return None

    results = []
    if statements:
        config = replace(
            AgentConfig.from_env(
                provider=provider, model=model_id, user_api_keys=user_api_keys
            ),
            temperature=0,
            max_tokens=2000,
        )
        try:
            response = create_llm(config).invoke(
                [
                    HumanMessage(
                        content=VERIFY_PROMPT.format(
                            openings=_document_openings(statements, citations),
                            statements=_format_statements(statements, citations),
                        )
                    )
                ]
            )
            content = response.content
            if isinstance(content, list):
                content = "".join(
                    part.get("text", "") if isinstance(part, dict) else str(part)
                    for part in content
                )
            verdicts = {
                verdict.get("index"): verdict for verdict in _parse_verdicts(content)
            }
        except Exception:
            logger.exception("Citation check failed")
            return None
        for index, statement in enumerate(statements):
            verdict = verdicts.get(index, {})
            results.append(
                {
                    **statement,
                    "supported": bool(verdict.get("supported", False)),
                    "reason": str(verdict.get("reason", "Not checked"))[:300],
                }
            )

    return {
        "statements": results,
        "unsupportedCount": sum(1 for result in results if not result["supported"]),
        "unknownCitationIds": unknown_ids,
    }
