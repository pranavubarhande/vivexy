from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from agents_core.models import User, db
from agents_core.routes.auth import bp as auth_bp


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["JWT_SECRET_KEY"] = "test-secret"
    app.config["FRONTEND_URL"] = "http://localhost:3000"
    app.register_blueprint(auth_bp)
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app


@pytest.fixture
def client(app):
    return app.test_client()


@patch("agents_core.routes.auth.send_verification_email")
def test_register_sends_verification_email_and_succeeds_even_if_send_fails(
    mock_send, client
):
    mock_send.side_effect = RuntimeError("Resend is down")

    response = client.post(
        "/auth/register",
        json={"name": "Ada", "email": "ada@example.com", "password": "securepass123"},
    )

    assert response.status_code == 201
    assert response.get_json()["token"]
    mock_send.assert_called_once()


@patch("agents_core.routes.auth.send_verification_email")
def test_verify_email_valid_token(mock_send, app, client):
    client.post(
        "/auth/register",
        json={"name": "Ada", "email": "ada@example.com", "password": "securepass123"},
    )
    with app.app_context():
        user = User.query.filter_by(email="ada@example.com").first()
        assert user.email_verified is False

    sent_url = mock_send.call_args[0][1]
    token = sent_url.split("token=")[1]

    response = client.post("/auth/verify-email", json={"token": token})
    assert response.status_code == 200

    with app.app_context():
        user = User.query.filter_by(email="ada@example.com").first()
        assert user.email_verified is True


def test_verify_email_invalid_token(client):
    response = client.post("/auth/verify-email", json={"token": "not-a-real-token"})
    assert response.status_code == 400


@patch("agents_core.routes.auth.send_verification_email")
def test_resend_verification_rate_limited(mock_send, client):
    register_response = client.post(
        "/auth/register",
        json={"name": "Ada", "email": "ada@example.com", "password": "securepass123"},
    )
    token = register_response.get_json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    first = client.post("/auth/resend-verification", headers=headers)
    assert first.status_code == 200
    assert mock_send.call_count == 2  # register + resend

    second = client.post("/auth/resend-verification", headers=headers)
    assert second.status_code == 429
    assert mock_send.call_count == 2  # not called again
