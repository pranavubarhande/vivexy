from unittest.mock import patch

import pytest
from flask import Flask

from agents_core.business_logic.team_policy import (
    check_chat_policy,
    maybe_send_budget_alerts,
    resolve_chat_team,
)
from agents_core.models import Chat, Team, TeamMember, TeamRole, TokenUsage, User, db


@pytest.fixture
def setup():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    db.init_app(app)
    with app.app_context():
        db.create_all()
        owner = User(email="owner@acme.com")
        outsider = User(email="out@other.com")
        db.session.add_all([owner, outsider])
        db.session.flush()
        team = Team(
            name="Acme", slug="acme", owner_id=owner.id, monthly_budget_usd=10.0
        )
        db.session.add(team)
        db.session.flush()
        db.session.add(
            TeamMember(user_id=owner.id, team_id=team.id, role=TeamRole.OWNER)
        )
        chat = Chat(user_id=owner.id, team_id=team.id)
        db.session.add(chat)
        db.session.commit()
        yield {"owner": owner, "outsider": outsider, "team": team, "chat": chat}


def _spend(setup, amount):
    db.session.add(
        TokenUsage(
            user_id=setup["owner"].id,
            team_id=setup["team"].id,
            total_cost_usd=amount,
        )
    )
    db.session.commit()


def test_only_members_can_attribute_chats(setup):
    assert resolve_chat_team(setup["team"].id, setup["owner"]) == setup["team"].id
    assert resolve_chat_team(None, setup["outsider"]) is None
    with pytest.raises(PermissionError):
        resolve_chat_team(setup["team"].id, setup["outsider"])


def test_suspended_team_blocks_new_chats(setup):
    setup["team"].is_suspended = True
    db.session.commit()
    with pytest.raises(PermissionError):
        resolve_chat_team(setup["team"].id, setup["owner"])
    with pytest.raises(PermissionError):
        check_chat_policy(setup["chat"], None)


def test_model_allowlist(setup):
    setup["team"].allowed_model_ids = ["model-a"]
    db.session.commit()
    assert check_chat_policy(setup["chat"], "model-a") == {"warnings": []}
    with pytest.raises(PermissionError):
        check_chat_policy(setup["chat"], "model-b")


def test_budget_warn_then_block(setup):
    _spend(setup, 12.0)
    assert check_chat_policy(setup["chat"], None)["warnings"]
    setup["team"].budget_enforcement = "block"
    db.session.commit()
    with pytest.raises(PermissionError):
        check_chat_policy(setup["chat"], None)


def test_personal_chats_ignore_team_policy(setup):
    _spend(setup, 50.0)
    setup["team"].budget_enforcement = "block"
    personal_chat = Chat(user_id=setup["owner"].id)
    db.session.add(personal_chat)
    db.session.commit()
    assert check_chat_policy(personal_chat, None) == {"warnings": []}


@patch("agents_core.business_logic.team_policy.send_budget_alert_email")
def test_budget_alerts_fire_once_per_threshold(mock_send, setup):
    team_id = setup["team"].id
    _spend(setup, 5.0)
    assert maybe_send_budget_alerts(team_id) is None
    _spend(setup, 3.5)
    assert maybe_send_budget_alerts(team_id) == 80
    assert maybe_send_budget_alerts(team_id) is None
    _spend(setup, 2.0)
    assert maybe_send_budget_alerts(team_id) == 100
    assert mock_send.call_count == 2
    assert mock_send.call_args[0][0] == ["owner@acme.com"]
