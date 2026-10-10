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
    app.config["BACKEND_URL"] = "http://localhost:5000"
    app.config["GOOGLE_CLIENT_ID"] = "test-google-client-id"
    app.config["MICROSOFT_CLIENT_ID"] = "test-microsoft-client-id"
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


@patch("agents_core.routes.auth.send_verification_email")
def test_resend_verification_already_verified(mock_send, app, client):
    register_response = client.post(
        "/auth/register",
        json={"name": "Ada", "email": "ada@example.com", "password": "securepass123"},
    )
    token = register_response.get_json()["token"]
    with app.app_context():
        user = User.query.filter_by(email="ada@example.com").first()
        user.email_verified = True
        db.session.commit()

    response = client.post(
        "/auth/resend-verification", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "Email is already verified"


@patch("agents_core.routes.auth.send_verification_email")
def test_resend_verification_does_not_set_cooldown_when_send_fails(
    mock_send, client
):
    register_response = client.post(
        "/auth/register",
        json={"name": "Ada", "email": "ada@example.com", "password": "securepass123"},
    )
    token = register_response.get_json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    mock_send.side_effect = RuntimeError("Resend is down")
    response = client.post("/auth/resend-verification", headers=headers)
    assert response.status_code == 502

    # Cooldown must NOT have been set — a failed send shouldn't lock the
    # user out of retrying.
    mock_send.side_effect = None
    retry = client.post("/auth/resend-verification", headers=headers)
    assert retry.status_code == 200


@patch("agents_core.utils.auth._get_redis")
def test_verify_email_returns_503_when_redis_unavailable(mock_get_redis, client):
    mock_get_redis.return_value = None

    response = client.post("/auth/verify-email", json={"token": "some-token"})

    assert response.status_code == 503


@patch("agents_core.utils.auth._get_redis")
@patch("agents_core.routes.auth.send_verification_email")
def test_resend_verification_returns_503_when_redis_unavailable(
    mock_send, mock_get_redis, client
):
    # mock_get_redis's default return value is a MagicMock (truthy), so
    # register()'s own Redis calls (token creation) succeed harmlessly
    # here; only the explicit override below, right before the actual
    # resend-verification call, simulates Redis being down.
    register_response = client.post(
        "/auth/register",
        json={"name": "Ada", "email": "ada@example.com", "password": "securepass123"},
    )
    token = register_response.get_json()["token"]

    mock_get_redis.return_value = None
    response = client.post(
        "/auth/resend-verification", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 503


def test_oauth_login_unknown_provider_returns_404(client):
    response = client.get("/auth/oauth/facebook/login")
    assert response.status_code == 404


@patch("agents_core.routes.auth.oauth")
def test_oauth_login_redirects_to_provider(mock_oauth, client):
    mock_client = MagicMock()
    mock_client.authorize_redirect.return_value = "redirect-response"
    mock_oauth.create_client.return_value = mock_client

    client.get("/auth/oauth/google/login?state=frontend-nonce-123")

    mock_oauth.create_client.assert_called_once_with("google")
    mock_client.authorize_redirect.assert_called_once()
    called_redirect_uri = mock_client.authorize_redirect.call_args[0][0]
    assert called_redirect_uri.endswith("/auth/oauth/google/callback")
    assert mock_client.authorize_redirect.call_args[1]["state"] == "frontend-nonce-123"


def test_oauth_login_missing_state_returns_400(client):
    response = client.get("/auth/oauth/google/login")
    assert response.status_code == 400


@patch("agents_core.routes.auth.oauth")
def test_oauth_login_unconfigured_provider_returns_503(mock_oauth, app, client):
    """A provider can be in ALLOWED_OAUTH_PROVIDERS before its real
    client_id/secret are set (e.g. mid-rollout) — Authlib itself doesn't
    validate client_id, so without this guard the user would be silently
    redirected into the real provider's own confusing error page."""
    with app.app_context():
        app.config["MICROSOFT_CLIENT_ID"] = None

    response = client.get("/auth/oauth/microsoft/login")

    assert response.status_code == 503
    mock_oauth.create_client.assert_not_called()


def test_oauth_callback_unknown_provider_returns_404(client):
    response = client.get("/auth/oauth/facebook/callback")
    assert response.status_code == 404


@patch("agents_core.routes.auth.oauth")
def test_oauth_callback_creates_user_and_redirects_with_code(mock_oauth, app, client):
    mock_client = MagicMock()
    mock_client.authorize_access_token.return_value = {
        "userinfo": {
            "sub": "google-sub-123",
            "email": "new-sso-user@example.com",
            "name": "New SSO User",
        }
    }
    mock_oauth.create_client.return_value = mock_client

    response = client.get("/auth/oauth/google/callback?state=frontend-nonce-123")

    assert response.status_code == 302
    assert response.location.startswith("http://localhost:3000/auth/callback?code=")

    with app.app_context():
        user = User.query.filter_by(email="new-sso-user@example.com").first()
        assert user is not None
        assert user.oauth_provider == "google"
        assert user.email_verified is True


@patch("agents_core.routes.auth.oauth")
def test_oauth_callback_missing_state_redirects_to_login_with_error(mock_oauth, client):
    mock_client = MagicMock()
    mock_client.authorize_access_token.return_value = {
        "userinfo": {
            "sub": "google-sub-no-state",
            "email": "no-state@example.com",
            "name": "No State",
        }
    }
    mock_oauth.create_client.return_value = mock_client

    response = client.get("/auth/oauth/google/callback")

    assert response.status_code == 302
    assert response.location == "http://localhost:3000/login?error=oauth_failed"


@patch("agents_core.routes.auth.oauth")
def test_oauth_callback_failure_redirects_to_login_with_error(mock_oauth, client):
    mock_client = MagicMock()
    mock_client.authorize_access_token.side_effect = RuntimeError("provider denied")
    mock_oauth.create_client.return_value = mock_client

    response = client.get("/auth/oauth/google/callback?state=frontend-nonce-123")

    assert response.status_code == 302
    assert response.location == "http://localhost:3000/login?error=oauth_failed"


@patch("agents_core.routes.auth.oauth")
def test_oauth_exchange_returns_token_for_valid_code(mock_oauth, app, client):
    mock_client = MagicMock()
    mock_client.authorize_access_token.return_value = {
        "userinfo": {
            "sub": "google-sub-789",
            "email": "exchange-user@example.com",
            "name": "Exchange User",
        }
    }
    mock_oauth.create_client.return_value = mock_client

    callback_response = client.get(
        "/auth/oauth/google/callback?state=frontend-nonce-789"
    )
    code = callback_response.location.split("code=")[1]

    exchange_response = client.post(
        "/auth/oauth/exchange", json={"code": code, "state": "frontend-nonce-789"}
    )

    assert exchange_response.status_code == 200
    body = exchange_response.get_json()
    assert body["token"]
    assert body["user"]["email"] == "exchange-user@example.com"


@patch("agents_core.routes.auth.oauth")
def test_oauth_exchange_wrong_state_returns_400(mock_oauth, app, client):
    """The core protection against OAuth login CSRF: even a genuinely
    valid, unexpired code must be rejected if the caller doesn't present
    the exact nonce it was bound to -- proves a bare correct code alone
    isn't enough to redeem someone else's login."""
    mock_client = MagicMock()
    mock_client.authorize_access_token.return_value = {
        "userinfo": {
            "sub": "google-sub-csrf",
            "email": "csrf-target@example.com",
            "name": "CSRF Target",
        }
    }
    mock_oauth.create_client.return_value = mock_client

    callback_response = client.get(
        "/auth/oauth/google/callback?state=real-nonce-from-victim-browser"
    )
    code = callback_response.location.split("code=")[1]

    response = client.post(
        "/auth/oauth/exchange",
        json={"code": code, "state": "attacker-guessed-or-reused-nonce"},
    )

    assert response.status_code == 400


def test_oauth_exchange_missing_code_or_state_returns_400(client):
    response = client.post("/auth/oauth/exchange", json={"code": "some-code"})
    assert response.status_code == 400

    response = client.post("/auth/oauth/exchange", json={"state": "some-state"})
    assert response.status_code == 400


def test_oauth_exchange_non_string_state_returns_400_not_500(client):
    """A non-string state passes a bare truthiness check but would crash
    secrets.compare_digest downstream -- must be rejected cleanly here."""
    response = client.post(
        "/auth/oauth/exchange", json={"code": "some-code", "state": 12345}
    )
    assert response.status_code == 400

    response = client.post(
        "/auth/oauth/exchange", json={"code": "some-code", "state": ["a", "b"]}
    )
    assert response.status_code == 400


def test_oauth_exchange_invalid_code_returns_400(client):
    response = client.post(
        "/auth/oauth/exchange", json={"code": "not-a-real-code", "state": "whatever"}
    )
    assert response.status_code == 400


def test_oauth_exchange_code_is_single_use(app, client):
    with patch("agents_core.routes.auth.oauth") as mock_oauth:
        mock_client = MagicMock()
        mock_client.authorize_access_token.return_value = {
            "userinfo": {
                "sub": "google-sub-999",
                "email": "single-use@example.com",
                "name": "Single Use",
            }
        }
        mock_oauth.create_client.return_value = mock_client
        callback_response = client.get(
            "/auth/oauth/google/callback?state=frontend-nonce-999"
        )
        code = callback_response.location.split("code=")[1]

    first = client.post(
        "/auth/oauth/exchange", json={"code": code, "state": "frontend-nonce-999"}
    )
    assert first.status_code == 200

    second = client.post(
        "/auth/oauth/exchange", json={"code": code, "state": "frontend-nonce-999"}
    )
    assert second.status_code == 400
