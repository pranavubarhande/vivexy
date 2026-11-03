import json

import pytest
from flask import Flask

import agents_core.business_logic.document_search as search_logic
from agents_core.business_logic.streaming import _handle_tool_outcome
from agents_core.cli.eval_document_search import evaluate
from agents_core.models import (
    Chat,
    Document,
    DocumentChunk,
    Team,
    TeamMember,
    TeamRole,
    User,
    db,
)
from agents_core.routes.chat import bp as chat_bp
from agents_core.routes.documents import bp as documents_bp
from agents_core.tools.documents.search_tools import _search_documents_func
from agents_core.utils.auth import generate_token


@pytest.fixture
def vector_calls(monkeypatch):
    calls = {"ranked": [], "requests": []}

    def fake_query(namespace, vector, top_k, metadata_filter=None):
        calls["requests"].append((namespace, top_k, metadata_filter))
        return [
            {"id": chunk_id, "score": 0.9, "metadata": {}}
            for chunk_id in calls["ranked"]
        ]

    monkeypatch.setattr(search_logic, "query_vectors", fake_query)
    monkeypatch.setattr(search_logic, "embed_query", lambda text: [0.1, 0.2])
    return calls


@pytest.fixture
def app(vector_calls):
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["JWT_SECRET_KEY"] = "test-secret-key-long-enough-for-hs256"
    app.register_blueprint(documents_bp)
    app.register_blueprint(chat_bp)
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app


@pytest.fixture
def client(app):
    return app.test_client()


def _document(team, owner, filename, chunks, status="ready", scope=None):
    document = Document(
        team_id=team.id if team else None,
        owner_id=owner.id,
        scope_type=scope[0] if scope else None,
        scope_id=scope[1] if scope else None,
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
    rows = []
    for index, (page_number, text) in enumerate(chunks):
        row = DocumentChunk(
            document_id=document.id,
            chunk_index=index,
            page_number=page_number,
            char_start=0,
            char_end=len(text),
            text=text,
        )
        db.session.add(row)
        rows.append(row)
    db.session.flush()
    return document, rows


@pytest.fixture
def library(app):
    member = User(email="member@firm.com", email_verified=True)
    outsider = User(email="outsider@other.com", email_verified=True)
    db.session.add_all([member, outsider])
    db.session.flush()
    team = Team(name="Firm", slug="firm", owner_id=member.id)
    db.session.add(team)
    db.session.flush()
    db.session.add(TeamMember(user_id=member.id, team_id=team.id, role=TeamRole.OWNER))
    msa, msa_chunks = _document(
        team,
        member,
        "msa.pdf",
        [
            (1, "This Agreement is governed by the laws of the State of New York."),
            (
                4,
                "The Supplier shall indemnify the Customer against third-party claims.",
            ),
        ],
    )
    nda, nda_chunks = _document(
        team, member, "nda.pdf", [(2, "Confidential Information excludes public data.")]
    )
    pending, pending_chunks = _document(
        team,
        member,
        "draft.pdf",
        [(1, "Governed by Delaware law.")],
        status="processing",
    )
    matter, matter_chunks = _document(
        team,
        member,
        "settlement.pdf",
        [(3, "The parties settle all claims for $250,000, governed by Texas law.")],
        scope=("matter", "m-1"),
    )
    db.session.commit()
    return {
        "member": member,
        "outsider": outsider,
        "team": team,
        "msa": msa,
        "msa_chunks": msa_chunks,
        "nda_chunks": nda_chunks,
        "pending_chunks": pending_chunks,
        "matter_chunks": matter_chunks,
    }


def _headers(user):
    return {"Authorization": f"Bearer {generate_token(user.id, user.email)}"}


def test_search_fuses_keyword_and_vector_results(client, library, vector_calls):
    vector_calls["ranked"] = [library["msa_chunks"][1].id, library["msa_chunks"][0].id]

    response = client.post(
        "/api/documents/search",
        json={"query": "governed law", "teamId": library["team"].id},
        headers=_headers(library["member"]),
    )

    assert response.status_code == 200
    results = response.get_json()["results"]
    assert results[0]["chunkId"] == library["msa_chunks"][0].id
    assert results[0]["pageNumber"] == 1
    assert results[0]["filename"] == "msa.pdf"
    assert results[0]["id"] == library["msa_chunks"][0].id.replace("-", "")[:8]
    assert {result["chunkId"] for result in results} == {
        library["msa_chunks"][0].id,
        library["msa_chunks"][1].id,
    }
    namespace, _, metadata_filter = vector_calls["requests"][0]
    assert namespace == f"documents-team-{library['team'].id}"
    assert metadata_filter == {"scope_type": {"$exists": False}}


def test_search_never_returns_unready_or_out_of_scope_chunks(
    client, library, vector_calls
):
    vector_calls["ranked"] = [
        library["pending_chunks"][0].id,
        library["matter_chunks"][0].id,
        "deleted-chunk-id",
    ]

    results = client.post(
        "/api/documents/search",
        json={"query": "governed", "teamId": library["team"].id},
        headers=_headers(library["member"]),
    ).get_json()["results"]

    chunk_ids = {result["chunkId"] for result in results}
    assert library["pending_chunks"][0].id not in chunk_ids
    assert library["matter_chunks"][0].id not in chunk_ids
    assert chunk_ids == {library["msa_chunks"][0].id}


def test_search_filters_by_document_ids(client, library, vector_calls):
    vector_calls["ranked"] = [library["msa_chunks"][0].id]
    results = client.post(
        "/api/documents/search",
        json={
            "query": "confidential information governed",
            "teamId": library["team"].id,
            "documentIds": [library["msa"].id],
        },
        headers=_headers(library["member"]),
    ).get_json()["results"]

    assert {result["documentId"] for result in results} == {library["msa"].id}
    assert vector_calls["requests"][0][2]["document_id"] == {"$in": [library["msa"].id]}


def test_search_keeps_working_when_vector_search_fails(client, library, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("pinecone down")

    monkeypatch.setattr(search_logic, "query_vectors", broken)
    results = client.post(
        "/api/documents/search",
        json={"query": "indemnify", "teamId": library["team"].id},
        headers=_headers(library["member"]),
    ).get_json()["results"]

    assert [result["chunkId"] for result in results] == [library["msa_chunks"][1].id]


def test_search_rejects_outsiders_and_bad_input(client, library):
    team_id = library["team"].id
    assert (
        client.post(
            "/api/documents/search",
            json={"query": "law", "teamId": team_id},
            headers=_headers(library["outsider"]),
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/documents/search",
            json={"query": "", "teamId": team_id},
            headers=_headers(library["member"]),
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/documents/search",
            json={
                "query": "law",
                "teamId": team_id,
                "scopeType": "matter",
                "scopeId": "m-1",
            },
            headers=_headers(library["member"]),
        ).status_code
        == 403
    )


def test_search_tool_uses_the_chats_team_and_scope(
    app, library, vector_calls, monkeypatch
):
    monkeypatch.setattr(
        "agents_core.business_logic.documents.get_document_scope_authorizer",
        lambda scope_type: (
            (lambda user, team_id, scope_id: True) if scope_type == "matter" else None
        ),
    )
    chat = Chat(
        user_id=library["member"].id,
        team_id=library["team"].id,
        document_scope_type="matter",
        document_scope_id="m-1",
    )
    db.session.add(chat)
    db.session.commit()
    vector_calls["ranked"] = [library["matter_chunks"][0].id]

    output = json.loads(_search_documents_func(chat.id, "settlement amount"))

    assert output["success"] is True
    assert "marker exactly as shown" in output["instructions"]
    citation = output["citations"][0]
    assert citation["chunkId"] == library["matter_chunks"][0].id
    assert citation["marker"] == f"[^{citation['id']}]"
    assert citation["quote"].startswith("The parties settle")
    assert vector_calls["requests"][0][2] == {"scope_type": "matter", "scope_id": "m-1"}


def test_search_tool_reports_no_results_and_access_errors(app, library, vector_calls):
    chat = Chat(user_id=library["outsider"].id, team_id=library["team"].id)
    db.session.add(chat)
    db.session.commit()
    assert json.loads(_search_documents_func(chat.id, "law"))["success"] is False

    own_chat = Chat(user_id=library["member"].id, team_id=library["team"].id)
    db.session.add(own_chat)
    db.session.commit()
    output = json.loads(_search_documents_func(own_chat.id, "zebra"))
    assert output == {
        "success": True,
        "message": "No matching passages in the documents",
    }


def test_tool_outcome_collects_citations_and_streams_them():
    class ToolMessage:
        name = "search_documents"
        content = json.dumps(
            {
                "success": True,
                "message": "Found 1 passages",
                "citations": [{"id": "1a2b3c4d", "quote": "text", "pageNumber": 2}],
            }
        )

    collected = {}
    events = [
        json.loads(event[len("data: ") :])
        for event in _handle_tool_outcome(ToolMessage(), [], collected)
    ]

    assert collected == {
        "1a2b3c4d": {"id": "1a2b3c4d", "quote": "text", "pageNumber": 2}
    }
    assert events[0] == {
        "type": "citations",
        "data": {"citations": [{"id": "1a2b3c4d", "quote": "text", "pageNumber": 2}]},
    }
    assert events[1]["type"] == "tool_call"


def test_chat_with_unauthorized_document_scope_is_refused(client, library):
    response = client.post(
        "/chat",
        json={
            "team_id": library["team"].id,
            "document_scope_type": "matter",
            "document_scope_id": "m-1",
        },
        headers=_headers(library["member"]),
    )
    assert response.status_code == 403
    assert Chat.query.count() == 0


def test_chat_keeps_an_authorized_document_scope(client, library, monkeypatch):
    monkeypatch.setattr(
        "agents_core.business_logic.documents.get_document_scope_authorizer",
        lambda scope_type: (
            (lambda user, team_id, scope_id: True) if scope_type == "matter" else None
        ),
    )
    response = client.post(
        "/chat",
        json={
            "team_id": library["team"].id,
            "document_scope_type": "matter",
            "document_scope_id": "m-1",
        },
        headers=_headers(library["member"]),
    )
    assert response.status_code == 201
    chat = Chat.query.one()
    assert (chat.document_scope_type, chat.document_scope_id) == ("matter", "m-1")


def test_eval_reports_hit_rate_and_reciprocal_rank(app, library, vector_calls):
    vector_calls["ranked"] = []
    summary = evaluate(
        [
            {"query": "indemnify", "filename": "msa.pdf", "page": 4},
            {"query": "confidential information", "filename": "nda.pdf"},
            {"query": "indemnify", "filename": "msa.pdf", "page": 1},
        ],
        library["member"],
        k=3,
        team_id=library["team"].id,
    )
    assert summary == {"cases": 3, "hitRate": 2 / 3, "meanReciprocalRank": 2 / 3}
