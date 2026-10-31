import io
import os
import tempfile
import zipfile

import pytest
from flask import Flask

import agents_core.business_logic.documents as documents_logic
from agents_core.models import (
    AuditLog,
    Document,
    DocumentChunk,
    DocumentPage,
    Team,
    TeamMember,
    TeamRole,
    User,
    db,
)
from agents_core.routes.documents import bp as documents_bp
from agents_core.services.document_parser import ParsedDocument, ParsedPage
from agents_core.utils.auth import generate_token


class FakeS3:
    objects = {}

    def upload_object(self, file, s3_key, content_type=None):
        FakeS3.objects[s3_key] = file.read()
        return True

    def download_file(self, s3_key):
        fd, path = tempfile.mkstemp(suffix="." + s3_key.rsplit(".", 1)[-1])
        with os.fdopen(fd, "wb") as handle:
            handle.write(FakeS3.objects[s3_key])
        return path

    def delete_file(self, s3_key):
        FakeS3.objects.pop(s3_key, None)
        return True

    def get_presigned_url(self, s3_key, expiration=3600):
        return f"https://files.example/{s3_key}?expires={expiration}"


@pytest.fixture
def vector_store(monkeypatch):
    store = {"upserts": [], "deletes": []}
    monkeypatch.setattr(
        documents_logic,
        "upsert_vectors",
        lambda namespace, vectors: store["upserts"].append((namespace, vectors)),
    )
    monkeypatch.setattr(
        documents_logic,
        "delete_vectors",
        lambda namespace, ids: store["deletes"].append((namespace, ids)),
    )
    return store


@pytest.fixture
def app(monkeypatch, vector_store):
    FakeS3.objects = {}
    monkeypatch.setattr(documents_logic, "S3Service", FakeS3)
    monkeypatch.setattr(
        documents_logic,
        "embed_passages",
        lambda texts: [[float(len(text)), 0.0, 1.0] for text in texts],
    )
    monkeypatch.setattr(
        documents_logic,
        "enqueue_document",
        lambda document_id: documents_logic.process_document(document_id),
    )
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["JWT_SECRET_KEY"] = "test-secret"
    app.register_blueprint(documents_bp)
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def org(app):
    member = User(email="member@firm.com", email_verified=True)
    colleague = User(email="colleague@firm.com", email_verified=True)
    outsider = User(email="outsider@other.com", email_verified=True)
    db.session.add_all([member, colleague, outsider])
    db.session.flush()
    team = Team(name="Firm", slug="firm", owner_id=member.id)
    db.session.add(team)
    db.session.flush()
    db.session.add_all(
        [
            TeamMember(user_id=member.id, team_id=team.id, role=TeamRole.OWNER),
            TeamMember(user_id=colleague.id, team_id=team.id, role=TeamRole.MEMBER),
        ]
    )
    db.session.commit()
    return {
        "member": member,
        "colleague": colleague,
        "outsider": outsider,
        "team": team,
    }


def _headers(user):
    return {"Authorization": f"Bearer {generate_token(user.id, user.email)}"}


def _file(name, content):
    return (
        io.BytesIO(content if isinstance(content, bytes) else content.encode()),
        name,
    )


def _upload(client, user, files, **form):
    return client.post(
        "/api/documents",
        data={"files": files, **form},
        headers=_headers(user),
        content_type="multipart/form-data",
    )


LONG_TEXT = "\n\n".join(
    f"Clause {index}. The supplier shall indemnify the customer against all losses. "
    * 6
    for index in range(10)
)


def test_upload_processes_document_into_pages_chunks_and_vectors(
    client, org, vector_store
):
    team = org["team"]
    response = _upload(
        client, org["member"], [_file("msa.txt", LONG_TEXT)], teamId=team.id
    )

    assert response.status_code == 202
    document_id = response.get_json()["documents"][0]["id"]
    document = db.session.get(Document, document_id)
    assert document.status == "ready"
    assert document.page_count == 1
    assert (
        document.chunk_count
        == DocumentChunk.query.filter_by(document_id=document_id).count()
    )
    assert document.chunk_count > 1
    assert document.vector_namespace == f"documents-team-{team.id}"
    assert document.s3_key.startswith(f"documents/teams/{team.id}/{document_id}/")

    namespace, vectors = vector_store["upserts"][0]
    assert namespace == f"documents-team-{team.id}"
    chunk_ids = {chunk.id for chunk in document.chunks}
    assert {vector["id"] for vector in vectors} == chunk_ids
    assert vectors[0]["metadata"] == {
        "document_id": document_id,
        "page_number": 1,
        "chunk_index": 0,
    }

    audit = AuditLog.query.filter_by(action="document.uploaded").one()
    assert audit.target_id == document_id
    assert audit.team_id == team.id


def test_team_colleague_can_list_and_read_pages(client, org):
    team = org["team"]
    _upload(client, org["member"], [_file("msa.txt", LONG_TEXT)], teamId=team.id)

    listing = client.get(
        f"/api/documents?teamId={team.id}", headers=_headers(org["colleague"])
    )
    assert listing.status_code == 200
    body = listing.get_json()
    assert body["total"] == 1
    document_id = body["documents"][0]["id"]

    page = client.get(
        f"/api/documents/{document_id}/pages/1", headers=_headers(org["colleague"])
    )
    assert page.status_code == 200
    assert page.get_json()["text"].startswith("Clause 0.")
    assert (
        client.get(
            f"/api/documents/{document_id}/pages/2", headers=_headers(org["colleague"])
        ).status_code
        == 404
    )


def test_outsider_cannot_upload_list_or_read_team_documents(client, org):
    team = org["team"]
    response = _upload(
        client, org["member"], [_file("msa.txt", LONG_TEXT)], teamId=team.id
    )
    document_id = response.get_json()["documents"][0]["id"]
    outsider = org["outsider"]

    assert (
        _upload(client, outsider, [_file("x.txt", "x")], teamId=team.id).status_code
        == 403
    )
    assert (
        client.get(
            f"/api/documents?teamId={team.id}", headers=_headers(outsider)
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"/api/documents/{document_id}", headers=_headers(outsider)
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/documents/{document_id}", headers=_headers(outsider)
        ).status_code
        == 404
    )


def test_personal_documents_are_private(client, org):
    response = _upload(client, org["member"], [_file("notes.txt", "Private notes")])
    document_id = response.get_json()["documents"][0]["id"]

    assert db.session.get(Document, document_id).vector_namespace == (
        f"documents-user-{org['member'].id}"
    )
    assert (
        client.get(
            f"/api/documents/{document_id}", headers=_headers(org["colleague"])
        ).status_code
        == 404
    )
    mine = client.get("/api/documents", headers=_headers(org["member"])).get_json()
    theirs = client.get("/api/documents", headers=_headers(org["colleague"])).get_json()
    assert mine["total"] == 1
    assert theirs["total"] == 0


def test_unregistered_scope_type_is_refused(client, org):
    response = _upload(
        client,
        org["member"],
        [_file("msa.txt", "text")],
        teamId=org["team"].id,
        scopeType="matter",
        scopeId="m-1",
    )
    assert response.status_code == 403


def test_scope_authorizer_controls_access(client, org, monkeypatch, vector_store):
    allowed = {org["member"].id}
    monkeypatch.setattr(
        documents_logic,
        "get_document_scope_authorizer",
        lambda scope_type: (
            (lambda user, team_id, scope_id: user.id in allowed)
            if scope_type == "matter"
            else None
        ),
    )
    team = org["team"]
    response = _upload(
        client,
        org["member"],
        [_file("msa.txt", LONG_TEXT)],
        teamId=team.id,
        scopeType="matter",
        scopeId="m-1",
    )
    assert response.status_code == 202
    document_id = response.get_json()["documents"][0]["id"]
    assert vector_store["upserts"][0][1][0]["metadata"]["scope_id"] == "m-1"

    scoped = f"/api/documents?teamId={team.id}&scopeType=matter&scopeId=m-1"
    assert client.get(scoped, headers=_headers(org["member"])).get_json()["total"] == 1
    assert client.get(scoped, headers=_headers(org["colleague"])).status_code == 403
    assert (
        client.get(
            f"/api/documents/{document_id}", headers=_headers(org["colleague"])
        ).status_code
        == 404
    )
    unscoped = client.get(
        f"/api/documents?teamId={team.id}", headers=_headers(org["member"])
    )
    assert unscoped.get_json()["total"] == 0


def test_scope_type_and_id_must_be_given_together(client, org):
    response = _upload(client, org["member"], [_file("a.txt", "a")], scopeType="matter")
    assert response.status_code == 400


def test_zip_uploads_are_unpacked_and_unsupported_entries_skipped(client, org):
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr("folder/one.txt", "First file")
        zip_file.writestr("two.md", "# Second file")
        zip_file.writestr("tool.exe", "binary")
        zip_file.writestr("__MACOSX/._one.txt", "junk")
    response = _upload(
        client,
        org["member"],
        [(io.BytesIO(archive.getvalue()), "bundle.zip")],
        teamId=org["team"].id,
    )

    assert response.status_code == 202
    names = sorted(
        document["filename"] for document in response.get_json()["documents"]
    )
    assert names == ["one.txt", "two.md"]


def test_rejects_unsupported_empty_and_oversized_files(client, org, monkeypatch):
    member = org["member"]
    assert _upload(client, member, [_file("run.exe", "x")]).status_code == 400
    assert _upload(client, member, [_file("empty.txt", b"")]).status_code == 400
    monkeypatch.setattr(documents_logic, "DOCUMENT_MAX_FILE_BYTES", 10)
    response = _upload(client, member, [_file("big.txt", "x" * 11)])
    assert response.status_code == 400
    assert "limit" in response.get_json()["error"]
    assert Document.query.count() == 0
    assert FakeS3.objects == {}


def test_too_many_files_are_rejected_before_storing_anything(client, org, monkeypatch):
    monkeypatch.setattr(documents_logic, "DOCUMENT_MAX_FILES_PER_UPLOAD", 2)
    files = [_file(f"{index}.txt", "x") for index in range(3)]
    assert _upload(client, org["member"], files).status_code == 400
    assert FakeS3.objects == {}


def test_failed_parse_is_recorded_and_can_be_reprocessed(client, org, monkeypatch):
    response = _upload(
        client, org["member"], [_file("broken.pdf", b"not really a pdf")]
    )
    document_id = response.get_json()["documents"][0]["id"]
    document = db.session.get(Document, document_id)
    assert document.status == "failed"
    assert "Could not open PDF" in document.error

    monkeypatch.setattr(
        documents_logic,
        "parse_document",
        lambda path, extension, on_ocr_start=None: _fake_parsed(),
    )
    reprocess = client.post(
        f"/api/documents/{document_id}/reprocess", headers=_headers(org["member"])
    )
    assert reprocess.status_code == 202
    db.session.refresh(document)
    assert document.status == "ready"
    assert document.error is None
    assert AuditLog.query.filter_by(action="document.reprocessed").count() == 1


def _fake_parsed():
    return ParsedDocument(
        pages=[ParsedPage(1, "Recovered text"), ParsedPage(2, "More")], paginated=True
    )


def test_unexpected_errors_do_not_leak_details(client, org, monkeypatch):
    def explode(texts):
        raise RuntimeError("pinecone://secret-host refused connection")

    monkeypatch.setattr(documents_logic, "embed_passages", explode)
    response = _upload(client, org["member"], [_file("a.txt", "Some text")])
    document = db.session.get(Document, response.get_json()["documents"][0]["id"])
    assert document.status == "failed"
    assert document.error == "Processing failed. Try again."


def test_reprocess_replaces_old_pages_chunks_and_vectors(client, org, vector_store):
    response = _upload(
        client, org["member"], [_file("msa.txt", LONG_TEXT)], teamId=org["team"].id
    )
    document_id = response.get_json()["documents"][0]["id"]
    old_chunk_ids = {chunk.id for chunk in db.session.get(Document, document_id).chunks}

    client.post(
        f"/api/documents/{document_id}/reprocess", headers=_headers(org["member"])
    )

    document = db.session.get(Document, document_id)
    assert (
        vector_store["deletes"][0][1]
        and set(vector_store["deletes"][0][1]) == old_chunk_ids
    )
    assert {chunk.id for chunk in document.chunks}.isdisjoint(old_chunk_ids)
    assert DocumentPage.query.filter_by(document_id=document_id).count() == 1


def test_delete_removes_file_vectors_and_rows(client, org, vector_store):
    response = _upload(
        client, org["member"], [_file("msa.txt", LONG_TEXT)], teamId=org["team"].id
    )
    document_id = response.get_json()["documents"][0]["id"]
    document = db.session.get(Document, document_id)
    s3_key = document.s3_key
    chunk_ids = {chunk.id for chunk in document.chunks}

    deleted = client.delete(
        f"/api/documents/{document_id}", headers=_headers(org["colleague"])
    )

    assert deleted.status_code == 204
    assert db.session.get(Document, document_id) is None
    assert DocumentChunk.query.count() == 0
    assert DocumentPage.query.count() == 0
    assert s3_key not in FakeS3.objects
    assert set(vector_store["deletes"][-1][1]) == chunk_ids
    assert (
        AuditLog.query.filter_by(action="document.deleted").one().actor_id
        == org["colleague"].id
    )


def test_file_link_is_short_lived(client, org):
    response = _upload(client, org["member"], [_file("a.txt", "Some text")])
    document_id = response.get_json()["documents"][0]["id"]
    link = client.get(
        f"/api/documents/{document_id}/file", headers=_headers(org["member"])
    )
    assert link.status_code == 200
    assert link.get_json()["url"].endswith("expires=900")
