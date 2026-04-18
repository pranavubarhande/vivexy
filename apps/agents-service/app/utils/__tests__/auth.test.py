from unittest.mock import patch

import pytest

from app.utils.auth import hash_password, verify_password


def test_hash_and_verify_password():
    password = "MySecurePassword123"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


@patch("app.utils.auth.jwt")
def test_generate_token(mock_jwt):
    from app import create_app
    from app.utils.auth import generate_token

    app = create_app()
    mock_jwt.encode.return_value = "mockeded_token"

    with app.app_context():
        token = generate_token("user-1", "test@test.com")
        assert token == "mockeded_token"
        mock_jwt.encode.assert_called_once()
