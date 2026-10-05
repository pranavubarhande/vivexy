# SSO + Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google/Microsoft SSO login and email verification for password-based registration to vivexy's existing homegrown JWT auth system, without touching the existing `/auth/login`, `/auth/register` (core behavior), or `/auth/me` contracts.

**Architecture:** Backend additions live in `packages/agents-core/src/agents_core` (routes/auth.py, utils/auth.py, new utils/email.py and utils/oauth.py, models/user.py, schemas/user.py) plus one Alembic migration. Short-lived tokens (email verification, OAuth exchange codes, resend cooldowns) are stored in Redis, not Postgres — this app already depends on Redis everywhere else. Frontend additions live in `packages/core` (service/hook/component layer) and `apps/frontend` (two new routes). OAuth uses Authlib's Flask client against Google and Microsoft's OIDC discovery documents; the backend never puts a live JWT in a redirect URL — it hands the frontend a one-time exchange code instead.

**Tech Stack:** Flask, SQLAlchemy, Alembic, Authlib (new), Resend Python SDK (new), Redis, Next.js App Router, React Query, axios, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-10-05-sso-email-verification-design.md`

---

## Task 1: Data model — migration, User model, response schema

**Files:**
- Create: `apps/agents-service/alembic/versions/b2c3d4e5f6a8_add_sso_and_verification_fields.py`
- Modify: `packages/agents-core/src/agents_core/models/user.py`
- Modify: `packages/agents-core/src/agents_core/schemas/user.py`
- Modify: `packages/agents-core/src/agents_core/utils/auth.py` (`exclude_password`)

- [x] **Step 1: Write the migration**

The current head is `a1b2c3d4e5f7` (confirmed via `uv run alembic heads` in `apps/agents-service`). Create:

```python
"""add sso and email verification fields to users

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-10-05 00:00:00.000000+00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a8"
down_revision: Union[str, None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SSO-only users have no password.
    op.alter_column("users", "password", existing_type=sa.String(), nullable=True)
    # server_default=false() is required here, not optional: this is a NOT
    # NULL column being added to a table that already has rows, and every
    # existing row needs a value or the ALTER fails.
    op.add_column(
        "users",
        sa.Column(
            "email_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column("users", sa.Column("oauth_provider", sa.String(), nullable=True))
    op.add_column("users", sa.Column("oauth_subject_id", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "oauth_subject_id")
    op.drop_column("users", "oauth_provider")
    op.drop_column("users", "email_verified")
    op.alter_column("users", "password", existing_type=sa.String(), nullable=False)
```

- [x] **Step 2: Run the migration against your local DB**

Run (from `apps/agents-service`): `uv run alembic upgrade head`
Expected: no errors; last line mentions revision `b2c3d4e5f6a8`.

Verify the columns landed:

Run: `psql "$DATABASE_URL" -c "\d users"` (or `psql postgresql://postgres:pranav@localhost:5432/vivexy -c "\d users"` if `DATABASE_URL` isn't exported in your shell)
Expected: `password` listed without "not null"; `email_verified`, `oauth_provider`, `oauth_subject_id` present.

- [x] **Step 3: Update the User model to match**

Edit `packages/agents-core/src/agents_core/models/user.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import Enum as SQLEnum

from agents_core.models.base import db
from agents_core.models.enums import Role


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String, unique=True, nullable=False)
    name = db.Column(db.String)
    password = db.Column(db.String, nullable=True)
    role = db.Column(SQLEnum(Role), default=Role.USER)
    avatar = db.Column(db.String)
    email_verified = db.Column(db.Boolean, default=False, nullable=False)
    oauth_provider = db.Column(db.String, nullable=True)
    oauth_subject_id = db.Column(db.String, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relations
    owned_teams = db.relationship(
        "Team", backref="owner", lazy=True, foreign_keys="Team.owner_id"
    )
    team_memberships = db.relationship("TeamMember", backref="user", lazy=True)
    subscriptions = db.relationship("Subscription", backref="user", lazy=True)
    invoices = db.relationship("Invoice", backref="user", lazy=True)
    jobs = db.relationship("Job", backref="user", lazy=True)
    chats = db.relationship("Chat", backref="user", lazy=True)
    skills = db.relationship("UserSkill", backref="user", lazy=True)
```

(Only `password` nullability and the three new columns changed vs. the original.)

- [x] **Step 4: Add `email_verified` to the response schema**

Edit `packages/agents-core/src/agents_core/schemas/user.py` — add the field to `UserResponse` only (not `UserBase`, so it can never be accepted as register input):

```python
class UserResponse(UserBase):
    id: str
    email_verified: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        validate_by_name = True

    def dict(self, **kwargs):
        data = super().dict(**kwargs)
        return {
            "id": data["id"],
            "email": data["email"],
            "name": data.get("name"),
            "role": (
                data["role"].value if hasattr(data["role"], "value") else data["role"]
            ),
            "avatar": data.get("avatar"),
            "emailVerified": data.get("email_verified", False),
            "createdAt": (
                data["created_at"].isoformat() if data.get("created_at") else None
            ),
            "updatedAt": (
                data["updated_at"].isoformat() if data.get("updated_at") else None
            ),
        }
```

- [x] **Step 5: Add `emailVerified` to `exclude_password`**

Edit `packages/agents-core/src/agents_core/utils/auth.py`:

```python
def exclude_password(user: User) -> dict:
    """Return user data without password."""
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role.value,
        "avatar": user.avatar,
        "emailVerified": user.email_verified,
        "createdAt": user.created_at.isoformat() if user.created_at else None,
        "updatedAt": user.updated_at.isoformat() if user.updated_at else None,
    }
```

- [x] **Step 6: Run the existing auth test suite to confirm nothing broke**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest src/agents_core/utils/__tests__/auth.test.py src/agents_core/middlewares/__tests__/auth_middleware.test.py -v`
Expected: all existing tests still PASS.

- [x] **Step 7: Commit**

```bash
git add apps/agents-service/alembic/versions/b2c3d4e5f6a8_add_sso_and_verification_fields.py \
        packages/agents-core/src/agents_core/models/user.py \
        packages/agents-core/src/agents_core/schemas/user.py \
        packages/agents-core/src/agents_core/utils/auth.py
git commit -m "feat: add SSO and email-verification columns to User"
```

---

## Task 2: Config and dependencies

**Files:**
- Modify: `packages/agents-core/pyproject.toml`
- Modify: `apps/agents-service/configs/flask_config.py`
- Modify: `apps/agents-service/.env.example`

- [x] **Step 1: Add the new dependencies**

Edit `packages/agents-core/pyproject.toml`, in the `dependencies` list (anywhere alongside the other third-party deps, e.g. near `bcrypt`/`pyjwt`):

```toml
    "authlib>=1.3.2",
    "resend>=2.5.1",
```

- [x] **Step 2: Sync and verify both install cleanly**

Run (from repo root): `uv sync`
Expected: resolves and installs `authlib` and `resend` with no conflicts.

- [x] **Step 3: Add the new config values**

Edit `apps/agents-service/configs/flask_config.py` — add a new section after the existing `JWT` section:

```python
    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-jwt-secret-key")

    # SSO (Google / Microsoft OAuth2 via Authlib)
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
    MICROSOFT_CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID")
    MICROSOFT_CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET")
    # "common" accepts both work/school and personal Microsoft accounts.
    MICROSOFT_TENANT = os.getenv("MICROSOFT_TENANT", "common")

    # Email (Resend) — verification emails
    RESEND_API_KEY = os.getenv("RESEND_API_KEY")
    RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "Vivexy <noreply@vivexy.app>")

    # Used to build OAuth callback redirect_uris (BACKEND_URL) and links
    # that go out in emails / the final post-OAuth browser redirect
    # (FRONTEND_URL). Deliberately explicit env vars rather than inferring
    # from the request (e.g. via Flask's url_for(..., _external=True)) —
    # behind a proxy/ingress, scheme/host inference is easy to get wrong
    # and an OAuth redirect_uri mismatch just fails outright.
    BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
```

- [x] **Step 4: Add the new env vars to the example file**

Edit `apps/agents-service/.env.example`, appending near the other provider keys:

```bash
# SSO (Google / Microsoft)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
MICROSOFT_CLIENT_ID=""
MICROSOFT_CLIENT_SECRET=""
MICROSOFT_TENANT="common"

# Email (Resend) — verification emails
RESEND_API_KEY=""
RESEND_FROM_EMAIL="Vivexy <noreply@vivexy.app>"

# Used to build OAuth redirect URIs and email links
BACKEND_URL="http://localhost:5000"
FRONTEND_URL="http://localhost:3000"
```

- [x] **Step 5: Commit**

```bash
git add packages/agents-core/pyproject.toml apps/agents-service/configs/flask_config.py apps/agents-service/.env.example
git commit -m "feat: add SSO/email-verification config and dependencies"
```

> **Manual prerequisite (not code, flag to whoever deploys this):** registering OAuth apps in the Google Cloud Console and Microsoft Entra admin center, with each one's authorized redirect URI set to `{BACKEND_URL}/auth/oauth/google/callback` / `{BACKEND_URL}/auth/oauth/microsoft/callback` for every environment (local, staging, prod), is an external setup step outside this repo. It has to happen before Task 8's routes can be exercised against real providers.

---

## Task 3: Redis-backed token helpers

**Files:**
- Modify: `packages/agents-core/src/agents_core/utils/auth.py`
- Test: `packages/agents-core/src/agents_core/utils/__tests__/auth.test.py`

These three kinds of short-lived tokens (email verification, resend cooldown, OAuth exchange code) all follow the same shape: a Redis key with a TTL. This task adds the helpers; later tasks wire them into routes.

- [x] **Step 1: Write the failing tests**

Append to `packages/agents-core/src/agents_core/utils/__tests__/auth.test.py`:

```python
from unittest.mock import MagicMock, patch


@patch("agents_core.utils.auth._get_redis")
def test_create_and_consume_email_verification_token(mock_get_redis):
    from agents_core.utils.auth import (
        consume_email_verification_token,
        create_email_verification_token,
    )

    store = {}
    mock_redis = MagicMock()
    mock_redis.setex.side_effect = lambda key, ttl, value: store.__setitem__(key, value)
    mock_redis.get.side_effect = lambda key: store.get(key)
    mock_redis.delete.side_effect = lambda key: store.pop(key, None)
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
    mock_redis.get.return_value = None
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
    mock_redis.get.side_effect = lambda key: store.get(key)
    mock_redis.delete.side_effect = lambda key: store.pop(key, None)
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
```

Add `import pytest` to the top of the test file if it isn't already there (it is, from the existing tests — confirm, don't duplicate).

- [x] **Step 2: Run tests to verify they fail**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest src/agents_core/utils/__tests__/auth.test.py -v`
Expected: FAIL with `ImportError` / `AttributeError` — the functions don't exist yet.

- [x] **Step 3: Implement the helpers**

Add to `packages/agents-core/src/agents_core/utils/auth.py`, near the top (after the existing imports, before `hash_password`):

```python
import os
import secrets

import redis as redis_lib

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

EMAIL_VERIFY_PREFIX = "email_verify:"
EMAIL_VERIFY_TTL_SECONDS = 24 * 60 * 60  # 24h
RESEND_COOLDOWN_PREFIX = "resend_cooldown:"
RESEND_COOLDOWN_TTL_SECONDS = 60
OAUTH_EXCHANGE_PREFIX = "oauth_exchange:"
OAUTH_EXCHANGE_TTL_SECONDS = 60


def _get_redis():
    try:
        r = redis_lib.from_url(REDIS_URL, decode_responses=True)
        r.ping()
        return r
    except Exception:
        return None


def create_email_verification_token(user_id: str) -> str:
    """Generate a one-time email verification token (24h TTL)."""
    r = _get_redis()
    if not r:
        raise RuntimeError("Redis unavailable")
    token = secrets.token_urlsafe(32)
    r.setex(f"{EMAIL_VERIFY_PREFIX}{token}", EMAIL_VERIFY_TTL_SECONDS, user_id)
    return token


def consume_email_verification_token(token: str) -> str | None:
    """Look up and delete a verification token. Single-use: returns the
    user_id on first call, None on any call after (or if invalid/expired)."""
    r = _get_redis()
    if not r:
        raise RuntimeError("Redis unavailable")
    key = f"{EMAIL_VERIFY_PREFIX}{token}"
    user_id = r.get(key)
    if user_id is not None:
        r.delete(key)
    return user_id


def is_resend_on_cooldown(user_id: str) -> bool:
    r = _get_redis()
    if not r:
        raise RuntimeError("Redis unavailable")
    return r.exists(f"{RESEND_COOLDOWN_PREFIX}{user_id}") == 1


def set_resend_cooldown(user_id: str) -> None:
    r = _get_redis()
    if not r:
        raise RuntimeError("Redis unavailable")
    r.setex(f"{RESEND_COOLDOWN_PREFIX}{user_id}", RESEND_COOLDOWN_TTL_SECONDS, "1")


def create_oauth_exchange_code(jwt_token: str) -> str:
    """Store a freshly-issued JWT behind a one-time opaque code (60s TTL) so
    the OAuth callback's redirect never puts the real JWT in a URL."""
    r = _get_redis()
    if not r:
        raise RuntimeError("Redis unavailable")
    code = secrets.token_urlsafe(32)
    r.setex(f"{OAUTH_EXCHANGE_PREFIX}{code}", OAUTH_EXCHANGE_TTL_SECONDS, jwt_token)
    return code


def consume_oauth_exchange_code(code: str) -> str | None:
    """Single-use: returns the JWT on first call, None on any call after
    (or if invalid/expired)."""
    r = _get_redis()
    if not r:
        raise RuntimeError("Redis unavailable")
    key = f"{OAUTH_EXCHANGE_PREFIX}{code}"
    jwt_token = r.get(key)
    if jwt_token is not None:
        r.delete(key)
    return jwt_token
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest src/agents_core/utils/__tests__/auth.test.py -v`
Expected: all PASS, including the pre-existing `test_hash_and_verify_password` / `test_generate_token`.

- [x] **Step 5: Commit**

```bash
git add packages/agents-core/src/agents_core/utils/auth.py packages/agents-core/src/agents_core/utils/__tests__/auth.test.py
git commit -m "feat: add Redis-backed token helpers for verification and OAuth exchange"
```

---

## Task 4: Resend email utility

**Files:**
- Create: `packages/agents-core/src/agents_core/utils/email.py`
- Test: `packages/agents-core/src/agents_core/utils/__tests__/email.test.py`

- [x] **Step 1: Write the failing test**

```python
from unittest.mock import MagicMock, patch


@patch("agents_core.utils.email.resend")
def test_send_verification_email(mock_resend, monkeypatch):
    from agents_core.utils.email import send_verification_email

    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "Vivexy <noreply@vivexy.app>")
    mock_resend.Emails.send = MagicMock()

    send_verification_email("user@example.com", "https://app.vivexy.com/verify-email?token=abc")

    assert mock_resend.api_key == "test-key"
    mock_resend.Emails.send.assert_called_once()
    call_args = mock_resend.Emails.send.call_args[0][0]
    assert call_args["to"] == ["user@example.com"]
    assert call_args["from"] == "Vivexy <noreply@vivexy.app>"
    assert "https://app.vivexy.com/verify-email?token=abc" in call_args["html"]
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest src/agents_core/utils/__tests__/email.test.py -v`
Expected: FAIL — `agents_core.utils.email` doesn't exist.

- [x] **Step 3: Implement**

Create `packages/agents-core/src/agents_core/utils/email.py`:

```python
import os

import resend


def _configure_resend() -> None:
    resend.api_key = os.getenv("RESEND_API_KEY", "")


def send_verification_email(to_email: str, verification_url: str) -> None:
    """Send the email-verification link via Resend."""
    _configure_resend()
    resend.Emails.send(
        {
            "from": os.getenv("RESEND_FROM_EMAIL", "Vivexy <noreply@vivexy.app>"),
            "to": [to_email],
            "subject": "Verify your email address",
            "html": (
                "<p>Click the link below to verify your email address:</p>"
                f'<p><a href="{verification_url}">{verification_url}</a></p>'
                "<p>This link expires in 24 hours.</p>"
            ),
        }
    )
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest src/agents_core/utils/__tests__/email.test.py -v`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/agents-core/src/agents_core/utils/email.py packages/agents-core/src/agents_core/utils/__tests__/email.test.py
git commit -m "feat: add Resend email utility for verification emails"
```

---

## Task 5: Email verification endpoints

**Files:**
- Modify: `packages/agents-core/src/agents_core/routes/auth.py`
- Test: `packages/agents-core/src/agents_core/routes/__tests__/auth.test.py` (create if it doesn't exist)

- [x] **Step 1: Check whether a route test file already exists**

Run: `ls packages/agents-core/src/agents_core/routes/__tests__/ 2>/dev/null | grep auth`
If a file exists, read it first and add to it rather than overwriting. If not, Step 3 creates it from scratch.

- [x] **Step 2: Write the failing tests**

Create (or add to) `packages/agents-core/src/agents_core/routes/__tests__/auth.test.py`:

```python
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
```

This fixture uses a real in-memory sqlite `db` rather than mocking the ORM — matches how `routes/chat.py` and similar route tests already exercise real model behavior rather than mocking SQLAlchemy. Redis is NOT mocked here; these tests require a real local Redis (same as the rest of this app's test suite assumes Redis is reachable at `REDIS_URL`/default `localhost:6379` — same dependency `routes/chat.py`'s own tests already have).

- [x] **Step 3: Run tests to verify they fail**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest src/agents_core/routes/__tests__/auth.test.py -v`
Expected: FAIL — `/auth/verify-email` and `/auth/resend-verification` return 404, `send_verification_email` isn't imported in routes/auth.py yet.

- [x] **Step 4: Implement**

Rewrite `packages/agents-core/src/agents_core/routes/auth.py` in full:

```python
from agents_core.middlewares.auth import auth_middleware
from agents_core.models import User, db
from agents_core.schemas import UserCreate, UserLogin, UserResponse
from agents_core.utils.auth import (
    authenticate_user,
    create_email_verification_token,
    create_user,
    exclude_password,
    generate_token,
    is_resend_on_cooldown,
    set_resend_cooldown,
)
from agents_core.utils.email import send_verification_email
from flask import Blueprint, current_app, jsonify, request
from pydantic import ValidationError

bp = Blueprint("auth", __name__, url_prefix="/auth")


def _send_verification_email_for(user) -> None:
    """Best-effort: a Resend outage must never fail registration — the
    verification gate is soft, the user can always request a resend later."""
    try:
        token = create_email_verification_token(user.id)
        verification_url = (
            f"{current_app.config['FRONTEND_URL']}/verify-email?token={token}"
        )
        send_verification_email(user.email, verification_url)
    except Exception:
        current_app.logger.exception(
            "Failed to send verification email to user_id=%s", user.id
        )


@bp.route("/login", methods=["POST"])
def login():
    """Authenticate user and return JWT token.
    ---
    tags:
      - Auth
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - email
            - password
          properties:
            email:
              type: string
              example: user@example.com
            password:
              type: string
              example: mypassword123
    responses:
      200:
        description: Login successful
        schema:
          type: object
          properties:
            user:
              type: object
            token:
              type: string
      401:
        description: Invalid credentials
      400:
        description: Validation error
    """
    try:
        data = request.get_json()
        login_data = UserLogin(**data)
        user = authenticate_user(login_data.email, login_data.password)

        if not user:
            return jsonify({"error": "Invalid email or password"}), 401

        token = generate_token(user.id, user.email)
        user_data = exclude_password(user)

        return jsonify({"user": user_data, "token": token})

    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/register", methods=["POST"])
def register():
    """Register a new user account.
    ---
    tags:
      - Auth
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - name
            - email
            - password
          properties:
            name:
              type: string
              example: John Doe
            email:
              type: string
              example: newuser@example.com
            password:
              type: string
              example: securepass123
    responses:
      201:
        description: User created successfully
        schema:
          type: object
          properties:
            user:
              type: object
            token:
              type: string
      400:
        description: Validation error or duplicate email
    """
    try:
        data = request.get_json()
        user_data = UserCreate(**data)
        user = create_user(user_data)
        token = generate_token(user.id, user.email)

        _send_verification_email_for(user)

        user_response = UserResponse.from_orm(user)
        return jsonify({"user": user_response.dict(), "token": token}), 201

    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/me", methods=["GET"])
@auth_middleware
def me():
    """Get current authenticated user.
    ---
    tags:
      - Auth
    security:
      - BearerAuth: []
    responses:
      200:
        description: Current user info
        schema:
          type: object
          properties:
            user:
              type: object
      401:
        description: Unauthorized
    """
    user = request.user
    user_data = exclude_password(user)
    return jsonify({"user": user_data})


@bp.route("/verify-email", methods=["POST"])
def verify_email():
    """Verify a user's email address using the token from their verification email.
    ---
    tags:
      - Auth
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - token
          properties:
            token:
              type: string
    responses:
      200:
        description: Email verified
      400:
        description: Invalid or expired token
    """
    data = request.get_json() or {}
    token = data.get("token")
    if not token:
        return jsonify({"error": "Token is required"}), 400

    from agents_core.utils.auth import consume_email_verification_token

    user_id = consume_email_verification_token(token)
    if not user_id:
        return jsonify({"error": "Invalid or expired verification link"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.email_verified = True
    db.session.commit()

    return jsonify({"success": True})


@bp.route("/resend-verification", methods=["POST"])
@auth_middleware
def resend_verification():
    """Resend the email verification link. Rate-limited to once per 60s.
    ---
    tags:
      - Auth
    security:
      - BearerAuth: []
    responses:
      200:
        description: Verification email sent
      400:
        description: Email is already verified
      429:
        description: Rate limited — please wait before retrying
    """
    user = request.user

    if user.email_verified:
        return jsonify({"error": "Email is already verified"}), 400

    if is_resend_on_cooldown(user.id):
        return jsonify({"error": "Please wait before requesting another email"}), 429

    _send_verification_email_for(user)
    set_resend_cooldown(user.id)

    return jsonify({"success": True})
```

(`consume_email_verification_token` is imported inline inside `verify_email()` rather than in the top-level import block purely to keep this diff minimal against the plan's earlier Task 3 import list — either placement is fine; moving it to the top-level import line alongside the others is also correct and arguably cleaner. Either way, it must be imported before use.)

- [x] **Step 5: Run tests to verify they pass**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest src/agents_core/routes/__tests__/auth.test.py -v`
Expected: all PASS. If any fail with a Redis connection error, start Redis locally first (`redis-server` or `redis-stack-server` — this repo needs the RediSearch module for other features, see `packages/agents-core/src/agents_core/routes/chat.py`'s checkpoint usage, but plain Redis is sufficient for these specific tests).

- [x] **Step 6: Run the full agents-core suite to check for regressions**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest -v`
Expected: all PASS (no regressions in unrelated modules).

- [x] **Step 7: Commit**

```bash
git add packages/agents-core/src/agents_core/routes/auth.py packages/agents-core/src/agents_core/routes/__tests__/auth.test.py
git commit -m "feat: add email verification endpoints (verify-email, resend-verification)"
```

---

## Task 6: Authlib OAuth client setup

**Files:**
- Create: `packages/agents-core/src/agents_core/utils/oauth.py`
- Modify: `apps/agents-service/app/__init__.py`

- [x] **Step 1: Implement the OAuth client registry**

Create `packages/agents-core/src/agents_core/utils/oauth.py`:

```python
from authlib.integrations.flask_client import OAuth

oauth = OAuth()


def init_oauth(app) -> None:
    """Register the Google and Microsoft OIDC clients with Authlib.

    Must run inside create_app(), after app.config is populated from
    Config — client registration reads GOOGLE_CLIENT_ID/SECRET and
    MICROSOFT_CLIENT_ID/SECRET/TENANT from app.config.
    """
    oauth.init_app(app)

    oauth.register(
        name="google",
        server_metadata_url=(
            "https://accounts.google.com/.well-known/openid-configuration"
        ),
        client_id=app.config["GOOGLE_CLIENT_ID"],
        client_secret=app.config["GOOGLE_CLIENT_SECRET"],
        client_kwargs={"scope": "openid email profile"},
    )

    tenant = app.config.get("MICROSOFT_TENANT", "common")
    oauth.register(
        name="microsoft",
        server_metadata_url=(
            f"https://login.microsoftonline.com/{tenant}/v2.0/"
            ".well-known/openid-configuration"
        ),
        client_id=app.config["MICROSOFT_CLIENT_ID"],
        client_secret=app.config["MICROSOFT_CLIENT_SECRET"],
        client_kwargs={"scope": "openid email profile"},
    )
```

- [x] **Step 2: Wire it into `create_app()`**

Edit `apps/agents-service/app/__init__.py`. Add the import near the other `agents_core` imports:

```python
from agents_core.utils.oauth import init_oauth
```

And call it right after `app.config.from_object(config_object or Config)` (before `db.init_app(app)` or after — order relative to `db.init_app` doesn't matter, Authlib only needs `app.config` and `app.secret_key`, which `app.config.from_object` already populated via `SECRET_KEY`):

```python
    app = Flask(__name__)
    app.config.from_object(config_object or Config)
    init_oauth(app)
    CORS(app, supports_credentials=True, origins=app.config.get("CORS_ORIGINS", ["*"]))
```

- [x] **Step 3: Verify the app still boots**

Run (from `apps/agents-service`, with placeholder OAuth env vars so `init_oauth` doesn't crash on missing config):

```bash
GOOGLE_CLIENT_ID=test GOOGLE_CLIENT_SECRET=test \
MICROSOFT_CLIENT_ID=test MICROSOFT_CLIENT_SECRET=test \
uv run python -c "from app import create_app; app = create_app(); print('OK', list(app.blueprints.keys()))"
```

Expected: prints `OK` followed by the blueprint list including `auth` — no exceptions. (Authlib's `oauth.register()` only fetches each provider's discovery document lazily, on first actual OAuth request, so this works without real network access or real credentials.)

- [x] **Step 4: Commit**

```bash
git add packages/agents-core/src/agents_core/utils/oauth.py apps/agents-service/app/__init__.py
git commit -m "feat: register Google/Microsoft OAuth clients via Authlib"
```

---

## Task 7: Find-or-create SSO user logic

**Files:**
- Modify: `packages/agents-core/src/agents_core/utils/auth.py`
- Test: `packages/agents-core/src/agents_core/utils/__tests__/auth.test.py`

- [x] **Step 1: Write the failing tests**

Append to `packages/agents-core/src/agents_core/utils/__tests__/auth.test.py`:

```python
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
```

Add `from agents_core.models import db` and `from flask import Flask` to the top of the test file if not already present (the earlier Task 3 test additions don't need them; this is the first use of a real app/db fixture in this file — check before adding to avoid duplicate imports).

- [x] **Step 2: Run tests to verify they fail**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest src/agents_core/utils/__tests__/auth.test.py -v -k oauth_user`
Expected: FAIL — `find_or_create_oauth_user` doesn't exist.

- [x] **Step 3: Implement**

Add to `packages/agents-core/src/agents_core/utils/auth.py`, after `create_user`:

```python
def find_or_create_oauth_user(
    provider: str, subject_id: str, email: str, name: str | None
) -> User:
    """Find-or-create a User for an OAuth/SSO login.

    Lookup order: (1) an existing OAuth identity match, (2) an existing
    password-based account with the same email (auto-linked), (3) a brand
    new SSO-only account. SSO accounts are treated as pre-verified since
    the provider already verified the email before allowing sign-in with
    it — see the design spec's "SSO + verification" decision.
    """
    user = User.query.filter_by(
        oauth_provider=provider, oauth_subject_id=subject_id
    ).first()
    if user:
        return user

    user = User.query.filter_by(email=email).first()
    if user:
        user.oauth_provider = provider
        user.oauth_subject_id = subject_id
        user.email_verified = True
        db.session.commit()
        return user

    user = User(
        email=email,
        name=name,
        password=None,
        oauth_provider=provider,
        oauth_subject_id=subject_id,
        email_verified=True,
    )
    db.session.add(user)
    db.session.commit()
    return user
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest src/agents_core/utils/__tests__/auth.test.py -v`
Expected: all PASS, including every earlier test in this file.

- [x] **Step 5: Commit**

```bash
git add packages/agents-core/src/agents_core/utils/auth.py packages/agents-core/src/agents_core/utils/__tests__/auth.test.py
git commit -m "feat: add find-or-create logic for SSO users"
```

---

## Task 8: OAuth routes (login, callback, exchange)

> **Amendment (added after Task 5's code review):** Task 5's review found that `verify_email`/`resend_verification` didn't catch the `RuntimeError("Redis unavailable")` that Task 3's Redis helpers raise, which would've surfaced as Flask's default HTML 500 page instead of this API's usual JSON error shape. `oauth_callback` below was already safe (its broad `except Exception` already covers a Redis-down `create_oauth_exchange_code` call), but `oauth_exchange`'s `consume_oauth_exchange_code(code)` call had the identical unguarded gap — fixed directly in Step 4's code below (wrapped in `try/except RuntimeError`, returns 503) before this task ever ran, so unlike Task 5 this shouldn't need a second review pass for the same issue.

**Files:**
- Modify: `packages/agents-core/src/agents_core/routes/auth.py`
- Test: `packages/agents-core/src/agents_core/routes/__tests__/auth.test.py`

- [x] **Step 1: Write the failing tests**

Append to `packages/agents-core/src/agents_core/routes/__tests__/auth.test.py`:

```python
def test_oauth_login_unknown_provider_returns_404(client):
    response = client.get("/auth/oauth/facebook/login")
    assert response.status_code == 404


@patch("agents_core.routes.auth.oauth")
def test_oauth_login_redirects_to_provider(mock_oauth, client):
    mock_client = MagicMock()
    mock_client.authorize_redirect.return_value = "redirect-response"
    mock_oauth.create_client.return_value = mock_client

    client.get("/auth/oauth/google/login")

    mock_oauth.create_client.assert_called_once_with("google")
    mock_client.authorize_redirect.assert_called_once()
    called_redirect_uri = mock_client.authorize_redirect.call_args[0][0]
    assert called_redirect_uri.endswith("/auth/oauth/google/callback")


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

    response = client.get("/auth/oauth/google/callback")

    assert response.status_code == 302
    assert response.location.startswith("http://localhost:3000/auth/callback?code=")

    with app.app_context():
        user = User.query.filter_by(email="new-sso-user@example.com").first()
        assert user is not None
        assert user.oauth_provider == "google"
        assert user.email_verified is True


@patch("agents_core.routes.auth.oauth")
def test_oauth_callback_failure_redirects_to_login_with_error(mock_oauth, client):
    mock_client = MagicMock()
    mock_client.authorize_access_token.side_effect = RuntimeError("provider denied")
    mock_oauth.create_client.return_value = mock_client

    response = client.get("/auth/oauth/google/callback")

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

    callback_response = client.get("/auth/oauth/google/callback")
    code = callback_response.location.split("code=")[1]

    exchange_response = client.post("/auth/oauth/exchange", json={"code": code})

    assert exchange_response.status_code == 200
    body = exchange_response.get_json()
    assert body["token"]
    assert body["user"]["email"] == "exchange-user@example.com"


def test_oauth_exchange_invalid_code_returns_400(client):
    response = client.post("/auth/oauth/exchange", json={"code": "not-a-real-code"})
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
        callback_response = client.get("/auth/oauth/google/callback")
        code = callback_response.location.split("code=")[1]

    first = client.post("/auth/oauth/exchange", json={"code": code})
    assert first.status_code == 200

    second = client.post("/auth/oauth/exchange", json={"code": code})
    assert second.status_code == 400
```

Also set `app.config["BACKEND_URL"] = "http://localhost:5000"` in the `app` fixture (Step 2 of Task 5 created it without `BACKEND_URL` — add that line there too, since the login-redirect test needs it).

- [x] **Step 2: Update the `app` fixture**

Edit the `app` fixture in `packages/agents-core/src/agents_core/routes/__tests__/auth.test.py` (added in Task 5) to also set `BACKEND_URL`:

```python
@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["JWT_SECRET_KEY"] = "test-secret"
    app.config["FRONTEND_URL"] = "http://localhost:3000"
    app.config["BACKEND_URL"] = "http://localhost:5000"
    app.register_blueprint(auth_bp)
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app
```

- [x] **Step 3: Run tests to verify they fail**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest src/agents_core/routes/__tests__/auth.test.py -v -k oauth`
Expected: FAIL — `/auth/oauth/*` routes don't exist, `oauth` isn't imported in `routes/auth.py`.

- [x] **Step 4: Implement**

Add these imports to the top of `packages/agents-core/src/agents_core/routes/auth.py` (alongside the existing ones from Task 5):

```python
from agents_core.utils.auth import (
    authenticate_user,
    consume_email_verification_token,
    consume_oauth_exchange_code,
    create_email_verification_token,
    create_oauth_exchange_code,
    create_user,
    exclude_password,
    find_or_create_oauth_user,
    generate_token,
    get_user_from_token,
    is_resend_on_cooldown,
    set_resend_cooldown,
)
from agents_core.utils.email import send_verification_email
from agents_core.utils.oauth import oauth
from flask import Blueprint, current_app, jsonify, redirect, request
```

(This replaces Task 5's import block wholesale — it now also imports `consume_email_verification_token` and `get_user_from_token` at the top level instead of inline, and adds the OAuth-related names and `redirect`.)

Remove the inline `from agents_core.utils.auth import consume_email_verification_token` line inside `verify_email()` from Task 5 — it's now imported at the top.

Add these three routes at the end of the file:

```python
ALLOWED_OAUTH_PROVIDERS = {"google", "microsoft"}


@bp.route("/oauth/<provider>/login", methods=["GET"])
def oauth_login(provider):
    """Redirect to the provider's OAuth consent screen.
    ---
    tags:
      - Auth
    parameters:
      - in: path
        name: provider
        required: true
        type: string
        enum: [google, microsoft]
    responses:
      302:
        description: Redirect to the provider's consent screen
      404:
        description: Unknown provider
    """
    if provider not in ALLOWED_OAUTH_PROVIDERS:
        return jsonify({"error": "Unknown provider"}), 404

    client = oauth.create_client(provider)
    redirect_uri = f"{current_app.config['BACKEND_URL']}/auth/oauth/{provider}/callback"
    return client.authorize_redirect(redirect_uri)


@bp.route("/oauth/<provider>/callback", methods=["GET"])
def oauth_callback(provider):
    """Handle the provider's redirect back, find-or-create the user, and
    redirect to the frontend with a one-time exchange code.
    ---
    tags:
      - Auth
    parameters:
      - in: path
        name: provider
        required: true
        type: string
        enum: [google, microsoft]
    responses:
      302:
        description: Redirect to the frontend (success → /auth/callback?code=..., failure → /login?error=oauth_failed)
      404:
        description: Unknown provider
    """
    if provider not in ALLOWED_OAUTH_PROVIDERS:
        return jsonify({"error": "Unknown provider"}), 404

    frontend_url = current_app.config["FRONTEND_URL"]

    try:
        client = oauth.create_client(provider)
        token = client.authorize_access_token()
        userinfo = token.get("userinfo") if token else None
        if not userinfo or not userinfo.get("email"):
            raise ValueError("Provider did not return an email address")

        user = find_or_create_oauth_user(
            provider=provider,
            subject_id=userinfo["sub"],
            email=userinfo["email"],
            name=userinfo.get("name"),
        )
        jwt_token = generate_token(user.id, user.email)
        code = create_oauth_exchange_code(jwt_token)
    except Exception:
        current_app.logger.exception(
            "OAuth callback failed for provider=%s", provider
        )
        return redirect(f"{frontend_url}/login?error=oauth_failed")

    return redirect(f"{frontend_url}/auth/callback?code={code}")


@bp.route("/oauth/exchange", methods=["POST"])
def oauth_exchange():
    """Trade a one-time OAuth exchange code for the real JWT.
    ---
    tags:
      - Auth
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - code
          properties:
            code:
              type: string
    responses:
      200:
        description: Exchange successful
        schema:
          type: object
          properties:
            user:
              type: object
            token:
              type: string
      400:
        description: Invalid or expired code
      503:
        description: Redis unavailable — try again shortly
    """
    data = request.get_json() or {}
    code = data.get("code")
    if not code:
        return jsonify({"error": "Code is required"}), 400

    try:
        jwt_token = consume_oauth_exchange_code(code)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    if not jwt_token:
        return jsonify({"error": "Invalid or expired code"}), 400

    try:
        user = get_user_from_token(jwt_token)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    user_data = exclude_password(user)
    return jsonify({"user": user_data, "token": jwt_token})
```

- [x] **Step 5: Run tests to verify they pass**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest src/agents_core/routes/__tests__/auth.test.py -v`
Expected: all PASS.

- [x] **Step 6: Run the full agents-core suite**

Run: `cd packages/agents-core && uv run --project ../../apps/agents-service pytest -v`
Expected: all PASS, no regressions.

- [x] **Step 7: Commit**

```bash
git add packages/agents-core/src/agents_core/routes/auth.py packages/agents-core/src/agents_core/routes/__tests__/auth.test.py
git commit -m "feat: add OAuth login/callback/exchange routes"
```

---

## Task 9: Frontend types, service, and hooks

**Files:**
- Modify: `packages/core/src/types/user.ts`
- Modify: `packages/core/src/services/auth.service.ts`
- Modify: `packages/core/src/hooks/useAuth.ts`
- Modify: `packages/core/src/constants/routes.ts`

- [ ] **Step 1: Add `emailVerified` to `AuthUser`**

Edit `packages/core/src/types/user.ts`:

```typescript
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  avatar: string | null;
  emailVerified: boolean;
}
```

(Only the `AuthUser` interface changes — `User`, `LoginCredentials`, `RegisterCredentials`, `AuthResponse` stay as they are.)

- [ ] **Step 2: Add the three new service calls**

Edit `packages/core/src/services/auth.service.ts`, adding to the `authService` object (before the closing `};`):

```typescript
  // Exchange a one-time OAuth code for the real session token
  exchangeOAuthCode: async (code: string): Promise<AuthResponse> => {
    const response = await axiosInstance.post<AuthResponse>(
      '/auth/oauth/exchange',
      { code }
    );
    return response.data;
  },

  // Verify an emailed verification token
  verifyEmail: async (token: string): Promise<{ success: boolean }> => {
    const response = await axiosInstance.post<{ success: boolean }>(
      '/auth/verify-email',
      { token }
    );
    return response.data;
  },

  // Resend the verification email (requires an authenticated session)
  resendVerification: async (): Promise<{ success: boolean }> => {
    const response = await axiosInstance.post<{ success: boolean }>(
      '/auth/resend-verification'
    );
    return response.data;
  },
```

- [ ] **Step 3: Add the three new hooks**

Edit `packages/core/src/hooks/useAuth.ts`, adding after the existing `useLogin`:

```typescript
// Exchange an OAuth code for a session (used by the /auth/callback page)
export const useExchangeOAuthCode = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authService.exchangeOAuthCode,
    onSuccess: (data) => {
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });
};

// Verify an emailed verification token (used by the /verify-email page)
export const useVerifyEmail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authService.verifyEmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });
};

// Resend the verification email
export const useResendVerification = () => {
  return useMutation({
    mutationFn: authService.resendVerification,
  });
};
```

- [ ] **Step 4: Register the two new routes as chrome-free**

Edit `packages/core/src/constants/routes.ts`:

```typescript
// Auth-only entry pages. If the user is already logged in, redirect away from these.
export const AUTH_ROUTES: string[] = [
  '/login',
  '/register',
  '/auth/callback',
  '/verify-email',
];
```

- [ ] **Step 5: Run the frontend test suite to confirm nothing broke**

Run: `cd packages/core && npm run test`
Expected: all existing tests PASS (no new tests yet — this task is additive, type/service/hook plumbing only).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types/user.ts packages/core/src/services/auth.service.ts packages/core/src/hooks/useAuth.ts packages/core/src/constants/routes.ts
git commit -m "feat: add frontend types/service/hooks for SSO and email verification"
```

---

## Task 10: SSO buttons on login and register forms

**Files:**
- Modify: `packages/core/src/components/auth/login-form.tsx`
- Modify: `packages/core/src/components/auth/register-form.tsx`
- Test: `packages/core/src/components/auth/__tests__/login-form.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/components/auth/__tests__/login-form.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { LoginForm } from '../login-form';

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('LoginForm SSO buttons', () => {
  it('renders Google and Microsoft SSO buttons that navigate to the backend OAuth login URL', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:5000');
    renderWithQueryClient(<LoginForm />);

    const googleButton = screen.getByRole('button', {
      name: /continue with google/i,
    });
    const microsoftButton = screen.getByRole('button', {
      name: /continue with microsoft/i,
    });

    expect(googleButton).toBeInTheDocument();
    expect(microsoftButton).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/components/auth/__tests__/login-form.test.tsx`
Expected: FAIL — no button named "Continue with Google"/"Continue with Microsoft" exists yet.

- [ ] **Step 3: Implement — login-form.tsx**

Edit `packages/core/src/components/auth/login-form.tsx`. Add a helper above the component and two buttons plus a divider inside `CardContent`, before the existing `<Form {...form}>`:

```tsx
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function handleSSOLogin(provider: 'google' | 'microsoft') {
  window.location.href = `${API_URL}/auth/oauth/${provider}/login`;
}
```

Inside `<CardContent>`, immediately before `<Form {...form}>`:

```tsx
        <div className="space-y-2 mb-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => handleSSOLogin('google')}
          >
            Continue with Google
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => handleSSOLogin('microsoft')}
          >
            Continue with Microsoft
          </Button>
        </div>
        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              Or continue with email
            </span>
          </div>
        </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/components/auth/__tests__/login-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Apply the same change to register-form.tsx**

Edit `packages/core/src/components/auth/register-form.tsx`. Add this helper above the component (same as login-form.tsx's Step 3):

```tsx
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function handleSSOLogin(provider: 'google' | 'microsoft') {
  window.location.href = `${API_URL}/auth/oauth/${provider}/login`;
}
```

Inside its `<CardContent>`, immediately before its `<Form {...form}>`:

```tsx
        <div className="space-y-2 mb-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => handleSSOLogin('google')}
          >
            Continue with Google
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => handleSSOLogin('microsoft')}
          >
            Continue with Microsoft
          </Button>
        </div>
        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              Or continue with email
            </span>
          </div>
        </div>
```

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd packages/core && npm run test`
Expected: all PASS, including the new login-form test and all pre-existing tests.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/components/auth/login-form.tsx packages/core/src/components/auth/register-form.tsx packages/core/src/components/auth/__tests__/login-form.test.tsx
git commit -m "feat: add Google/Microsoft SSO buttons to login and register forms"
```

---

## Task 11: OAuth callback and verify-email pages

**Files:**
- Create: `apps/frontend/app/auth/callback/page.tsx`
- Create: `apps/frontend/app/verify-email/page.tsx`

These are Next.js App Router pages — this codebase's existing frontend test setup (Task 10's `login-form.test.tsx`, `chat-header.test.tsx`) tests *components*, not page-level route files directly. Following that same established pattern, these two pages stay thin (just data-fetching + redirect glue) with no dedicated test file of their own — the behavior they call (`useExchangeOAuthCode`, `useVerifyEmail`) is already covered by Task 9's underlying service calls and Task 8's backend route tests. Manual verification (Step 3 in each) substitutes for an automated test here, consistent with the spec's own testing section calling out that the full OAuth round-trip needs a manual click-through regardless.

- [ ] **Step 1: Create the OAuth callback page**

Create `apps/frontend/app/auth/callback/page.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useExchangeOAuthCode } from '@vivexy/core/hooks/useAuth';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const exchangeMutation = useExchangeOAuthCode();
  // Next.js dev mode double-invokes effects (React StrictMode) — without
  // this guard, the exchange code (single-use on the backend) would get
  // consumed by the first invocation and the second would always fail.
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const code = searchParams.get('code');
    if (!code) {
      router.replace('/login?error=oauth_failed');
      return;
    }

    exchangeMutation.mutate(code, {
      onSuccess: () => router.replace('/chat'),
      onError: () => router.replace('/login?error=oauth_failed'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Signing you in...</p>
    </div>
  );
}
```

- [ ] **Step 2: Create the verify-email page**

Create `apps/frontend/app/verify-email/page.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useVerifyEmail } from '@vivexy/core/hooks/useAuth';
import { Button } from '@vivexy/ui/button';
import Link from 'next/link';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const verifyMutation = useVerifyEmail();
  const hasRun = useRef(false);
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>(
    'pending'
  );

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      return;
    }

    verifyMutation.mutate(token, {
      onSuccess: () => setStatus('success'),
      onError: () => setStatus('error'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center space-y-4 max-w-md">
        {status === 'pending' && (
          <p className="text-muted-foreground">Verifying your email...</p>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-xl font-bold">Email verified</h1>
            <p className="text-muted-foreground">
              Your email address has been verified.
            </p>
            <Link href="/chat">
              <Button>Continue</Button>
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-xl font-bold">Link expired</h1>
            <p className="text-muted-foreground">
              This verification link is invalid or has expired. You can
              request a new one from inside the app.
            </p>
            <Link href="/login">
              <Button variant="outline">Back to sign in</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manually verify both pages render**

Run: `cd apps/frontend && npm run dev`, then in a browser:
- Visit `http://localhost:3000/auth/callback` with no `code` param — expect an immediate redirect to `/login?error=oauth_failed`.
- Visit `http://localhost:3000/verify-email` with no `token` param — expect the "Link expired" state to render (no redirect, this page shows its own error state in place).
- Visit `http://localhost:3000/verify-email?token=garbage` — expect a brief "Verifying..." then the "Link expired" state (the backend call returns 400 for an unknown token).

- [ ] **Step 4: Run typecheck/build to catch any type errors**

Run: `cd apps/frontend && npm run build`
Expected: builds successfully, no TypeScript errors on either new page.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/app/auth/callback/page.tsx apps/frontend/app/verify-email/page.tsx
git commit -m "feat: add OAuth callback and verify-email pages"
```

---

## Task 12: Verify-email banner in the dashboard shell

**Files:**
- Create: `packages/core/src/components/shared/verify-email-banner.tsx`
- Modify: `packages/core/src/components/shared/app-shell.tsx`
- Test: `packages/core/src/components/shared/__tests__/verify-email-banner.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/components/shared/__tests__/verify-email-banner.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerifyEmailBanner } from '../verify-email-banner';

const mockUseAuthSafe = vi.fn();
vi.mock('../auth-provider', () => ({
  useAuthSafe: () => mockUseAuthSafe(),
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('VerifyEmailBanner', () => {
  beforeEach(() => {
    mockUseAuthSafe.mockReset();
  });

  it('renders nothing when not authenticated', () => {
    mockUseAuthSafe.mockReturnValue({
      user: null,
      isAuthenticated: false,
    });

    const { container } = renderWithQueryClient(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the user is already verified', () => {
    mockUseAuthSafe.mockReturnValue({
      user: { emailVerified: true },
      isAuthenticated: true,
    });

    const { container } = renderWithQueryClient(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the reminder banner when the user is unverified', () => {
    mockUseAuthSafe.mockReturnValue({
      user: { emailVerified: false },
      isAuthenticated: true,
    });

    renderWithQueryClient(<VerifyEmailBanner />);

    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /resend email/i })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/components/shared/__tests__/verify-email-banner.test.tsx`
Expected: FAIL — `verify-email-banner.tsx` doesn't exist.

- [ ] **Step 3: Implement the banner**

Create `packages/core/src/components/shared/verify-email-banner.tsx`:

```tsx
'use client';

import { useAuthSafe } from './auth-provider';
import { useResendVerification } from '../../hooks/useAuth';
import { Alert, AlertDescription } from '@vivexy/ui/alert';
import { Button } from '@vivexy/ui/button';
import { toast } from 'sonner';

export function VerifyEmailBanner() {
  const { user, isAuthenticated } = useAuthSafe();
  const resendMutation = useResendVerification();

  if (!isAuthenticated || !user || user.emailVerified) return null;

  const handleResend = async () => {
    try {
      await resendMutation.mutateAsync();
      toast.success('Verification email sent');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to resend email'
      );
    }
  };

  return (
    <Alert className="rounded-none border-x-0 border-t-0">
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>Please verify your email address to secure your account.</span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleResend}
          disabled={resendMutation.isPending}
        >
          {resendMutation.isPending ? 'Sending...' : 'Resend email'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/components/shared/__tests__/verify-email-banner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the banner into AppShell**

Edit `packages/core/src/components/shared/app-shell.tsx`. Add the import:

```tsx
import { VerifyEmailBanner } from '@vivexy/core/shared/verify-email-banner';
```

And render it as the first child inside the `<div className="flex flex-1 flex-col min-w-0">` wrapper, before `{!isChatPage && (...)}`:

```tsx
        <div className="flex flex-1 flex-col min-w-0">
          <VerifyEmailBanner />
          {!isChatPage && (
            <DashboardHeader heading={titleFromPath(pathname)}>
              <MobileSidebarTrigger />
            </DashboardHeader>
          )}
```

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd packages/core && npm run test`
Expected: all PASS, no regressions.

- [ ] **Step 7: Manually verify the banner in the browser**

Run: `cd apps/frontend && npm run dev`, register a brand-new account, and confirm the "Please verify your email address" banner appears at the top of the dashboard immediately after registering. Click "Resend email" and confirm a toast confirms the send (check your Resend dashboard or terminal logs for the actual email, depending on your `RESEND_API_KEY` setup).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/components/shared/verify-email-banner.tsx packages/core/src/components/shared/app-shell.tsx packages/core/src/components/shared/__tests__/verify-email-banner.test.tsx
git commit -m "feat: add verify-email reminder banner to dashboard shell"
```

---

## Post-implementation checklist (not a task — a reminder for whoever ships this)

- Register real OAuth apps in the Google Cloud Console and Microsoft Entra admin center for every environment (local/staging/prod), each with its redirect URI set to `{BACKEND_URL}/auth/oauth/<provider>/callback`. Local dev can use placeholder/test credentials for everything except the actual end-to-end click-through.
- Verify a sending domain in Resend and set `RESEND_FROM_EMAIL` to an address on it — Resend rejects sends from unverified domains.
- Do the one real end-to-end click-through (spec's testing section) against actual Google and Microsoft consent screens in a deployed environment before calling this done — nothing in Tasks 1–12 exercises the real provider discovery documents or real consent flow.
