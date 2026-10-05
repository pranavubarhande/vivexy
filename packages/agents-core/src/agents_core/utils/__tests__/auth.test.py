from unittest.mock import patch

import pytest
from flask import Flask

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
