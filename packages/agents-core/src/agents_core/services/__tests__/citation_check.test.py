from types import SimpleNamespace

import agents_core.business_logic.citation_check as citation_check
from agents_core.business_logic.citation_check import (
    check_citations,
    cited_ids_in_order,
    extract_cited_statements,
)

ANSWER = (
    "The contract is governed by New York law [^aaaa1111]. "
    "The supplier must indemnify the customer [^bbbb2222][^aaaa1111].\n\n"
    "- Termination needs 90 days notice [^cccc3333].\n"
    "This sentence has no citation."
)
CITATIONS = {
    "aaaa1111": {"id": "aaaa1111", "quote": "governed by the laws of New York"},
    "bbbb2222": {"id": "bbbb2222", "quote": "Supplier shall indemnify the Customer"},
}


class FakeLLM:
    def __init__(self, reply):
        self.reply = reply
        self.prompts = []

    def invoke(self, messages):
        self.prompts.append(messages[0].content)
        return SimpleNamespace(content=self.reply)


def test_cited_ids_in_order_of_first_use():
    assert cited_ids_in_order(ANSWER) == ["aaaa1111", "bbbb2222", "cccc3333"]


def test_extract_cited_statements_strips_markers_and_bullets():
    statements = extract_cited_statements(ANSWER)
    assert statements == [
        {
            "text": "The contract is governed by New York law.",
            "citationIds": ["aaaa1111"],
        },
        {
            "text": "The supplier must indemnify the customer.",
            "citationIds": ["bbbb2222", "aaaa1111"],
        },
        {"text": "Termination needs 90 days notice.", "citationIds": ["cccc3333"]},
    ]


def test_check_citations_records_verdicts_and_unknown_markers(monkeypatch):
    llm = FakeLLM(
        'Here you go: [{"index": 0, "supported": true, "reason": "stated"},'
        ' {"index": 1, "supported": false, "reason": "adds third parties"}]'
    )
    monkeypatch.setattr(citation_check, "create_llm", lambda config: llm)

    result = check_citations(ANSWER, CITATIONS, "openai", "gpt-test")

    assert [s["supported"] for s in result["statements"]] == [True, False]
    assert result["statements"][1]["reason"] == "adds third parties"
    assert result["unsupportedCount"] == 1
    assert result["unknownCitationIds"] == ["cccc3333"]
    assert 'Passage aaaa1111: "governed by the laws of New York"' in llm.prompts[0]


def test_check_citations_skips_answers_without_markers():
    assert (
        check_citations("No citations here.", CITATIONS, "openai", "gpt-test") is None
    )


def test_check_citations_never_raises(monkeypatch):
    monkeypatch.setattr(
        citation_check, "create_llm", lambda config: FakeLLM("not json")
    )
    assert check_citations(ANSWER, CITATIONS, "openai", "gpt-test") is None


def test_missing_verdicts_count_as_unsupported(monkeypatch):
    llm = FakeLLM('[{"index": 0, "supported": true, "reason": "ok"}]')
    monkeypatch.setattr(citation_check, "create_llm", lambda config: llm)
    result = check_citations(ANSWER, CITATIONS, "openai", "gpt-test")
    assert result["statements"][1] | {"supported": False} == result["statements"][1]
    assert result["unsupportedCount"] == 1


def test_grouped_markers_count_as_separate_citations():
    answer = (
        "Notice was given [^aaaa1111, ^bbbb2222]. Cap applies [^cccc3333; dddd4444]."
    )
    assert cited_ids_in_order(answer) == [
        "aaaa1111",
        "bbbb2222",
        "cccc3333",
        "dddd4444",
    ]
    assert extract_cited_statements(answer)[0] == {
        "text": "Notice was given.",
        "citationIds": ["aaaa1111", "bbbb2222"],
    }


def test_verifier_sees_document_openings_for_defined_terms(monkeypatch):
    llm = FakeLLM('[{"index": 0, "supported": true, "reason": "defined term"}]')
    monkeypatch.setattr(citation_check, "create_llm", lambda config: llm)
    monkeypatch.setattr(
        citation_check,
        "_first_pages",
        lambda ids: {
            "doc-msa": "MASTER SERVICES AGREEMENT between Brightline Industries "
            "Inc. (the Customer) and Okafor Logistics Ltd."
        },
    )
    citations = {
        "aaaa1111": {
            "id": "aaaa1111",
            "documentId": "doc-msa",
            "filename": "msa.pdf",
            "quote": "Service credits are the Customer's sole remedy.",
        }
    }

    result = check_citations(
        "Brightline's only remedy is service credits [^aaaa1111].",
        citations,
        "google",
        "gemini-test",
    )

    assert result["statements"][0]["supported"] is True
    prompt = llm.prompts[0]
    assert (
        'Document openings:\n- msa.pdf: "MASTER SERVICES AGREEMENT between Brightline'
        in prompt
    )
    assert "defined term" in prompt.lower()


def test_no_openings_without_document_ids(monkeypatch):
    llm = FakeLLM('[{"index": 0, "supported": true, "reason": "ok"}]')
    monkeypatch.setattr(citation_check, "create_llm", lambda config: llm)
    check_citations(ANSWER, CITATIONS, "openai", "gpt-test")
    assert "Document openings" not in llm.prompts[0]
