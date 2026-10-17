from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from flask import Flask

from agents_core.business_logic.data_lifecycle import (
    hard_delete_chats,
    purge_expired_team_chats,
)
from agents_core.business_logic.platform_alerts import compute_platform_alerts
from agents_core.models import (
    Artifact,
    ArtifactType,
    AuditLog,
    Chat,
    Message,
    MessageRole,
    Role,
    Team,
    TeamMember,
    TeamRole,
    Todo,
    TokenUsage,
    User,
    db,
)
from agents_core.routes.admin import bp as admin_bp
from agents_core.routes.auth import bp as auth_bp
from agents_core.routes.superadmin import bp as superadmin_bp
from agents_core.routes.users import bp as users_bp
from agents_core.utils.auth import generate_token, hash_password


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["JWT_SECRET_KEY"] = "test-secret"
    app.config["FRONTEND_URL"] = "http://localhost:3000"
    for blueprint in (auth_bp, admin_bp, superadmin_bp, users_bp):
        app.register_blueprint(blueprint)
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app


@pytest.fixture
def client(app):
    return app.test_client()


def _headers(user):
    return {"Authorization": f"Bearer {generate_token(user.id, user.email)}"}


@pytest.fixture
def org(app):
    root = User(email="root@vivexy.com", role=Role.SUPER_ADMIN)
    support = User(email="support@vivexy.com", role=Role.ADMIN)
    owner = User(
        email="owner@acme.com",
        password=hash_password("pw-123456"),
        email_verified=True,
    )
    db.session.add_all([root, support, owner])
    db.session.flush()
    team = Team(name="Acme", slug="acme", owner_id=owner.id)
    db.session.add(team)
    db.session.flush()
    db.session.add(TeamMember(user_id=owner.id, team_id=team.id, role=TeamRole.OWNER))
    db.session.commit()
    return {"root": root, "support": support, "owner": owner, "team": team}


def _chat_with_content(user, team_id=None, updated_at=None):
    chat = Chat(user_id=user.id, team_id=team_id)
    db.session.add(chat)
    db.session.flush()
    message = Message(chat_id=chat.id, role=MessageRole.USER, content="hello")
    db.session.add(message)
    db.session.flush()
    db.session.add_all(
        [
            Artifact(
                chat_id=chat.id,
                message_id=message.id,
                title="a",
                content="x",
                type=ArtifactType.MD,
                seq=1,
            ),
            Todo(chat_id=chat.id, title="t"),
            TokenUsage(
                user_id=user.id,
                team_id=team_id,
                message_id=message.id,
                total_cost_usd=1.0,
            ),
        ]
    )
    if updated_at:
        chat.updated_at = updated_at
    db.session.commit()
    return chat


def _enable_domain(team, **flags):
    team.email_domain = "acme.com"
    team.domain_verified = True
    for key, value in flags.items():
        setattr(team, key, value)
    db.session.commit()


def test_require_sso_blocks_password_login(client, org):
    payload = {"email": "owner@acme.com", "password": "pw-123456"}
    assert client.post("/auth/login", json=payload).status_code == 200
    org["team"].require_sso = True
    db.session.commit()
    response = client.post("/auth/login", json=payload)
    assert response.status_code == 403
    assert response.get_json()["code"] == "sso_required"


def test_verified_sso_domain_blocks_password_registration(client, org):
    _enable_domain(org["team"], require_sso=True)
    response = client.post(
        "/auth/register",
        json={"email": "new@acme.com", "password": "pw-123456", "name": "N"},
    )
    assert response.status_code == 403


def test_verified_domain_auto_join(org):
    from agents_core.business_logic.org_policy import auto_join_by_domain

    _enable_domain(org["team"], auto_join_domain=True)
    newcomer = User(email="new@acme.com", email_verified=True)
    outsider = User(email="x@other.com", email_verified=True)
    unverified = User(email="pending@acme.com")
    db.session.add_all([newcomer, outsider, unverified])
    db.session.commit()

    assert auto_join_by_domain(newcomer) == [org["team"].id]
    assert auto_join_by_domain(outsider) == []
    assert auto_join_by_domain(unverified) == []
    assert AuditLog.query.filter_by(action="team.member_auto_joined").count() == 1


def test_domain_change_requires_reverification(client, org):
    team = org["team"]
    _enable_domain(team)
    client.patch(
        f"/admin/teams/{team.id}/settings",
        json={"email_domain": "acme.io"},
        headers=_headers(org["owner"]),
    )
    assert Team.query.get(team.id).domain_verified is False
    response = client.patch(
        f"/admin/teams/{team.id}/settings",
        json={"email_domain": "not a domain"},
        headers=_headers(org["owner"]),
    )
    assert response.status_code == 400


def test_domain_cannot_be_verified_twice(client, org):
    _enable_domain(org["team"])
    other_owner = User(email="o@globex.com")
    db.session.add(other_owner)
    db.session.flush()
    other = Team(name="G", slug="g", owner_id=other_owner.id, email_domain="acme.com")
    db.session.add(other)
    db.session.commit()
    response = client.patch(
        f"/superadmin/clients/{other.id}",
        json={"domain_verified": True},
        headers=_headers(org["root"]),
    )
    assert response.status_code == 400


def test_hard_delete_removes_content_but_keeps_usage(org):
    chat = _chat_with_content(org["owner"])
    assert hard_delete_chats([chat.id], delete_files=False) == 1
    assert Chat.query.count() == 0
    assert Message.query.count() == 0
    assert Artifact.query.count() == 0
    assert Todo.query.count() == 0
    usage = TokenUsage.query.one()
    assert usage.message_id is None
    assert usage.total_cost_usd == 1.0


@patch("agents_core.business_logic.data_lifecycle.S3Service")
def test_retention_purges_only_old_team_chats(mock_storage, org):
    team = org["team"]
    team.retention_days = 30
    db.session.commit()
    old = _chat_with_content(
        org["owner"], team.id, datetime.utcnow() - timedelta(days=45)
    )
    recent = _chat_with_content(org["owner"], team.id)
    personal_old = _chat_with_content(
        org["owner"], None, datetime.utcnow() - timedelta(days=400)
    )
    old_id, recent_id, personal_old_id = old.id, recent.id, personal_old.id
    assert purge_expired_team_chats() == {team.id: 1}
    remaining = {row[0] for row in db.session.query(Chat.id).all()}
    assert remaining == {recent_id, personal_old_id}
    mock_storage.return_value.delete_chat_files.assert_called_once_with(old_id)


@patch("agents_core.business_logic.data_lifecycle.S3Service")
def test_gdpr_export_and_erase(mock_storage, client, org):
    lone_owner = User(email="solo@solo.com", name="Solo", email_verified=True)
    db.session.add(lone_owner)
    db.session.flush()
    solo_team = Team(name="Solo", slug="solo", owner_id=lone_owner.id)
    db.session.add(solo_team)
    db.session.flush()
    db.session.add(
        TeamMember(user_id=lone_owner.id, team_id=solo_team.id, role=TeamRole.OWNER)
    )
    db.session.commit()
    _chat_with_content(lone_owner, solo_team.id)
    headers = _headers(org["root"])

    export = client.post(
        f"/superadmin/users/{lone_owner.id}/export", headers=headers
    ).get_json()
    assert export["profile"]["email"] == "solo@solo.com"
    assert export["chats"][0]["messages"][0]["content"] == "hello"

    response = client.post(f"/superadmin/users/{lone_owner.id}/erase", headers=headers)
    assert response.status_code == 200
    erased = User.query.get(lone_owner.id)
    assert erased.email.endswith("@erased.invalid")
    assert erased.name is None and erased.is_suspended and erased.deleted_at
    assert Chat.query.filter_by(user_id=lone_owner.id).count() == 0
    assert Team.query.get(solo_team.id) is None
    assert TokenUsage.query.filter_by(user_id=lone_owner.id).count() == 1


def test_cannot_erase_owner_of_shared_team(client, org):
    member = User(email="m@acme.com")
    db.session.add(member)
    db.session.flush()
    db.session.add(TeamMember(user_id=member.id, team_id=org["team"].id))
    db.session.commit()
    response = client.post(
        f"/superadmin/users/{org['owner'].id}/erase", headers=_headers(org["root"])
    )
    assert response.status_code == 400


def test_support_role_is_read_only(client, org):
    headers = _headers(org["support"])
    assert client.get("/superadmin/overview", headers=headers).status_code == 200
    assert client.get("/superadmin/alerts", headers=headers).status_code == 200
    response = client.patch(
        f"/superadmin/users/{org['owner'].id}",
        json={"is_suspended": True},
        headers=headers,
    )
    assert response.status_code == 403
    response = client.post(
        f"/superadmin/users/{org['owner'].id}/export", headers=headers
    )
    assert response.status_code == 403
    owner_headers = _headers(org["owner"])
    assert client.get("/superadmin/overview", headers=owner_headers).status_code == 403


def test_self_service_export(client, org):
    response = client.get("/users/me/export", headers=_headers(org["owner"]))
    assert response.get_json()["profile"]["email"] == "owner@acme.com"


def test_cost_spike_and_budget_alerts(org):
    team = org["team"]
    team.monthly_budget_usd = 10
    for days_ago in range(2, 9):
        db.session.add(
            TokenUsage(
                user_id=org["owner"].id,
                team_id=team.id,
                total_cost_usd=1.0,
                created_at=datetime.utcnow() - timedelta(days=days_ago),
            )
        )
    db.session.add(
        TokenUsage(user_id=org["owner"].id, team_id=team.id, total_cost_usd=40.0)
    )
    db.session.commit()
    keys = {alert["key"].split(":")[0] for alert in compute_platform_alerts()}
    assert {"platform_cost_spike", "client_cost_spike", "client_over_budget"} <= keys
