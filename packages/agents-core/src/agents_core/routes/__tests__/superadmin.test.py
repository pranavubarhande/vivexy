import pytest
from flask import Flask

from agents_core.models import (
    Announcement,
    AuditLog,
    LLMModel,
    Role,
    Subscription,
    Team,
    TeamMember,
    TeamRole,
    TokenUsage,
    User,
    db,
)
from agents_core.routes.announcements import bp as announcements_bp
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
    for blueprint in (superadmin_bp, announcements_bp, auth_bp, teams_bp):
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
def platform(app):
    superadmin = _make_user("root@vivexy.com", Role.SUPER_ADMIN)
    owner = _make_user("owner@acme.com")
    platform_admin = _make_user("support@vivexy.com", Role.ADMIN)
    team = Team(name="Acme", slug="acme", owner_id=owner.id)
    db.session.add(team)
    db.session.flush()
    db.session.add_all(
        [
            TeamMember(user_id=owner.id, team_id=team.id, role=TeamRole.OWNER),
            TokenUsage(
                user_id=owner.id,
                team_id=team.id,
                total_tokens=2000,
                total_cost_usd=3.25,
            ),
        ]
    )
    db.session.commit()
    return {
        "superadmin": superadmin,
        "owner": owner,
        "platform_admin": platform_admin,
        "team": team,
    }


@pytest.mark.parametrize(
    "path", ["/superadmin/overview", "/superadmin/clients", "/superadmin/users"]
)
def test_non_superadmins_are_forbidden(client, platform, path):
    assert client.get(path).status_code == 401
    assert client.get(path, headers=_headers(platform["owner"])).status_code == 403
    response = client.get(path, headers=_headers(platform["platform_admin"]))
    assert response.status_code == 403


def test_overview(client, platform):
    response = client.get(
        "/superadmin/overview", headers=_headers(platform["superadmin"])
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["users"]["total"] == 3
    assert body["users"]["active30d"] == 1
    assert body["clients"]["total"] == 1
    assert body["usage"]["allTime"]["totalCostUsd"] == pytest.approx(3.25)


def test_clients_list_and_search(client, platform):
    headers = _headers(platform["superadmin"])
    body = client.get("/superadmin/clients", headers=headers).get_json()
    assert body["total"] == 1
    assert body["items"][0]["memberCount"] == 1
    assert body["items"][0]["usage"]["totalCostUsd"] == pytest.approx(3.25)
    assert body["items"][0]["plan"] == "FREE"

    body = client.get("/superadmin/clients?search=owner@acme", headers=headers)
    assert body.get_json()["total"] == 1
    body = client.get("/superadmin/clients?search=nomatch", headers=headers)
    assert body.get_json()["total"] == 0


def test_suspend_client_and_set_seat_limit(client, platform):
    team_id = platform["team"].id
    response = client.patch(
        f"/superadmin/clients/{team_id}",
        json={"is_suspended": True, "seat_limit": 5, "notes": "Late invoice"},
        headers=_headers(platform["superadmin"]),
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["isSuspended"] is True
    assert body["seatLimit"] == 5
    assert body["recentAuditLogs"][0]["action"] == "superadmin.client_updated"

    response = client.patch(
        f"/superadmin/clients/{team_id}",
        json={"seat_limit": None},
        headers=_headers(platform["superadmin"]),
    )
    assert Team.query.get(team_id).seat_limit is None


def test_suspend_user(client, platform):
    owner_id = platform["owner"].id
    response = client.patch(
        f"/superadmin/users/{owner_id}",
        json={"is_suspended": True},
        headers=_headers(platform["superadmin"]),
    )
    assert response.status_code == 200
    assert User.query.get(owner_id).is_suspended is True


def test_superadmin_cannot_modify_self(client, platform):
    superadmin = platform["superadmin"]
    response = client.patch(
        f"/superadmin/users/{superadmin.id}",
        json={"role": "USER"},
        headers=_headers(superadmin),
    )
    assert response.status_code == 400
    assert User.query.get(superadmin.id).role == Role.SUPER_ADMIN


def test_users_filter_by_role(client, platform):
    response = client.get(
        "/superadmin/users?role=SUPER_ADMIN", headers=_headers(platform["superadmin"])
    )
    assert [user["email"] for user in response.get_json()["items"]] == [
        "root@vivexy.com"
    ]
    response = client.get(
        "/superadmin/users?role=BOGUS", headers=_headers(platform["superadmin"])
    )
    assert response.status_code == 400


def test_user_detail(client, platform):
    response = client.get(
        f"/superadmin/users/{platform['owner'].id}",
        headers=_headers(platform["superadmin"]),
    )
    body = response.get_json()
    assert body["teams"][0]["role"] == "OWNER"
    assert body["allTimeUsage"]["totalTokens"] == 2000


def test_manual_plan_override_drives_revenue(client, platform):
    headers = _headers(platform["superadmin"])
    team_id = platform["team"].id
    response = client.put(
        f"/superadmin/clients/{team_id}/plan",
        json={"plan": "PRO", "status": "ACTIVE"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.get_json()["plan"] == "PRO"
    overview = client.get("/superadmin/overview", headers=headers).get_json()
    assert overview["revenue"]["mrrUsd"] == 29.0
    assert overview["revenue"]["arrUsd"] == 348.0

    client.put(
        f"/superadmin/clients/{team_id}/plan", json={"plan": "FREE"}, headers=headers
    )
    overview = client.get("/superadmin/overview", headers=headers).get_json()
    assert overview["revenue"]["mrrUsd"] == 0
    assert overview["subscriptions"]["churned30d"] == 1


def test_stripe_managed_plan_cannot_be_overridden(client, platform):
    db.session.add(
        Subscription(
            team_id=platform["team"].id,
            stripe_subscription_id="sub_real",
            status="ACTIVE",
            plan="PRO",
        )
    )
    db.session.commit()
    response = client.put(
        f"/superadmin/clients/{platform['team'].id}/plan",
        json={"plan": "ENTERPRISE"},
        headers=_headers(platform["superadmin"]),
    )
    assert response.status_code == 400


def test_impersonation_is_read_only_and_audited(client, platform):
    response = client.post(
        f"/superadmin/users/{platform['owner'].id}/impersonate",
        headers=_headers(platform["superadmin"]),
    )
    assert response.status_code == 200
    token = response.get_json()["token"]
    impersonated = {"Authorization": f"Bearer {token}"}

    me = client.get("/auth/me", headers=impersonated).get_json()["user"]
    assert me["email"] == "owner@acme.com"
    assert me["impersonatedBy"] == "root@vivexy.com"

    response = client.post("/teams", json={"name": "New"}, headers=impersonated)
    assert response.status_code == 403
    assert (
        AuditLog.query.filter_by(action="superadmin.impersonation_started").count() == 1
    )

    platform["superadmin"].role = Role.USER
    db.session.commit()
    assert client.get("/auth/me", headers=impersonated).status_code == 401


def test_cannot_impersonate_superadmin(client, platform):
    other = User(email="root2@vivexy.com", role=Role.SUPER_ADMIN)
    db.session.add(other)
    db.session.commit()
    response = client.post(
        f"/superadmin/users/{other.id}/impersonate",
        headers=_headers(platform["superadmin"]),
    )
    assert response.status_code == 403


def test_model_management(client, platform):
    model = LLMModel(name="GPT", provider="openai", model_id="gpt", input_cost=1)
    db.session.add(model)
    db.session.commit()
    headers = _headers(platform["superadmin"])
    response = client.patch(
        f"/superadmin/models/{model.id}",
        json={"is_active": False, "input_cost": 2.5},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.get_json()["isActive"] is False
    assert LLMModel.query.get(model.id).input_cost == 2.5
    models = client.get("/superadmin/models", headers=headers).get_json()["models"]
    assert models[0]["name"] == "GPT"


def test_health(client, platform):
    response = client.get(
        "/superadmin/health", headers=_headers(platform["superadmin"])
    )
    body = response.get_json()
    assert body["database"]["ok"] is True
    assert body["scheduledTasks"]["failed24h"] == 0


def test_announcements_are_scoped_to_teams(client, platform):
    headers = _headers(platform["superadmin"])
    client.post("/superadmin/announcements", json={"title": "Global"}, headers=headers)
    client.post(
        "/superadmin/announcements",
        json={"title": "Acme only", "team_id": platform["team"].id},
        headers=headers,
    )
    client.post(
        "/superadmin/announcements",
        json={"title": "Other team", "team_id": "someone-else"},
        headers=headers,
    )
    owner_view = client.get("/announcements", headers=_headers(platform["owner"]))
    titles = {item["title"] for item in owner_view.get_json()["announcements"]}
    assert titles == {"Global", "Acme only"}
    assert Announcement.query.count() == 3


def test_feature_flags_visible_to_members(client, platform):
    team_id = platform["team"].id
    client.patch(
        f"/superadmin/clients/{team_id}",
        json={"feature_flags": {"beta_agents": True}},
        headers=_headers(platform["superadmin"]),
    )
    response = client.get(
        f"/teams/{team_id}/features", headers=_headers(platform["owner"])
    )
    assert response.get_json()["features"] == {"beta_agents": True}
    response = client.get(
        f"/teams/{team_id}/features", headers=_headers(platform["platform_admin"])
    )
    assert response.status_code == 403
