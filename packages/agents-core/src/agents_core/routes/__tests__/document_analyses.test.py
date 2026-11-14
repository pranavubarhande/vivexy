import io
import json
import re

import pytest
from docx import Document as WordDocument
from flask import Flask
from openpyxl import load_workbook

import agents_core.business_logic.document_analyses as analyses
from agents_core.business_logic.document_search import chunk_citation
from agents_core.models import (
    AuditLog,
    Document,
    DocumentAnalysis,
    DocumentChunk,
    LLMModel,
    Team,
    TeamMember,
    TeamRole,
    TokenUsage,
    User,
    db,
)
from agents_core.routes.document_analyses import bp as analyses_bp
from agents_core.utils.auth import generate_token

PASSAGE_LINE = re.compile(r"\[(P\d+)\] \([^)]*page \d+\) (.*)")


class FakeResponse:
    def __init__(self, content):
        self.content = content
        self.usage_metadata = {"input_tokens": 100, "output_tokens": 20}


class FakeLLM:
    """Answers from the passages in the prompt, the way a careful model would:
    governing law and indemnity questions are answered from the passage that
    mentions them, anything else is not found."""

    def __init__(self):
        self.prompts = []
        self.fail_on = None

    def invoke(self, messages):
        prompt = messages[0].content
        self.prompts.append(prompt)
        if self.fail_on and self.fail_on in prompt:
            raise RuntimeError("provider exploded with secret details")
        passages = PASSAGE_LINE.findall(prompt)
        if prompt.startswith("You answer one question"):
            question = prompt.split("Question: ")[1].split("\n")[0].lower()
            keyword = "governed" if "law" in question else "indemnif"
            hits = [pid for pid, text in passages if keyword in text.lower()]
            if not hits:
                return FakeResponse('{"found": false, "answer": "", "citations": []}')
            text = dict(passages)[hits[0]]
            return FakeResponse(
                "```json\n"
                + json.dumps(
                    {"found": True, "answer": text, "citations": [hits[0], "P99"]}
                )
                + "\n```"
            )
        if prompt.startswith("Summarize"):
            first = passages[0][0]
            return FakeResponse(
                f"The agreement is governed by New York law [{first}, P2, P9]. "
                "It has an invented clause [^0badf00d]."
            )
        if prompt.startswith("List every dated event"):
            events = [
                {
                    "date": "1 March 2024",
                    "sortDate": "2024-03-01",
                    "event": "Notice of breach sent",
                    "people": ["Customer"],
                    "citations": [passages[-1][0]],
                },
                {
                    "date": "sometime",
                    "sortDate": "soon",
                    "event": "Undated step",
                    "people": [],
                    "citations": [],
                },
                {
                    "date": "5 January 2023",
                    "sortDate": "2023-01-05",
                    "event": "Agreement signed",
                    "people": ["Supplier", "Customer"],
                    "citations": [passages[0][0]],
                },
            ]
            return FakeResponse(json.dumps(events))
        raise AssertionError(f"Unexpected prompt: {prompt[:60]}")


@pytest.fixture
def llm(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(analyses, "_build_llm", lambda analysis: fake)
    monkeypatch.setattr(analyses, "WORKERS", 1)
    return fake


@pytest.fixture
def queued(monkeypatch):
    ids = []
    monkeypatch.setattr(analyses, "enqueue_analysis", ids.append)
    return ids


@pytest.fixture
def searched(monkeypatch):
    """Search returns every chunk of the requested document, in order."""
    calls = []

    def fake_search(
        user,
        query,
        team_id=None,
        scope_type=None,
        scope_id=None,
        document_ids=None,
        limit=8,
    ):
        calls.append({"query": query, "document_ids": document_ids, "limit": limit})
        document = db.session.get(Document, document_ids[0])
        chunks = DocumentChunk.query.filter_by(document_id=document.id).all()
        return [chunk_citation(chunk, document) for chunk in chunks][:limit]

    monkeypatch.setattr(analyses, "search_documents", fake_search)
    return calls


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["JWT_SECRET_KEY"] = "test-secret-key-long-enough-for-hs256"
    app.register_blueprint(analyses_bp)
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app


@pytest.fixture
def client(app):
    return app.test_client()


def _document(team, owner, filename, chunks, status="ready"):
    document = Document(
        team_id=team.id,
        owner_id=owner.id,
        filename=filename,
        mime_type="application/pdf",
        size=1,
        sha256="0" * 64,
        s3_key=f"documents/{filename}",
        status=status,
        paginated=True,
    )
    db.session.add(document)
    db.session.flush()
    for index, (page_number, text) in enumerate(chunks):
        db.session.add(
            DocumentChunk(
                document_id=document.id,
                chunk_index=index,
                page_number=page_number,
                char_start=0,
                char_end=len(text),
                text=text,
            )
        )
    db.session.flush()
    return document


@pytest.fixture
def firm(app):
    member = User(email="member@firm.com", email_verified=True)
    outsider = User(email="outsider@other.com", email_verified=True)
    db.session.add_all([member, outsider])
    db.session.flush()
    team = Team(name="Firm", slug="firm", owner_id=member.id)
    db.session.add(team)
    db.session.flush()
    db.session.add(TeamMember(user_id=member.id, team_id=team.id, role=TeamRole.OWNER))
    model = LLMModel(
        name="Gemini Flash",
        provider="google",
        model_id="gemini-2.5-flash",
        input_cost=0.3,
        output_cost=2.5,
    )
    db.session.add(model)
    msa = _document(
        team,
        member,
        "msa.pdf",
        [
            (1, "Signed on 5 January 2023. Governed by the laws of New York."),
            (4, "Customer sent notice of breach on 1 March 2024."),
        ],
    )
    nda = _document(
        team, member, "nda.pdf", [(2, "Confidential Information excludes public data.")]
    )
    draft = _document(team, member, "draft.pdf", [(1, "Draft")], status="processing")
    db.session.commit()
    return {
        "member": member,
        "outsider": outsider,
        "team": team,
        "model": model,
        "msa": msa,
        "nda": nda,
        "draft": draft,
    }


def _headers(user):
    return {"Authorization": f"Bearer {generate_token(user.id, user.email)}"}


def _create(client, firm, **overrides):
    body = {
        "kind": "review",
        "teamId": firm["team"].id,
        "documentIds": [firm["msa"].id, firm["nda"].id],
        "questions": [
            {"label": "Governing law", "prompt": "Which law governs?"},
            {"label": "Indemnity", "prompt": "Who indemnifies whom?"},
        ],
        "modelId": firm["model"].id,
        **overrides,
    }
    return client.post("/api/analyses", json=body, headers=_headers(firm["member"]))


def test_review_grid_answers_every_cell_with_its_sources(
    client, firm, llm, queued, searched
):
    response = _create(client, firm)

    assert response.status_code == 201
    created = response.get_json()
    assert created["status"] == "queued"
    assert created["title"] == "Review of 2 documents"
    assert created["progress"] == {"total": 4, "done": 0, "failed": 0}
    assert queued == [created["id"]]

    analyses.run_analysis(created["id"])
    result = client.get(
        f"/api/analyses/{created['id']}", headers=_headers(firm["member"])
    ).get_json()

    assert result["status"] == "done"
    assert result["progress"] == {"total": 4, "done": 4, "failed": 0}
    law, indemnity = result["questions"]
    cells = {(r["documentId"], r["questionId"]): r for r in result["results"]}
    msa_law = cells[(firm["msa"].id, law["id"])]
    assert msa_law["found"] is True
    assert "New York" in msa_law["answer"]
    assert [c["pageNumber"] for c in msa_law["citations"]] == [1]
    assert msa_law["citations"][0]["filename"] == "msa.pdf"
    nda_law = cells[(firm["nda"].id, law["id"])]
    assert nda_law["found"] is False
    assert nda_law["answer"] == analyses.NOT_FOUND_ANSWER
    assert nda_law["citations"] == []
    assert searched[0]["document_ids"] == [firm["msa"].id]
    assert result["inputTokens"] == 400
    usage = TokenUsage.query.one()
    assert usage.team_id == firm["team"].id
    assert usage.total_tokens == 480
    assert usage.total_cost_usd == pytest.approx((400 * 0.3 + 80 * 2.5) / 1_000_000)
    assert AuditLog.query.filter_by(action="analysis.created").count() == 1


def test_review_rejects_unready_documents_and_outsiders(client, firm, llm, queued):
    unready = _create(client, firm, documentIds=[firm["msa"].id, firm["draft"].id])
    assert unready.status_code == 400
    assert "draft.pdf" in unready.get_json()["error"]

    no_questions = _create(client, firm, questions=[])
    assert no_questions.status_code == 400

    too_many = _create(
        client,
        firm,
        questions=[{"label": f"Q{i}", "prompt": "p"} for i in range(16)],
    )
    assert too_many.status_code == 400

    outsider = client.post(
        "/api/analyses",
        json={
            "kind": "review",
            "teamId": firm["team"].id,
            "documentIds": [firm["msa"].id],
            "questions": [{"label": "Law", "prompt": "Which law?"}],
            "modelId": firm["model"].id,
        },
        headers=_headers(firm["outsider"]),
    )
    assert outsider.status_code == 403

    created = _create(client, firm).get_json()
    hidden = client.get(
        f"/api/analyses/{created['id']}", headers=_headers(firm["outsider"])
    )
    assert hidden.status_code == 404
    assert queued == [created["id"]]


def test_failed_cells_hide_provider_errors_and_can_be_retried(
    client, firm, llm, queued, searched
):
    created = _create(client, firm).get_json()
    llm.fail_on = "nda.pdf"
    analyses.run_analysis(created["id"])

    result = client.get(
        f"/api/analyses/{created['id']}", headers=_headers(firm["member"])
    ).get_json()
    assert result["status"] == "done"
    assert result["progress"]["failed"] == 2
    assert result["error"] == "2 of 4 could not be completed"
    failed = [r for r in result["results"] if r["status"] == "failed"]
    assert {r["error"] for r in failed} == {"The model could not finish this cell"}

    llm.fail_on = None
    retried = client.post(
        f"/api/analyses/{created['id']}/retry", headers=_headers(firm["member"])
    ).get_json()
    assert retried["status"] == "queued"
    analyses.run_analysis(created["id"])
    after = client.get(
        f"/api/analyses/{created['id']}", headers=_headers(firm["member"])
    ).get_json()
    assert after["progress"] == {"total": 4, "done": 4, "failed": 0}
    assert after["error"] is None


def test_columns_can_be_added_rerun_and_removed(client, firm, llm, queued, searched):
    created = _create(client, firm).get_json()
    analyses.run_analysis(created["id"])
    headers = _headers(firm["member"])

    added = client.post(
        f"/api/analyses/{created['id']}/questions",
        json={"label": "Term", "prompt": "How long does it last?"},
        headers=headers,
    )
    assert added.status_code == 201
    body = added.get_json()
    assert len(body["questions"]) == 3
    assert body["progress"] == {"total": 6, "done": 4, "failed": 0}
    analyses.run_analysis(created["id"])

    law_id = body["questions"][0]["id"]
    rerun = client.post(
        f"/api/analyses/{created['id']}/questions/{law_id}/rerun",
        json={"label": "Law", "prompt": "Which state's law governs?"},
        headers=headers,
    ).get_json()
    assert rerun["questions"][0]["label"] == "Law"
    assert rerun["progress"]["done"] == 4
    analyses.run_analysis(created["id"])
    assert searched[-1]["query"] == "Which state's law governs?"

    removed = client.delete(
        f"/api/analyses/{created['id']}/questions/{law_id}", headers=headers
    ).get_json()
    assert [q["label"] for q in removed["questions"]] == ["Indemnity", "Term"]
    assert removed["progress"]["total"] == 4


def test_summary_keeps_only_markers_for_real_passages(client, firm, llm, queued):
    created = _create(
        client,
        firm,
        kind="summary",
        documentIds=[firm["msa"].id],
        questions=[],
        length="detailed",
    ).get_json()
    assert created["options"] == {"length": "detailed"}
    analyses.run_analysis(created["id"])

    result = client.get(
        f"/api/analyses/{created['id']}", headers=_headers(firm["member"])
    ).get_json()
    cell = result["results"][0]
    first, second = cell["citations"]
    assert cell["answer"] == (
        "The agreement is governed by New York law "
        f"[^{first['id']}][^{second['id']}]. It has an invented clause."
    )
    assert [first["pageNumber"], second["pageNumber"]] == [1, 4]
    assert "8 to 15 sentences" in llm.prompts[0]

    exported = client.get(
        f"/api/analyses/{created['id']}/export", headers=_headers(firm["member"])
    )
    assert exported.status_code == 200
    assert "Summary of 1 document.docx" in exported.headers["Content-Disposition"]
    text = "\n".join(p.text for p in WordDocument(io.BytesIO(exported.data)).paragraphs)
    assert "New York law [1][2]" in text
    assert "[1] msa.pdf p. 1" in text


def test_timeline_merges_sorted_events_with_sources(client, firm, llm, queued):
    created = _create(
        client,
        firm,
        kind="timeline",
        documentIds=[firm["msa"].id],
        questions=[],
    ).get_json()
    assert created["questions"] == []
    analyses.run_analysis(created["id"])

    result = client.get(
        f"/api/analyses/{created['id']}", headers=_headers(firm["member"])
    ).get_json()
    events = result["events"]
    assert [e["event"] for e in events] == [
        "Agreement signed",
        "Notice of breach sent",
        "Undated step",
    ]
    assert events[0]["citations"][0]["pageNumber"] == 1
    assert events[1]["citations"][0]["pageNumber"] == 4
    assert events[2]["sortDate"] is None
    assert events[0]["filename"] == "msa.pdf"

    exported = client.get(
        f"/api/analyses/{created['id']}/export", headers=_headers(firm["member"])
    )
    sheet = load_workbook(io.BytesIO(exported.data))["Timeline"]
    rows = list(sheet.iter_rows(values_only=True))
    assert rows[0][:3] == ("Date", "Event", "People")
    assert rows[1][:4] == (
        "5 January 2023",
        "Agreement signed",
        "Supplier, Customer",
        "msa.pdf",
    )


def test_review_export_has_grid_and_sources(client, firm, llm, queued, searched):
    created = _create(client, firm).get_json()
    analyses.run_analysis(created["id"])

    exported = client.get(
        f"/api/analyses/{created['id']}/export", headers=_headers(firm["member"])
    )
    assert exported.status_code == 200
    workbook = load_workbook(io.BytesIO(exported.data))
    grid = list(workbook["Review"].iter_rows(values_only=True))
    assert grid[0] == ("Document", "Governing law", "Indemnity")
    assert grid[1][0] == "msa.pdf"
    assert grid[1][1].endswith("(p. 1)")
    assert grid[2][1] == analyses.NOT_FOUND_ANSWER
    sources = list(workbook["Sources"].iter_rows(values_only=True))
    assert sources[1][:2] == ("msa.pdf", "Governing law")
    assert AuditLog.query.filter_by(action="analysis.exported").count() == 1


def test_list_cancel_and_delete(client, firm, llm, queued, searched):
    headers = _headers(firm["member"])
    created = _create(client, firm).get_json()

    listed = client.get(
        f"/api/analyses?teamId={firm['team'].id}&kind=review", headers=headers
    ).get_json()["analyses"]
    assert [a["id"] for a in listed] == [created["id"]]
    assert listed[0]["progress"]["total"] == 4
    assert (
        client.get(
            f"/api/analyses?teamId={firm['team'].id}&kind=summary", headers=headers
        ).get_json()["analyses"]
        == []
    )

    cancelled = client.post(
        f"/api/analyses/{created['id']}/cancel", headers=headers
    ).get_json()
    assert cancelled["status"] == "cancelled"
    analyses.run_analysis(created["id"])
    assert llm.prompts == []

    assert (
        client.delete(f"/api/analyses/{created['id']}", headers=headers).status_code
        == 204
    )
    assert DocumentAnalysis.query.count() == 0
    assert AuditLog.query.filter_by(action="analysis.deleted").count() == 1


def test_review_test_set_and_scoring(tmp_path):
    from agents_core.cli.eval_document_analyses import score
    from agents_core.cli.make_review_test_set import write_test_set

    assert write_test_set(str(tmp_path)) == {"contracts": 20, "cells": 160}
    cases = [
        json.loads(line)
        for line in (tmp_path / "expected.jsonl").read_text().splitlines()
    ]
    assert len(list((tmp_path / "contracts").iterdir())) == 20
    assert sum(not case["found"] for case in cases) > 0
    first = WordDocument(str(tmp_path / "contracts" / "services-agreement-01.docx"))
    text = "\n".join(p.text for p in first.paragraphs)
    assert "governed by the laws of New York" in text

    law = next(c for c in cases if c["question"] == "Governing law")
    missing = next(c for c in cases if not c["found"])
    cite = [{"id": "aaaaaaaa", "quote": "governed by the laws of New York"}]
    payload = {
        "questions": [
            {"id": "q1", "label": law["question"]},
            {"id": "q2", "label": missing["question"]},
        ],
        "documents": [
            {"id": "d1", "filename": law["filename"]},
            {"id": "d2", "filename": missing["filename"]},
        ],
        "results": [
            {
                "documentId": "d1",
                "questionId": "q1",
                "status": "done",
                "found": True,
                "answer": "The laws of New York.",
                "citations": cite,
            },
            {
                "documentId": "d2",
                "questionId": "q2",
                "status": "done",
                "found": True,
                "answer": "Something invented",
                "citations": cite,
            },
        ],
        "inputTokens": 0,
        "outputTokens": 0,
    }
    summary = score(payload, [law, missing])
    assert summary["correct"] == 1
    assert summary["accuracy"] == 0.5
    assert summary["foundCellsWithAnswerInSource"] == "1/1"
