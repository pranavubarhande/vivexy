from dataclasses import dataclass
from typing import Iterable, List

from agents_core.constants.documents import DOCUMENT_CHUNK_OVERLAP, DOCUMENT_CHUNK_SIZE
from agents_core.services.document_parser import ParsedPage

_BREAKS = ("\n\n", "\n", ". ", "; ", ", ", " ")


@dataclass
class TextChunk:
    page_number: int
    char_start: int
    char_end: int
    text: str


def _find_break(text: str, start: int, end: int) -> int:
    """Return the best place to cut text[start:end], preferring paragraph,
    then line, then sentence boundaries in the back half of the window."""
    window_floor = start + (end - start) // 2
    for separator in _BREAKS:
        position = text.rfind(separator, window_floor, end)
        if position != -1:
            return position + len(separator)
    return end


def chunk_page(
    page: ParsedPage,
    chunk_size: int = DOCUMENT_CHUNK_SIZE,
    overlap: int = DOCUMENT_CHUNK_OVERLAP,
) -> List[TextChunk]:
    text = page.text
    chunks: List[TextChunk] = []
    start = 0
    length = len(text)
    while start < length:
        while start < length and text[start].isspace():
            start += 1
        if start >= length:
            break
        end = min(start + chunk_size, length)
        if end < length:
            end = _find_break(text, start, end)
        trimmed_end = end
        while trimmed_end > start and text[trimmed_end - 1].isspace():
            trimmed_end -= 1
        chunks.append(
            TextChunk(
                page_number=page.page_number,
                char_start=start,
                char_end=trimmed_end,
                text=text[start:trimmed_end],
            )
        )
        if end >= length:
            break
        next_start = max(end - overlap, start + 1)
        word_boundary = text.find(" ", next_start, end)
        start = word_boundary + 1 if word_boundary != -1 else next_start
    return chunks


def chunk_pages(pages: Iterable[ParsedPage]) -> List[TextChunk]:
    return [chunk for page in pages for chunk in chunk_page(page)]
