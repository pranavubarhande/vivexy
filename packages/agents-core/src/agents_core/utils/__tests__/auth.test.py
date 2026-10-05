from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from agents_core.models import db
from agents_core.utils.auth import hash_password, verify_password


def test_hash_and_verify_password():
    password = "MySecurePassword123"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


@patch("agents_core.utils.auth.jwt")
def test_generate_token(mock_jwt):
    from agents_core.utils.auth import generate_token

    app = Flask(__name__)
    app.config["JWT_SECRET_KEY"] = "test-secret"
    mock_jwt.encode.return_value = "mockeded_token"

    with app.app_context():
        token = generate_token("user-1", "test@test.com")
        assert token == "mockeded_token"
        mock_jwt.encode.assert_called_once()


def test_authenticate_user_with_null_password_returns_none_not_crash():
    """SSO-only accounts have password=None — authenticating against them
    with a password attempt must fail cleanly, not raise AttributeError."""
    from unittest.mock import MagicMock

    from agents_core.utils.auth import authenticate_user

    sso_user = MagicMock()
    sso_user.password = None

    with patch("agents_core.utils.auth.User") as mock_user_model:
        mock_user_model.query.filter_by.return_value.first.return_value = sso_user
        result = authenticate_user("sso-user@example.com", "any-password")

    assert result is None


@patch("agents_core.utils.auth._get_redis")
def test_create_and_consume_email_verification_token(mock_get_redis):
    from agents_core.utils.auth import (
        consume_email_verification_token,
        create_email_verification_token,
    )

    store = {}
    mock_redis = MagicMock()
    mock_redis.setex.side_effect = lambda key, ttl, value: store.__setitem__(key, value)
    mock_redis.getdel.side_effect = lambda key: store.pop(key, None)
    mock_get_redis.return_value = mock_redis

    token = create_email_verification_token("user-1")
    assert isinstance(token, str) and len(token) > 10

    user_id = consume_email_verification_token(token)
    assert user_id == "user-1"

    # Single-use: consuming again returns None.
    assert consume_email_verification_token(token) is None


@patch("agents_core.utils.auth._get_redis")
def test_consume_email_verification_token_invalid(mock_get_redis):
    from agents_core.utils.auth import consume_email_verification_token

    mock_redis = MagicMock()
    mock_redis.getdel.return_value = None
    mock_get_redis.return_value = mock_redis

    assert consume_email_verification_token("not-a-real-token") is None


@patch("agents_core.utils.auth._get_redis")
def test_resend_cooldown(mock_get_redis):
    from agents_core.utils.auth import is_resend_on_cooldown, set_resend_cooldown

    mock_redis = MagicMock()
    mock_redis.exists.return_value = 0
    mock_get_redis.return_value = mock_redis

    assert is_resend_on_cooldown("user-1") is False

    set_resend_cooldown("user-1")
    mock_redis.setex.assert_called_once()

    mock_redis.exists.return_value = 1
    assert is_resend_on_cooldown("user-1") is True


@patch("agents_core.utils.auth._get_redis")
def test_create_and_consume_oauth_exchange_code(mock_get_redis):
    from agents_core.utils.auth import (
        consume_oauth_exchange_code,
        create_oauth_exchange_code,
    )

    store = {}
    mock_redis = MagicMock()
    mock_redis.setex.side_effect = lambda key, ttl, value: store.__setitem__(key, value)
    mock_redis.getdel.side_effect = lambda key: store.pop(key, None)
    mock_get_redis.return_value = mock_redis

    code = create_oauth_exchange_code("fake.jwt.token")
    assert isinstance(code, str) and len(code) > 10

    jwt_token = consume_oauth_exchange_code(code)
    assert jwt_token == "fake.jwt.token"

    # Single-use.
    assert consume_oauth_exchange_code(code) is None


@patch("agents_core.utils.auth._get_redis")
def test_token_helpers_raise_when_redis_unavailable(mock_get_redis):
    from agents_core.utils.auth import create_email_verification_token

    mock_get_redis.return_value = None

    with pytest.raises(RuntimeError, match="Redis unavailable"):
        create_email_verification_token("user-1")


@pytest.fixture
def app_with_db():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app


def test_find_or_create_oauth_user_creates_new_user(app_with_db):
    from agents_core.utils.auth import find_or_create_oauth_user

    with app_with_db.app_context():
        user = find_or_create_oauth_user(
            provider="google",
            subject_id="google-sub-123",
            email="new@example.com",
            name="New User",
        )

        assert user.email == "new@example.com"
        assert user.oauth_provider == "google"
        assert user.oauth_subject_id == "google-sub-123"
        assert user.email_verified is True
        assert user.password is None


def test_find_or_create_oauth_user_returns_existing_by_provider_and_subject(
    app_with_db,
):
    from agents_core.utils.auth import find_or_create_oauth_user

    with app_with_db.app_context():
        first = find_or_create_oauth_user(
            provider="google",
            subject_id="google-sub-123",
            email="same@example.com",
            name="Same User",
        )
        second = find_or_create_oauth_user(
            provider="google",
            subject_id="google-sub-123",
            email="same@example.com",
            name="Same User",
        )

        assert first.id == second.id


def test_find_or_create_oauth_user_auto_links_by_email(app_with_db):
    from agents_core.utils.auth import create_user, find_or_create_oauth_user
    from agents_core.schemas import UserCreate

    with app_with_db.app_context():
        password_user = create_user(
            UserCreate(name="Existing", email="existing@example.com", password="pw123456")
        )
        assert password_user.email_verified is False

        linked_user = find_or_create_oauth_user(
            provider="microsoft",
            subject_id="ms-sub-456",
            email="existing@example.com",
            name="Existing",
        )

        assert linked_user.id == password_user.id
        assert linked_user.oauth_provider == "microsoft"
        assert linked_user.oauth_subject_id == "ms-sub-456"
        assert linked_user.email_verified is True
