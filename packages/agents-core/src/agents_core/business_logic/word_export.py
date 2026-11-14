"""Markdown with [^id] citation markers to a Word document with numbered
sources. Handles headings, bullets, numbered lists, tables and bold."""

import io
import re
from typing import Any, Dict, Iterable, List, Tuple

from docx import Document as WordDocument

from agents_core.business_logic.citation_check import (
    CITATION_MARKER_PATTERN,
    cited_ids_in_order,
)

HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
BULLET = re.compile(r"^\s*[-*+]\s+(.*)$")
NUMBERED = re.compile(r"^\s*\d+[.)]\s+(.*)$")
TABLE_ROW = re.compile(r"^\s*\|(.*)\|\s*$")
TABLE_RULE = re.compile(r"^\s*\|?\s*:?-{3,}")
BOLD = re.compile(r"\*\*(.+?)\*\*")


def _add_runs(paragraph, text: str) -> None:
    position = 0
    for match in BOLD.finditer(text):
        paragraph.add_run(text[position : match.start()])
        paragraph.add_run(match.group(1)).bold = True
        position = match.end()
    paragraph.add_run(text[position:])


def _add_markdown(word, markdown: str) -> None:
    lines = markdown.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        if TABLE_ROW.match(line):
            rows: List[List[str]] = []
            while index < len(lines) and TABLE_ROW.match(lines[index]):
                if not TABLE_RULE.match(lines[index]):
                    cells = TABLE_ROW.match(lines[index]).group(1).split("|")
                    rows.append([cell.strip() for cell in cells])
                index += 1
            width = max(len(row) for row in rows)
            table = word.add_table(rows=len(rows), cols=width)
            table.style = "Table Grid"
            for row_index, row in enumerate(rows):
                for column, text in enumerate(row):
                    _add_runs(table.cell(row_index, column).paragraphs[0], text)
            continue
        heading = HEADING.match(line)
        bullet = BULLET.match(line)
        numbered = NUMBERED.match(line)
        if heading:
            word.add_heading(
                heading.group(2).strip(), level=min(len(heading.group(1)) + 1, 4)
            )
        elif bullet:
            _add_runs(word.add_paragraph(style="List Bullet"), bullet.group(1))
        elif numbered:
            _add_runs(word.add_paragraph(style="List Number"), numbered.group(1))
        elif line.strip():
            _add_runs(word.add_paragraph(), line.strip())
        index += 1


def _page(citation: Dict[str, Any]) -> str:
    return f", p. {citation['pageNumber']}" if citation.get("paginated") else ""


def build_cited_document(
    title: str,
    sections: Iterable[Tuple[str, str, List[Dict[str, Any]]]],
    preamble: List[str] = (),
) -> bytes:
    """sections are (heading, markdown, citations). Markers become [1], [2]...
    numbered across the whole document, with a Sources list at the end."""
    word = WordDocument()
    word.add_heading(title, level=1)
    for line in preamble:
        word.add_paragraph(line)
    numbers: Dict[str, int] = {}
    sources: Dict[str, Dict[str, Any]] = {}
    for heading, markdown, citations in sections:
        by_id = {citation["id"]: citation for citation in citations}
        for marker in cited_ids_in_order(markdown):
            if marker in by_id and marker not in numbers:
                numbers[marker] = len(numbers) + 1
                sources[marker] = by_id[marker]
        text = CITATION_MARKER_PATTERN.sub(
            lambda match: (
                f"[{numbers[match.group(1)]}]" if match.group(1) in numbers else ""
            ),
            markdown,
        )
        word.add_heading(heading, level=2)
        _add_markdown(word, text)
    if numbers:
        word.add_heading("Sources", level=2)
        for marker, number in numbers.items():
            citation = sources[marker]
            quote = " ".join(citation["quote"].split())[:400]
            word.add_paragraph(
                f"[{number}] {citation['filename']}{_page(citation)}: “{quote}”"
            )
    buffer = io.BytesIO()
    word.save(buffer)
    return buffer.getvalue()
