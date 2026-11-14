import io
import re

import pytest
from docx import Document as WordDocument
from flask import Flask

import agents_core.business_logic.document_analyses as analyses
import agents_core.business_logic.workflows as workflows
import agents_core.library.registry as registry
from agents_core.business_logic.document_search import chunk_citation
from agents_core.constants.prompts import PROMPT_FIELD_CHOICE
from agents_core.constants.workflows import STEP_KIND_REVIEW, STEP_KIND_WRITE
from agents_core.library import (
    PromptField,
    PromptTemplate,
    WorkflowDefinition,
    WorkflowStep,
)
from agents_core.library.core import CORE_PROMPTS, CORE_WORKFLOWS
from agents_core.models import (
    AuditLog,
    Document,
    DocumentChunk,
    LLMModel,
    Prompt,
    Team,
    TeamMember,
    TeamRole,
    TokenUsage,
    User,
    db,
)
from agents_core.routes.prompts import bp as prompts_bp
from agents_core.routes.workflows import bp as workflows_bp
from agents_core.schemas.prompt import PLACEHOLDER
from agents_core.utils.auth import generate_token

PASSAGE_LINE = re.compile(r"\[(P\d+)\] \([^)]*page \d+\) (.*)")

TEST_WORKFLOW = WorkflowDefinition(
    key="test-flow",
    name="Test flow",
    description="Review, check, then write",
    category="Testing",
    inputs=(
        PromptField("client", "Client"),
        PromptField("tone", "Tone", type=PROMPT_FIELD_CHOICE, options=("firm", "soft")),
    ),
    steps=(
        WorkflowStep(
            key="facts",
            title="Facts",
            kind=STEP_KIND_REVIEW,
            questions=(("Law", "Which law governs for {{inputs.client}}?"),),
        ),
        WorkflowStep(
            key="issues",
            title="Issues",
            kind=STEP_KIND_WRITE,
            instructions="List issues for {{inputs.client}} from:\n{{steps.facts}}",
            search="governing law {{inputs.client}}",
            pause=True,
        ),
        WorkflowStep(
            key="letter",
            title="Letter",
            instructions="Write a {{inputs.tone}} letter on:\n{{steps.issues}}",
        ),
    ),
)


class FakeResponse:
    def __init__(self, content):
        self.content = content
        self.usage_metadata = {"input_tokens": 10, "output_tokens": 5}


class FakeLLM:
    def __init__(self):
        self.prompts = []
        self.fail_on = None

    def invoke(self, messages):
        prompt = messages[0].content
        self.prompts.append(prompt)
        if self.fail_on and self.fail_on in prompt:
            raise RuntimeError("secret provider failure")
        passages = PASSAGE_LINE.findall(prompt)
        if prompt.startswith("You answer one question"):
            return FakeResponse(
                '{"found": true, "answer": "New York", "citations": ["P1"]}'
            )
        if "Step: Issues" in prompt:
            return FakeResponse(f"1. New York law applies [{passages[0][0]}, P9].")
        if "Step: Letter" in prompt:
            return FakeResponse("Dear client, see the issues.")
        raise AssertionError(prompt[:80])


@pytest.fixture
def llm(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(analyses, "_build_llm", lambda analysis: fake)
    monkeypatch.setattr(workflows, "_build_llm", lambda run: fake)
    monkeypatch.setattr(analyses, "WORKERS", 1)
    return fake


@pytest.fixture
def queued(monkeypatch):
    ids = []
    monkeypatch.setattr(workflows, "enqueue_workflow", ids.append)
    monkeypatch.setattr(analyses, "enqueue_analysis", ids.append)
    return ids


@pytest.fixture
def library(monkeypatch):
    extra_prompt = PromptTemplate(
        key="nda-check",
        title="Check an NDA",
        category="Contracts",
        body="Check the NDA for {{party}}.",
        fields=(PromptField("party", "Party"),),
    )
    monkeypatch.setattr(registry, "get_extension_prompts", lambda: [extra_prompt])
    monkeypatch.setattr(registry, "get_extension_workflows", lambda: [TEST_WORKFLOW])


@pytest.fixture
def searched(monkeypatch):
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
        calls.append(query)
        chunks = DocumentChunk.query.filter(
            DocumentChunk.document_id.in_(document_ids)
        ).all()
        return [
            chunk_citation(chunk, db.session.get(Document, chunk.document_id))
            for chunk in chunks
        ][:limit]

    monkeypatch.setattr(analyses, "search_documents", fake_search)
    monkeypatch.setattr(workflows, "search_documents", fake_search)
    return calls


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["JWT_SECRET_KEY"] = "test-secret-key-long-enough-for-hs256"
    app.register_blueprint(prompts_bp)
    app.register_blueprint(workflows_bp)
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def firm(app):
    admin = User(email="admin@firm.com", email_verified=True)
    member = User(email="member@firm.com", email_verified=True)
    outsider = User(email="outsider@other.com", email_verified=True)
    db.session.add_all([admin, member, outsider])
    db.session.flush()
    team = Team(name="Firm", slug="firm", owner_id=admin.id)
    db.session.add(team)
    db.session.flush()
    db.session.add_all(
        [
            TeamMember(user_id=admin.id, team_id=team.id, role=TeamRole.OWNER),
            TeamMember(user_id=member.id, team_id=team.id, role=TeamRole.MEMBER),
        ]
    )
    model = LLMModel(name="Flash", provider="google", model_id="gemini-2.5-flash")
    db.session.add(model)
    document = Document(
        team_id=team.id,
        owner_id=admin.id,
        filename="msa.pdf",
        mime_type="application/pdf",
        size=1,
        sha256="0" * 64,
        s3_key="documents/msa.pdf",
        status="ready",
        paginated=True,
    )
    db.session.add(document)
    db.session.flush()
    text = "This Agreement is governed by the laws of New York."
    db.session.add(
        DocumentChunk(
            document_id=document.id,
            chunk_index=0,
            page_number=3,
            char_start=0,
            char_end=len(text),
            text=text,
        )
    )
    db.session.commit()
    return {
        "admin": admin,
        "member": member,
        "outsider": outsider,
        "team": team,
        "model": model,
        "document": document,
    }


def _headers(user):
    return {"Authorization": f"Bearer {generate_token(user.id, user.email)}"}


PROMPT = {
    "title": "Client update",
    "category": "Letters",
    "body": "Write a {{tone}} update for {{client}}.",
    "fields": [
        {"key": "client", "label": "Client"},
        {
            "key": "tone",
            "label": "Tone",
            "type": "choice",
            "options": ["warm", "brief"],
        },
    ],
}


def test_core_library_is_consistent():
    for template in CORE_PROMPTS:
        assert set(PLACEHOLDER.findall(template.body)) == {
            field.key for field in template.fields
        }, template.key
    for workflow in CORE_WORKFLOWS:
        keys = [step.key for step in workflow.steps]
        assert len(keys) == len(set(keys))
        inputs = {field.key for field in workflow.inputs}
        for index, step in enumerate(workflow.steps):
            text = " ".join(
                [step.instructions, step.search or ""]
                + [prompt for _, prompt in step.questions]
            )
            for source, key in workflows.TEMPLATE_VARIABLE.findall(text):
                if source == "inputs":
                    assert key in inputs, (workflow.key, key)
                else:
                    assert key in keys[:index], (workflow.key, key)


def test_prompt_library_lists_built_in_team_and_personal(client, firm, library):
    admin, member = _headers(firm["admin"]), _headers(firm["member"])
    team_id = firm["team"].id

    shared = client.post(
        "/api/prompts",
        json={**PROMPT, "visibility": "team", "teamId": team_id},
        headers=admin,
    )
    assert shared.status_code == 201
    denied = client.post(
        "/api/prompts",
        json={**PROMPT, "visibility": "team", "teamId": team_id},
        headers=member,
    )
    assert denied.status_code == 403
    personal = client.post(
        "/api/prompts", json={**PROMPT, "title": "Mine"}, headers=member
    )
    assert personal.status_code == 201

    listed = client.get(f"/api/prompts?teamId={team_id}", headers=member).get_json()
    sources = {p["title"]: (p["source"], p["canEdit"]) for p in listed["prompts"]}
    assert sources["Client update"] == ("team", False)
    assert sources["Mine"] == ("personal", True)
    assert sources["Check an NDA"] == ("built_in", False)
    assert sources["Summarize for a reader"] == ("built_in", False)
    assert "Letters" in listed["categories"]
    assert listed["canManageTeamPrompts"] is False

    searched = client.get(
        f"/api/prompts?teamId={team_id}&search=nda", headers=member
    ).get_json()["prompts"]
    assert [p["title"] for p in searched] == ["Check an NDA"]

    outsider = client.get(
        f"/api/prompts/{shared.get_json()['id']}", headers=_headers(firm["outsider"])
    )
    assert outsider.status_code == 404
    assert (
        client.delete(
            f"/api/prompts/{shared.get_json()['id']}", headers=member
        ).status_code
        == 403
    )
    assert AuditLog.query.filter_by(action="prompt.created").count() == 2


def test_prompt_fields_must_match_the_body(client, firm):
    headers = _headers(firm["member"])
    missing = client.post(
        "/api/prompts", json={**PROMPT, "fields": PROMPT["fields"][:1]}, headers=headers
    )
    assert missing.status_code == 400
    assert "{{tone}}" in missing.get_json()["error"]
    unused = client.post(
        "/api/prompts",
        json={**PROMPT, "body": "Write an update for {{client}}."},
        headers=headers,
    )
    assert "never uses {{tone}}" in unused.get_json()["error"]
    no_options = client.post(
        "/api/prompts",
        json={
            **PROMPT,
            "fields": [
                PROMPT["fields"][0],
                {"key": "tone", "label": "Tone", "type": "choice"},
            ],
        },
        headers=headers,
    )
    assert "Give the choices for Tone" in no_options.get_json()["error"]


def test_render_fills_fields_and_counts_uses(client, firm, library):
    headers = _headers(firm["member"])
    prompt = client.post("/api/prompts", json=PROMPT, headers=headers).get_json()

    rendered = client.post(
        f"/api/prompts/{prompt['id']}/render",
        json={"values": {"client": "Acme", "tone": "warm"}},
        headers=headers,
    )
    assert rendered.get_json() == {"text": "Write a warm update for Acme."}
    assert db.session.get(Prompt, prompt["id"]).use_count == 1

    bad_choice = client.post(
        f"/api/prompts/{prompt['id']}/render",
        json={"values": {"client": "Acme", "tone": "angry"}},
        headers=headers,
    )
    assert bad_choice.status_code == 400
    missing = client.post(
        f"/api/prompts/{prompt['id']}/render",
        json={"values": {"tone": "warm"}},
        headers=headers,
    )
    assert missing.get_json()["error"] == "Fill in Client"

    built_in = client.post(
        "/api/prompts/builtin:nda-check/render",
        json={"values": {"party": "Acme"}},
        headers=headers,
    )
    assert built_in.get_json()["text"] == "Check the NDA for Acme."


def test_duplicate_built_in_into_team_and_edit(client, firm, library):
    admin = _headers(firm["admin"])
    copy = client.post(
        "/api/prompts/builtin:nda-check/duplicate",
        json={"visibility": "team", "teamId": firm["team"].id},
        headers=admin,
    )
    assert copy.status_code == 201
    copy = copy.get_json()
    assert copy["source"] == "team"
    updated = client.put(
        f"/api/prompts/{copy['id']}",
        json={
            "title": "Check an NDA (firm)",
            "body": "Check the NDA for {{party}} against our policy.",
            "fields": copy["fields"],
            "visibility": "team",
            "teamId": firm["team"].id,
        },
        headers=admin,
    )
    assert updated.get_json()["title"] == "Check an NDA (firm)"
    assert client.delete(f"/api/prompts/{copy['id']}", headers=admin).status_code == 204


def _start(client, firm, **overrides):
    body = {
        "workflowKey": "test-flow",
        "teamId": firm["team"].id,
        "documentIds": [firm["document"].id],
        "inputs": {"client": "Acme", "tone": "firm"},
        "modelId": firm["model"].id,
        **overrides,
    }
    return client.post(
        "/api/workflows/runs", json=body, headers=_headers(firm["admin"])
    )


def test_workflow_runs_pauses_then_finishes_with_citations(
    client, firm, library, llm, queued, searched
):
    definitions = client.get(
        "/api/workflows", headers=_headers(firm["member"])
    ).get_json()["workflows"]
    assert {"document-brief", "test-flow"} <= {w["key"] for w in definitions}

    response = _start(client, firm)
    assert response.status_code == 201
    run = response.get_json()
    assert run["status"] == "queued"
    assert [s["status"] for s in run["steps"]] == ["pending"] * 3
    assert run["inputs"][0] == {"key": "client", "label": "Client", "value": "Acme"}
    assert queued == [run["id"]]

    workflows.run_workflow(run["id"])
    paused = client.get(
        f"/api/workflows/runs/{run['id']}", headers=_headers(firm["member"])
    ).get_json()
    assert paused["status"] == "waiting"
    facts, issues, letter = paused["steps"]
    assert facts["analysisId"]
    assert "**Law**: New York" in facts["output"]
    assert facts["citations"][0]["pageNumber"] == 3
    cited = issues["citations"][0]["id"]
    assert issues["output"] == f"1. New York law applies [^{cited}]."
    assert letter["status"] == "pending"
    issue_prompt = next(p for p in llm.prompts if "Step: Issues" in p)
    assert "List issues for Acme" in issue_prompt
    assert "**Law**: New York" in issue_prompt
    assert "[^" not in issue_prompt.split("Passages:")[0]
    assert searched[-1] == "governing law Acme"

    edited = client.put(
        f"/api/workflows/runs/{run['id']}/steps/issues",
        json={"output": "1. Check the governing law."},
        headers=_headers(firm["admin"]),
    ).get_json()
    assert edited["steps"][1]["edited"] is True
    assert edited["steps"][1]["citations"] == []
    assert edited["status"] == "waiting"

    resumed = client.post(
        f"/api/workflows/runs/{run['id']}/continue", headers=_headers(firm["admin"])
    ).get_json()
    assert resumed["status"] == "queued"
    workflows.run_workflow(run["id"])
    done = client.get(
        f"/api/workflows/runs/{run['id']}", headers=_headers(firm["admin"])
    ).get_json()
    assert done["status"] == "done"
    assert done["steps"][2]["output"] == "Dear client, see the issues."
    letter_prompt = next(p for p in llm.prompts if "Step: Letter" in p)
    assert "Write a firm letter on:\n1. Check the governing law." in letter_prompt
    assert done["inputTokens"] > 0
    assert TokenUsage.query.filter_by(team_id=firm["team"].id).count() >= 2

    exported = client.get(
        f"/api/workflows/runs/{run['id']}/export", headers=_headers(firm["admin"])
    )
    assert exported.status_code == 200
    text = "\n".join(p.text for p in WordDocument(io.BytesIO(exported.data)).paragraphs)
    assert "Client: Acme" in text
    assert "Law: New York[1]" in text
    assert "[1] msa.pdf, p. 3" in text


def test_workflow_validation_and_access(client, firm, library, llm, queued):
    assert _start(client, firm, documentIds=[]).get_json()["error"] == (
        "Choose at least one document"
    )
    assert _start(client, firm, inputs={"client": "Acme"}).get_json()["error"] == (
        "Fill in Tone"
    )
    assert _start(client, firm, workflowKey="nope").status_code == 404
    run = _start(client, firm).get_json()
    assert (
        client.get(
            f"/api/workflows/runs/{run['id']}", headers=_headers(firm["outsider"])
        ).status_code
        == 404
    )
    listed = client.get(
        f"/api/workflows/runs?teamId={firm['team'].id}",
        headers=_headers(firm["member"]),
    ).get_json()["runs"]
    assert [r["id"] for r in listed] == [run["id"]]
    assert listed[0]["progress"] == {"total": 3, "done": 0}


def test_failed_step_hides_error_and_can_be_retried(
    client, firm, library, llm, queued, searched
):
    run = _start(client, firm).get_json()
    llm.fail_on = "Step: Issues"
    workflows.run_workflow(run["id"])
    failed = client.get(
        f"/api/workflows/runs/{run['id']}", headers=_headers(firm["admin"])
    ).get_json()
    assert failed["status"] == "failed"
    assert failed["error"] == "Issues failed"
    assert failed["steps"][1]["error"] == "The model could not finish this step"
    assert failed["steps"][0]["status"] == "done"

    llm.fail_on = None
    client.post(
        f"/api/workflows/runs/{run['id']}/continue", headers=_headers(firm["admin"])
    )
    workflows.run_workflow(run["id"])
    after = client.get(
        f"/api/workflows/runs/{run['id']}", headers=_headers(firm["admin"])
    ).get_json()
    assert after["status"] == "waiting"
    assert after["steps"][1]["status"] == "done"

    rerun = client.post(
        f"/api/workflows/runs/{run['id']}/steps/facts/rerun",
        headers=_headers(firm["admin"]),
    ).get_json()
    assert [s["status"] for s in rerun["steps"]] == ["pending"] * 3

    cancelled = client.post(
        f"/api/workflows/runs/{run['id']}/cancel", headers=_headers(firm["admin"])
    ).get_json()
    assert cancelled["status"] == "cancelled"
    assert (
        client.delete(
            f"/api/workflows/runs/{run['id']}", headers=_headers(firm["admin"])
        ).status_code
        == 204
    )
