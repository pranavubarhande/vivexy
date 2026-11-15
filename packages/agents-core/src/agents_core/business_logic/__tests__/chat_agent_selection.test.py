import pytest
from flask import Flask

import agents_core.business_logic.chat as chat_module
from agents_core.business_logic.chat import create_agent_response
from agents_core.models import Chat, User, db


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


class FakeAgent:
    async def stream_simple(self, messages, checkpoint):
        return
        yield  # pragma: no cover - makes this an async generator


def _patch_create_langgraph_agent(monkeypatch, captured):
    def fake(agent_id, provider, model_id, chat_id, user_id=None):
        captured["agent_id"] = agent_id
        return FakeAgent()

    monkeypatch.setattr(chat_module, "create_langgraph_agent", fake)


def test_response_uses_the_chats_own_agent_not_the_product_default(app, monkeypatch):
    user = User(email="lawyer@firm.com", email_verified=True)
    db.session.add(user)
    db.session.flush()
    chat = Chat(user_id=user.id, agent_id="clause-drafting")
    db.session.add(chat)
    db.session.commit()

    captured = {}
    _patch_create_langgraph_agent(monkeypatch, captured)

    create_agent_response(
        chat.id,
        [{"role": "user", "content": "hi"}],
        "google",
        "gemini-2.5-flash",
        user.id,
    )

    assert captured["agent_id"] == "clause-drafting"


def test_response_falls_back_to_the_default_agent_for_a_chat_with_none(
    app, monkeypatch
):
    user = User(email="lawyer2@firm.com", email_verified=True)
    db.session.add(user)
    db.session.flush()
    chat = Chat(user_id=user.id)
    db.session.add(chat)
    db.session.commit()

    captured = {}
    _patch_create_langgraph_agent(monkeypatch, captured)

    create_agent_response(
        chat.id,
        [{"role": "user", "content": "hi"}],
        "google",
        "gemini-2.5-flash",
        user.id,
    )

    assert captured["agent_id"]
