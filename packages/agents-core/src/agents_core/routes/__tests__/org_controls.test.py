from unittest.mock import MagicMock, patch

import pytest
from agents_core.models import (
    AuditLog,
    Chat,
    Message,
    MessageRole,
    Role,
    ScheduledTask,
    ScheduledTaskRun,
    Team,
    TeamMember,
    TeamRole,
    User,
    UserApiKey,
    db,
)
from agents_core.routes.admin import bp as admin_bp
from agents_core.routes.chat import bp as chat_bp
from agents_core.routes.rag import bp as rag_bp
from agents_core.routes.scheduled_tasks import bp as scheduled_tasks_bp
from agents_core.routes.superadmin import bp as superadmin_bp
from agents_core.routes.users import bp as users_bp
from agents_core.utils.auth import generate_token
from flask import Flask


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["JWT_SECRET_KEY"] = "test-secret"
    app.config["FRONTEND_URL"] = "http://localhost:3000"
    for blueprint in (
        admin_bp,
        chat_bp,
        rag_bp,
        scheduled_tasks_bp,
        superadmin_bp,
        users_bp,
    ):
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
    owner = User(email="owner@acme.com", email_verified=True)
    admin = User(email="admin@acme.com", email_verified=True)
    member = User(email="member@acme.com", email_verified=True)
    outsider = User(email="someone@else.com")
    db.session.add_all([root, owner, admin, member, outsider])
    db.session.flush()
    team = Team(name="Acme", slug="acme", owner_id=owner.id)
    db.session.add(team)
    db.session.flush()
    db.session.add_all(
        [
            TeamMember(user_id=owner.id, team_id=team.id, role=TeamRole.OWNER),
            TeamMember(user_id=admin.id, team_id=team.id, role=TeamRole.ADMIN),
            TeamMember(user_id=member.id, team_id=team.id, role=TeamRole.MEMBER),
        ]
    )
    db.session.commit()
    return {
        "root": root,
        "owner": owner,
        "admin": admin,
        "member": member,
        "outsider": outsider,
        "team": team,
    }


def _role(team, user):
    return TeamMember.query.filter_by(team_id=team.id, user_id=user.id).one().role


# --------------------------------------------------------------------------- #
#  Ownership transfer                                                          #
# --------------------------------------------------------------------------- #


def test_owner_transfers_ownership_and_becomes_admin(client, org):
    team = org["team"]
    response = client.post(
        f"/admin/teams/{team.id}/transfer-ownership",
        json={"user_id": org["member"].id},
        headers=_headers(org["owner"]),
    )
    assert response.status_code == 200
    db.session.refresh(team)
    assert team.owner_id == org["member"].id
    assert _role(team, org["member"]) == TeamRole.OWNER
    assert _role(team, org["owner"]) == TeamRole.ADMIN
    log = AuditLog.query.filter_by(action="team.ownership_transferred").one()
    assert log.details["toUserId"] == org["member"].id


def test_only_owner_can_transfer_and_only_to_members(client, org):
    team = org["team"]
    response = client.post(
        f"/admin/teams/{team.id}/transfer-ownership",
        json={"user_id": org["member"].id},
        headers=_headers(org["admin"]),
    )
    assert response.status_code == 403
    response = client.post(
        f"/admin/teams/{team.id}/transfer-ownership",
        json={"user_id": org["outsider"].id},
        headers=_headers(org["owner"]),
    )
    assert response.status_code == 404


def test_role_change_still_refuses_owner(client, org):
    response = client.patch(
        f"/admin/teams/{org['team'].id}/members/{org['member'].id}",
        json={"role": "OWNER"},
        headers=_headers(org["owner"]),
    )
    assert response.status_code == 400


def test_superadmin_can_transfer_ownership(client, org):
    team = org["team"]
    response = client.post(
        f"/superadmin/clients/{team.id}/transfer-ownership",
        json={"user_id": org["admin"].id},
        headers=_headers(org["root"]),
    )
    assert response.status_code == 200
    assert response.get_json()["owner"]["id"] == org["admin"].id
    log = AuditLog.query.filter_by(action="team.ownership_transferred").one()
    assert log.details["viaPlatform"] is True


# --------------------------------------------------------------------------- #
#  DNS domain verification                                                     #
# --------------------------------------------------------------------------- #


def _txt_answer(*values):
    return [MagicMock(strings=[value.encode()]) for value in values]


def test_domain_verified_when_txt_record_matches(client, org):
    team = org["team"]
    client.patch(
        f"/admin/teams/{team.id}/settings",
        json={"email_domain": "acme.com"},
        headers=_headers(org["owner"]),
    )
    overview = client.get(
        f"/admin/teams/{team.id}/overview", headers=_headers(org["owner"])
    ).get_json()
    record = overview["team"]["domainVerificationRecord"]
    assert record["host"] == "_vivexy-verification.acme.com"

    with patch(
        "agents_core.business_logic.org_policy.dns.resolver.resolve",
        return_value=_txt_answer("unrelated", record["value"]),
    ) as resolve:
        response = client.post(
            f"/admin/teams/{team.id}/domain/verify", headers=_headers(org["owner"])
        )
    assert response.status_code == 200
    assert resolve.call_args.args[:2] == (record["host"], "TXT")
    db.session.refresh(team)
    assert team.domain_verified is True
    assert AuditLog.query.filter_by(action="team.domain_verified").count() == 1


def test_domain_not_verified_without_record(client, org):
    import dns.resolver

    team = org["team"]
    team.email_domain = "acme.com"
    db.session.commit()
    with patch(
        "agents_core.business_logic.org_policy.dns.resolver.resolve",
        side_effect=dns.resolver.NXDOMAIN,
    ):
        response = client.post(
            f"/admin/teams/{team.id}/domain/verify", headers=_headers(org["owner"])
        )
    assert response.status_code == 400
    assert "No matching TXT record" in response.get_json()["error"]
    db.session.refresh(team)
    assert team.domain_verified is False
    assert team.domain_verification_token


def test_changing_domain_resets_token_and_verification(client, org):
    team = org["team"]
    team.email_domain = "acme.com"
    team.domain_verified = True
    team.domain_verification_token = "old-token"
    db.session.commit()
    client.patch(
        f"/admin/teams/{team.id}/settings",
        json={"email_domain": "acme.io"},
        headers=_headers(org["owner"]),
    )
    db.session.refresh(team)
    assert team.domain_verified is False
    assert team.domain_verification_token != "old-token"


# --------------------------------------------------------------------------- #
#  Feature flags                                                               #
# --------------------------------------------------------------------------- #


def _disable(team, *flags):
    team.feature_flags = {flag: False for flag in flags}
    db.session.commit()


def test_disabled_flag_blocks_routes_for_members(client, org):
    _disable(org["team"], "scheduled-tasks", "api-keys", "rag")
    headers = _headers(org["member"])

    response = client.post(
        "/scheduled-tasks", json={"name": "n", "prompt": "p"}, headers=headers
    )
    assert response.status_code == 403
    assert response.get_json()["code"] == "feature_disabled"
    assert (
        client.put(
            "/users/me/api-keys/openai", json={"api_key": "sk-x"}, headers=headers
        ).status_code
        == 403
    )
    assert client.post("/api/rag", headers=headers).status_code == 403
    # Listing and cleanup stay available.
    assert client.get("/scheduled-tasks", headers=headers).status_code == 200


def test_flags_do_not_affect_people_outside_the_team(client, org):
    _disable(org["team"], "scheduled-tasks")
    response = client.post(
        "/scheduled-tasks",
        json={"name": "n", "prompt": "p", "schedule_type": "once"},
        headers=_headers(org["outsider"]),
    )
    assert response.status_code == 201


def test_rag_requires_authentication(client, org):
    assert client.post("/api/rag").status_code == 401


def test_my_features_reports_effective_flags(client, org):
    _disable(org["team"], "connectors")
    features = client.get(
        "/users/me/features", headers=_headers(org["member"])
    ).get_json()["features"]
    assert features["connectors"] is False
    assert features["github"] is True


def test_disabled_api_keys_are_not_used_by_the_agent(app, org):
    from agents_core.business_logic.api_keys import get_decrypted_api_keys

    db.session.add(
        UserApiKey(user_id=org["member"].id, provider="openai", encrypted_key="x")
    )
    db.session.commit()
    _disable(org["team"], "api-keys")
    with patch(
        "agents_core.business_logic.api_keys.decrypt_api_key", return_value="sk"
    ):
        assert get_decrypted_api_keys(org["member"].id) == {}


# --------------------------------------------------------------------------- #
#  Scheduled tasks billed to a team                                            #
# --------------------------------------------------------------------------- #


def test_task_team_must_be_one_of_yours(client, org):
    response = client.post(
        "/scheduled-tasks",
        json={"name": "n", "prompt": "p", "team_id": org["team"].id},
        headers=_headers(org["outsider"]),
    )
    assert response.status_code == 403
    response = client.post(
        "/scheduled-tasks",
        json={"name": "n", "prompt": "p", "team_id": org["team"].id},
        headers=_headers(org["member"]),
    )
    assert response.status_code == 201
    assert response.get_json()["team_id"] == org["team"].id


def _task(user, team=None):
    task = ScheduledTask(
        user_id=user.id, team_id=team.id if team else None, name="t", prompt="hi"
    )
    db.session.add(task)
    db.session.commit()
    return task


def test_scheduled_run_chat_is_billed_to_the_task_team(app, org):
    from agents_core.worker.scheduled_task_runner import run_scheduled_task

    task = _task(org["member"], org["team"])
    with patch(
        "agents_core.business_logic.streaming.run_agent_stream", return_value=iter(())
    ):
        run_scheduled_task(task.id)

    run = ScheduledTaskRun.query.filter_by(task_id=task.id).one()
    assert run.status == "completed"
    assert db.session.get(Chat, run.chat_id).team_id == org["team"].id


def test_scheduled_run_refused_when_team_policy_blocks(app, org):
    from agents_core.worker.scheduled_task_runner import run_scheduled_task

    task = _task(org["member"], org["team"])
    org["team"].is_suspended = True
    db.session.commit()
    with patch("agents_core.business_logic.streaming.run_agent_stream") as stream:
        run_scheduled_task(task.id)
    stream.assert_not_called()

    run = ScheduledTaskRun.query.filter_by(task_id=task.id).one()
    assert run.status == "failed"
    assert run.chat_id is None
    assert "suspended" in run.error
    assert Chat.query.count() == 0


def test_scheduled_run_refused_when_feature_disabled(app, org):
    from agents_core.worker.scheduled_task_runner import run_scheduled_task

    task = _task(org["member"])
    _disable(org["team"], "scheduled-tasks")
    run_scheduled_task(task.id)
    run = ScheduledTaskRun.query.filter_by(task_id=task.id).one()
    assert run.status == "failed"
    assert "turned off" in run.error


# --------------------------------------------------------------------------- #
#  Chat deletion                                                               #
# --------------------------------------------------------------------------- #


def test_delete_chat_removes_messages_files_and_agent_state(client, org):
    user = org["member"]
    chat = Chat(user_id=user.id)
    db.session.add(chat)
    db.session.flush()
    db.session.add(Message(chat_id=chat.id, role=MessageRole.USER, content="hi"))
    db.session.commit()
    chat_id = chat.id

    checkpointer = MagicMock()
    with patch("agents_core.business_logic.data_lifecycle.S3Service") as storage, patch(
        "agents_core.agents.agent_factory.get_global_checkpointer",
        return_value=checkpointer,
    ):
        response = client.delete(f"/chat/{chat_id}", headers=_headers(user))

    assert response.status_code == 200
    assert db.session.get(Chat, chat_id) is None
    assert Message.query.filter_by(chat_id=chat_id).count() == 0
    storage.return_value.delete_chat_files.assert_called_once_with(chat_id)
    checkpointer.delete_thread.assert_called_once_with(chat_id)


def test_delete_chat_of_another_user_is_404(client, org):
    chat = Chat(user_id=org["owner"].id)
    db.session.add(chat)
    db.session.commit()
    response = client.delete(f"/chat/{chat.id}", headers=_headers(org["member"]))
    assert response.status_code == 404
    assert db.session.get(Chat, chat.id) is not None
