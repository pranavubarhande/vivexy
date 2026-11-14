"""Document passages as models see them: labelled P1, P2... in prompts, and
turned back into [^id] citation markers afterwards. Models copy short labels
reliably; long hex ids come back garbled."""

import re
from typing import Any, Dict, List

from agents_core.business_logic.citation_check import CITATION_MARKER_PATTERN
from agents_core.business_logic.document_search import chunk_citation
from agents_core.models import Document, DocumentChunk

PASSAGE_NUMBER = re.compile(r"\d+")
PASSAGE_MARKERS = re.compile(r"\[(P\d+(?:\s*[,;]\s*P?\d+)*)\]")
SPACE_BEFORE_PUNCTUATION = re.compile(r"[ \t]+([.,;:!?])")


def cited_passages(values: Any, passages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Passages a model cited by label in a JSON list such as ["P1", "P3"]."""
    found: List[Dict[str, Any]] = []
    for value in values if isinstance(values, list) else []:
        for number in PASSAGE_NUMBER.findall(str(value)):
            index = int(number) - 1
            if 0 <= index < len(passages) and passages[index] not in found:
                found.append(passages[index])
    return found


def passage_lines(passages: List[Dict[str, Any]], start: int = 1) -> str:
    return "\n".join(
        f"[P{start + index}] ({passage['filename']}, page {passage['pageNumber']}) "
        f"{' '.join(passage['quote'].split())}"
        for index, passage in enumerate(passages)
    )


def labels_to_markers(text: str, passages: List[Dict[str, Any]]) -> str:
    """Turns [P3] or [P3, P7] labels into [^id] markers, drops labels and
    raw markers that match no passage, and tidies the spacing left behind."""
    known = {passage["id"] for passage in passages}

    def markers(match: re.Match) -> str:
        return "".join(
            f"[^{passages[int(number) - 1]['id']}]"
            for number in PASSAGE_NUMBER.findall(match.group(1))
            if 0 < int(number) <= len(passages)
        )

    text = CITATION_MARKER_PATTERN.sub(
        lambda match: match.group(0) if match.group(1) in known else "", text
    )
    text = PASSAGE_MARKERS.sub(markers, text)
    return SPACE_BEFORE_PUNCTUATION.sub(r"\1", text)


def document_passages(document: Document) -> List[Dict[str, Any]]:
    chunks = (
        DocumentChunk.query.filter_by(document_id=document.id)
        .order_by(DocumentChunk.page_number, DocumentChunk.chunk_index)
        .all()
    )
    return [chunk_citation(chunk, document) for chunk in chunks]


def passage_batches(
    passages: List[Dict[str, Any]], max_chars: int
) -> List[List[Dict[str, Any]]]:
    batches: List[List[Dict[str, Any]]] = [[]]
    size = 0
    for passage in passages:
        length = len(passage["quote"])
        if batches[-1] and size + length > max_chars:
            batches.append([])
            size = 0
        batches[-1].append(passage)
        size += length
    return [batch for batch in batches if batch]
