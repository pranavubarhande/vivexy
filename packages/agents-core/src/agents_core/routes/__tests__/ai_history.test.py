from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from flask import Flask

from agents_core.business_logic.data_lifecycle import (
    erase_user,
    purge_expired_team_work,
)
from agents_core.business_logic.maintenance import run_maintenance
from agents_core.models import (
    AuditLog,
    Chat,
    Document,
    DocumentAnalysis,
    DocumentAnalysisResult,
    Prompt,
    Team,
    TeamMember,
    TeamRole,
    TokenUsage,
    User,
    WorkflowRun,
    WorkflowRunStep,
    db,
)
from agents_core.routes.users import bp as users_bp
from agents_core.utils.auth import generate_token


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["JWT_SECRET_KEY"] = "test-secret-key-long-enough-for-hs256"
    app.register_blueprint(users_bp)
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app


@pytest.fixture
def firm(app):
    lawyer = User(email="lawyer@firm.com", email_verified=True)
    colleague = User(email="colleague@firm.com", email_verified=True)
    db.session.add_all([lawyer, colleague])
    db.session.flush()
    team = Team(name="Firm", slug="firm", owner_id=colleague.id, retention_days=30)
    db.session.add(team)
    db.session.flush()
    db.session.add_all(
        [
            TeamMember(user_id=colleague.id, team_id=team.id, role=TeamRole.OWNER),
            TeamMember(user_id=lawyer.id, team_id=team.id, role=TeamRole.MEMBER),
        ]
    )
    document = Document(
        team_id=team.id,
        owner_id=colleague.id,
        filename="msa.pdf",
        mime_type="application/pdf",
        size=1,
        sha256="0" * 64,
        s3_key="documents/msa.pdf",
        status="ready",
    )
    db.session.add(document)
    db.session.commit()
    return {"lawyer": lawyer, "colleague": colleague, "team": team, "doc": document}


def _work(owner, team, document, updated_at=None):
    analysis = DocumentAnalysis(
        team_id=team.id,
        owner_id=owner.id,
        kind="summary",
        title="Summary",
        document_ids=[document.id],
    )
    db.session.add(analysis)
    db.session.flush()
    db.session.add(
        DocumentAnalysisResult(analysis_id=analysis.id, document_id=document.id)
    )
    run = WorkflowRun(
        team_id=team.id, owner_id=owner.id, workflow_key="brief", title="Brief"
    )
    db.session.add(run)
    db.session.flush()
    db.session.add(
        WorkflowRunStep(
            run_id=run.id, step_key="summaries", position=0, analysis_id=analysis.id
        )
    )
    db.session.add(TokenUsage(user_id=owner.id, team_id=team.id, total_cost_usd=0.5))
    if updated_at:
        analysis.updated_at = updated_at
        run.updated_at = updated_at
    db.session.commit()
    return analysis.id, run.id


@patch("agents_core.business_logic.data_lifecycle.S3Service")
def test_delete_my_history_removes_only_my_ai_work(mock_storage, app, firm):
    lawyer, team = firm["lawyer"], firm["team"]
    db.session.add_all(
        [Chat(user_id=lawyer.id, team_id=team.id), Chat(user_id=firm["colleague"].id)]
    )
    db.session.add(Prompt(owner_id=lawyer.id, title="Mine", body="Hi"))
    db.session.commit()
    _work(lawyer, team, firm["doc"])
    theirs = _work(firm["colleague"], team, firm["doc"])

    response = app.test_client().delete(
        "/users/me/history",
        headers={"Authorization": f"Bearer {generate_token(lawyer.id, lawyer.email)}"},
    )

    assert response.status_code == 200
    assert response.get_json()["deleted"] == {
        "chats": 1,
        "analyses": 1,
        "workflowRuns": 1,
    }
    assert [a.id for a in DocumentAnalysis.query.all()] == [theirs[0]]
    assert [r.id for r in WorkflowRun.query.all()] == [theirs[1]]
    assert DocumentAnalysisResult.query.count() == 1
    assert WorkflowRunStep.query.count() == 1
    assert Chat.query.count() == 1
    assert Prompt.query.count() == 1
    assert Document.query.count() == 1
    assert TokenUsage.query.count() == 2
    assert AuditLog.query.filter_by(action="user.history_deleted").count() == 1


@patch("agents_core.business_logic.data_lifecycle.S3Service")
def test_retention_purges_old_analyses_and_runs(mock_storage, app, firm):
    old = _work(
        firm["lawyer"],
        firm["team"],
        firm["doc"],
        datetime.utcnow() - timedelta(days=45),
    )
    recent = _work(firm["lawyer"], firm["team"], firm["doc"])

    assert purge_expired_team_work() == {
        firm["team"].id: {"analyses": 1, "workflowRuns": 1}
    }
    assert [a.id for a in DocumentAnalysis.query.all()] == [recent[0]]
    assert [r.id for r in WorkflowRun.query.all()] == [recent[1]]
    assert old[0] not in {r.analysis_id for r in DocumentAnalysisResult.query.all()}


@patch(
    "agents_core.business_logic.maintenance.deliver_platform_alerts", return_value=[]
)
@patch(
    "agents_core.business_logic.maintenance.compute_platform_alerts", return_value=[]
)
@patch("agents_core.business_logic.data_lifecycle.S3Service")
def test_maintenance_audits_purged_work(
    mock_storage, mock_alerts, mock_deliver, app, firm
):
    _work(
        firm["lawyer"],
        firm["team"],
        firm["doc"],
        datetime.utcnow() - timedelta(days=45),
    )
    result = run_maintenance()
    assert result["purgedWork"] == {firm["team"].id: {"analyses": 1, "workflowRuns": 1}}
    log = AuditLog.query.filter_by(action="system.retention_purged").one()
    assert log.details == {
        "deletedChats": 0,
        "deletedAnalyses": 1,
        "deletedWorkflowRuns": 1,
    }


@patch("agents_core.business_logic.data_lifecycle.S3Service")
def test_erasure_deletes_analyses_runs_and_personal_prompts(mock_storage, app, firm):
    lawyer = firm["lawyer"]
    _work(lawyer, firm["team"], firm["doc"])
    db.session.add_all(
        [
            Prompt(owner_id=lawyer.id, title="Mine", body="Hi"),
            Prompt(
                owner_id=lawyer.id,
                team_id=firm["team"].id,
                visibility="team",
                title="Shared",
                body="Hi",
            ),
        ]
    )
    db.session.commit()

    erase_user(lawyer.id, firm["colleague"])

    assert DocumentAnalysis.query.count() == 0
    assert WorkflowRun.query.count() == 0
    assert [p.title for p in Prompt.query.all()] == ["Shared"]
