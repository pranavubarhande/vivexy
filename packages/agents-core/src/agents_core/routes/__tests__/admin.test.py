from datetime import datetime, timedelta

import pytest
from flask import Flask

from agents_core.models import (
    AuditLog,
    Role,
    Team,
    TeamInvite,
    TeamMember,
    TeamRole,
    TokenUsage,
    User,
    db,
)
from agents_core.routes.admin import bp as admin_bp
from agents_core.routes.auth import bp as auth_bp
from agents_core.routes.superadmin import bp as superadmin_bp
from agents_core.routes.teams import bp as teams_bp
from agents_core.utils.auth import generate_token


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["JWT_SECRET_KEY"] = "test-secret"
    app.config["FRONTEND_URL"] = "http://localhost:3000"
    for blueprint in (auth_bp, teams_bp, admin_bp, superadmin_bp):
        app.register_blueprint(blueprint)
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app


@pytest.fixture
def client(app):
    return app.test_client()


def _make_user(email, role=Role.USER):
    user = User(email=email, name=email.split("@")[0], role=role)
    db.session.add(user)
    db.session.commit()
    return user


def _headers(user):
    return {"Authorization": f"Bearer {generate_token(user.id, user.email)}"}


@pytest.fixture
def team_setup(app):
    owner = _make_user("owner@acme.com")
    admin = _make_user("admin@acme.com")
    member = _make_user("member@acme.com")
    outsider = _make_user("outsider@other.com")
    team = Team(name="Acme", slug="acme", owner_id=owner.id)
    db.session.add(team)
    db.session.flush()
    db.session.add_all(
        [
            TeamMember(user_id=owner.id, team_id=team.id, role=TeamRole.OWNER),
            TeamMember(user_id=admin.id, team_id=team.id, role=TeamRole.ADMIN),
            TeamMember(user_id=member.id, team_id=team.id, role=TeamRole.MEMBER),
            TokenUsage(
                user_id=member.id,
                team_id=team.id,
                total_tokens=1000,
                total_cost_usd=1.5,
            ),
            TokenUsage(user_id=member.id, total_tokens=10, total_cost_usd=4.0),
            TokenUsage(user_id=outsider.id, total_tokens=50, total_cost_usd=9.0),
        ]
    )
    db.session.commit()
    return {
        "owner": owner,
        "admin": admin,
        "member": member,
        "outsider": outsider,
        "team": team,
    }


def test_register_ignores_role_in_payload(client, app, monkeypatch):
    monkeypatch.setattr(
        "agents_core.routes.auth._send_verification_email_for", lambda user: True
    )
    response = client.post(
        "/auth/register",
        json={
            "name": "Mallory",
            "email": "mallory@example.com",
            "password": "securepass123",
            "role": "SUPER_ADMIN",
        },
    )
    assert response.status_code == 201
    assert response.get_json()["user"]["role"] == "USER"
    user = User.query.filter_by(email="mallory@example.com").first()
    assert user.role == Role.USER
    assert user.last_login_at is not None


def test_suspended_user_is_rejected(client, team_setup):
    member = team_setup["member"]
    member.is_suspended = True
    db.session.commit()
    response = client.get("/teams", headers=_headers(member))
    assert response.status_code == 403


def test_member_cannot_open_admin_panel(client, team_setup):
    team_id = team_setup["team"].id
    response = client.get(
        f"/admin/teams/{team_id}/overview", headers=_headers(team_setup["member"])
    )
    assert response.status_code == 403
    response = client.get(
        f"/admin/teams/{team_id}/overview", headers=_headers(team_setup["outsider"])
    )
    assert response.status_code == 403


def test_admin_overview_counts_only_team_attributed_usage(client, team_setup):
    response = client.get(
        f"/admin/teams/{team_setup['team'].id}/overview",
        headers=_headers(team_setup["admin"]),
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["memberCount"] == 3
    assert body["activeMemberCount"] == 1
    assert body["usage"]["totalCostUsd"] == pytest.approx(1.5)
    assert body["viewerRole"] == "ADMIN"


def test_admin_teams_lists_only_administered(client, team_setup):
    response = client.get("/admin/teams", headers=_headers(team_setup["member"]))
    assert response.get_json()["teams"] == []
    response = client.get("/admin/teams", headers=_headers(team_setup["owner"]))
    assert [team["name"] for team in response.get_json()["teams"]] == ["Acme"]


def test_only_owner_changes_roles_and_change_is_audited(client, team_setup):
    team_id = team_setup["team"].id
    member_id = team_setup["member"].id
    url = f"/admin/teams/{team_id}/members/{member_id}"

    response = client.patch(
        url, json={"role": "ADMIN"}, headers=_headers(team_setup["admin"])
    )
    assert response.status_code == 403

    response = client.patch(
        url, json={"role": "ADMIN"}, headers=_headers(team_setup["owner"])
    )
    assert response.status_code == 200
    membership = TeamMember.query.filter_by(team_id=team_id, user_id=member_id).one()
    assert membership.role == TeamRole.ADMIN
    audit_log = AuditLog.query.one()
    assert audit_log.action == "team.member_role_changed"
    assert audit_log.team_id == team_id


def test_owner_cannot_be_removed_or_demoted(client, team_setup):
    team_id = team_setup["team"].id
    owner_id = team_setup["owner"].id
    response = client.delete(
        f"/admin/teams/{team_id}/members/{owner_id}",
        headers=_headers(team_setup["admin"]),
    )
    assert response.status_code == 400


def test_admin_cannot_remove_another_admin(client, team_setup):
    other_admin = _make_user("admin2@acme.com")
    team_id = team_setup["team"].id
    db.session.add(
        TeamMember(user_id=other_admin.id, team_id=team_id, role=TeamRole.ADMIN)
    )
    db.session.commit()
    response = client.delete(
        f"/admin/teams/{team_id}/members/{other_admin.id}",
        headers=_headers(team_setup["admin"]),
    )
    assert response.status_code == 403


def test_seat_limit_blocks_invites(client, team_setup):
    team = team_setup["team"]
    team.seat_limit = 3
    db.session.commit()
    response = client.post(
        f"/teams/{team.id}/members",
        json={"email": "new@acme.com"},
        headers=_headers(team_setup["owner"]),
    )
    assert response.status_code == 400
    assert "Seat limit" in response.get_json()["error"]


def test_revoke_invite(client, team_setup):
    team_id = team_setup["team"].id
    invite = TeamInvite(
        email="pending@acme.com",
        token="token-1",
        team_id=team_id,
        invited_by=team_setup["owner"].id,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.session.add(invite)
    db.session.commit()
    response = client.delete(
        f"/admin/teams/{team_id}/invites/{invite.id}",
        headers=_headers(team_setup["admin"]),
    )
    assert response.status_code == 200
    assert TeamInvite.query.count() == 0


def test_suspended_team_is_read_only(client, team_setup):
    team = team_setup["team"]
    team.is_suspended = True
    db.session.commit()
    response = client.patch(
        f"/admin/teams/{team.id}/settings",
        json={"monthly_budget_usd": 100},
        headers=_headers(team_setup["owner"]),
    )
    assert response.status_code == 403
    response = client.get(
        f"/admin/teams/{team.id}/overview", headers=_headers(team_setup["owner"])
    )
    assert response.status_code == 200


def test_budget_can_be_set_and_cleared(client, team_setup):
    team = team_setup["team"]
    url = f"/admin/teams/{team.id}/settings"
    headers = _headers(team_setup["owner"])
    client.patch(url, json={"monthly_budget_usd": 250}, headers=headers)
    assert Team.query.get(team.id).monthly_budget_usd == 250
    client.patch(url, json={"monthly_budget_usd": None}, headers=headers)
    assert Team.query.get(team.id).monthly_budget_usd is None
