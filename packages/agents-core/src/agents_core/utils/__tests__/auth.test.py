from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from sqlalchemy.exc import IntegrityError

from agents_core.models import User, db
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

    code = create_oauth_exchange_code("fake.jwt.token", "nonce-abc")
    assert isinstance(code, str) and len(code) > 10

    jwt_token = consume_oauth_exchange_code(code, "nonce-abc")
    assert jwt_token == "fake.jwt.token"

    # Single-use.
    assert consume_oauth_exchange_code(code, "nonce-abc") is None


@patch("agents_core.utils.auth._get_redis")
def test_consume_oauth_exchange_code_rejects_state_mismatch(mock_get_redis):
    from agents_core.utils.auth import (
        consume_oauth_exchange_code,
        create_oauth_exchange_code,
    )

    store = {}
    mock_redis = MagicMock()
    mock_redis.setex.side_effect = lambda key, ttl, value: store.__setitem__(key, value)
    mock_redis.getdel.side_effect = lambda key: store.pop(key, None)
    mock_get_redis.return_value = mock_redis

    code = create_oauth_exchange_code("fake.jwt.token", "real-nonce")

    # Wrong state -- must be rejected even though the code itself is valid
    # and unexpired. This is the core protection against OAuth login CSRF:
    # a bare correct code is not sufficient to redeem a session.
    assert consume_oauth_exchange_code(code, "attacker-guessed-nonce") is None

    # The mismatch attempt must still have consumed the code (GETDEL ran
    # unconditionally before the state check) -- a correct retry afterward
    # must also fail, not succeed on a second try.
    assert consume_oauth_exchange_code(code, "real-nonce") is None


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


def test_find_or_create_oauth_user_handles_race_on_new_user(app_with_db):
    """Two near-simultaneous callbacks for the same brand-new user can
    both pass the lookups before either commits (e.g. a double-click or a
    retried OAuth redirect). users.email has a DB-level unique
    constraint, so the loser's INSERT raises IntegrityError instead of
    silently creating a duplicate row — this must recover and return the
    winner's row, not propagate the error."""
    from agents_core.utils.auth import find_or_create_oauth_user

    with app_with_db.app_context():
        winner = User(
            email="race@example.com",
            name="Race User",
            password=None,
            oauth_provider="google",
            oauth_subject_id="google-sub-race",
            email_verified=True,
        )
        db.session.add(winner)
        db.session.commit()
        winner_id = winner.id

        empty_result = MagicMock()
        empty_result.first.return_value = None
        winner_result = MagicMock()
        winner_result.first.return_value = winner

        mock_query = MagicMock()
        mock_query.filter_by.side_effect = [
            empty_result,  # (provider, subject_id) lookup -- miss
            empty_result,  # email lookup -- miss (race: as seen from this call)
            winner_result,  # recovery lookup after IntegrityError -- hit
        ]

        with (
            patch("agents_core.utils.auth.User.query", mock_query),
            patch(
                "agents_core.utils.auth.db.session.commit",
                side_effect=IntegrityError("duplicate email", None, None),
            ),
        ):
            result = find_or_create_oauth_user(
                provider="microsoft",
                subject_id="ms-sub-race",
                email="race@example.com",
                name="Race User",
            )

        assert result.id == winner_id
