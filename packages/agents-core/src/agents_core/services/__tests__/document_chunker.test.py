from agents_core.services.document_chunker import chunk_page, chunk_pages
from agents_core.services.document_parser import ParsedPage


def _long_page(page_number=1, paragraphs=12):
    text = "\n\n".join(
        f"Paragraph {index}. " + "The parties agree to the terms set out below. " * 8
        for index in range(paragraphs)
    )
    return ParsedPage(page_number=page_number, text=text)


def test_offsets_point_back_to_the_exact_page_text():
    page = _long_page()
    chunks = chunk_page(page, chunk_size=500, overlap=100)

    assert len(chunks) > 3
    for chunk in chunks:
        assert page.text[chunk.char_start : chunk.char_end] == chunk.text
        assert chunk.text == chunk.text.strip()
        assert len(chunk.text) <= 500


def test_chunks_cover_the_page_with_overlap():
    page = _long_page()
    chunks = chunk_page(page, chunk_size=500, overlap=100)

    assert chunks[0].char_start == 0
    assert chunks[-1].char_end == len(page.text.rstrip())
    for previous, current in zip(chunks, chunks[1:]):
        assert current.char_start < previous.char_end
        assert current.char_start > previous.char_start


def test_chunks_prefer_paragraph_breaks():
    page = _long_page()
    chunk = chunk_page(page, chunk_size=800, overlap=0)[0]

    assert page.text[chunk.char_end :].lstrip(" ").startswith("\n\n")


def test_short_and_blank_pages():
    assert [c.text for c in chunk_page(ParsedPage(1, "Short clause."))] == [
        "Short clause."
    ]
    assert chunk_page(ParsedPage(2, "   \n  ")) == []


def test_chunks_never_cross_pages():
    pages = [_long_page(1), _long_page(2)]
    chunks = chunk_pages(pages)

    assert {chunk.page_number for chunk in chunks} == {1, 2}
    for chunk in chunks:
        assert (
            pages[chunk.page_number - 1].text[chunk.char_start : chunk.char_end]
            == chunk.text
        )
