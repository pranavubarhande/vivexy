import pytest
from flask import Flask

from agents_core.models import Role, Team, TeamMember, TeamRole, TokenUsage, User, db
from agents_core.routes.superadmin import bp as superadmin_bp
from agents_core.utils.auth import generate_token


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["JWT_SECRET_KEY"] = "test-secret"
    app.register_blueprint(superadmin_bp)
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
