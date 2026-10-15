import json
import os
import secrets
from datetime import datetime, timedelta

import bcrypt
import jwt
import redis as redis_lib
from flask import current_app
from sqlalchemy.exc import IntegrityError

from agents_core.constants.redis_keys import (
    REDIS_KEY_EMAIL_VERIFY,
    REDIS_KEY_OAUTH_EXCHANGE,
    REDIS_KEY_RESEND_COOLDOWN,
)
from agents_core.models import Role, User, db
from agents_core.schemas import UserCreate, UserResponse

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

EMAIL_VERIFY_TTL_SECONDS = 24 * 60 * 60  # 24h
RESEND_COOLDOWN_TTL_SECONDS = 60
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
    r.setex(
        REDIS_KEY_EMAIL_VERIFY.format(token=token), EMAIL_VERIFY_TTL_SECONDS, user_id
    )
    return token


def consume_email_verification_token(token: str) -> str | None:
    """Atomically look up and delete a verification token (GETDEL, not a
    separate GET+DELETE — two concurrent consumes of the same token must
    not both succeed). Single-use: returns the user_id on first call, None
    on any call after (or if invalid/expired)."""
    r = _get_redis()
    if not r:
        raise RuntimeError("Redis unavailable")
    return r.getdel(REDIS_KEY_EMAIL_VERIFY.format(token=token))


def is_resend_on_cooldown(user_id: str) -> bool:
    r = _get_redis()
    if not r:
        raise RuntimeError("Redis unavailable")
    return r.exists(REDIS_KEY_RESEND_COOLDOWN.format(user_id=user_id)) == 1


def set_resend_cooldown(user_id: str) -> None:
    r = _get_redis()
    if not r:
        raise RuntimeError("Redis unavailable")
    r.setex(
        REDIS_KEY_RESEND_COOLDOWN.format(user_id=user_id),
        RESEND_COOLDOWN_TTL_SECONDS,
        "1",
    )


def create_oauth_exchange_code(jwt_token: str, state: str) -> str:
    """Store a freshly-issued JWT behind a one-time opaque code (60s TTL) so
    the OAuth callback's redirect never puts the real JWT in a URL.

    Also binds the code to `state` — the nonce the frontend generated
    before starting the OAuth redirect (relayed through the whole round
    trip as the actual OAuth `state` parameter, so the provider echoes it
    back to us and Authlib's own session-bound check already validated it
    hasn't been tampered with). Without this binding, the bare code is a
    pure bearer credential good for logging in as whoever it belongs to:
    anyone who could observe their OWN real code (e.g. by completing a
    legitimate login as themselves and reading it off the redirect) could
    hand a victim a link that silently logs the victim into the
    attacker's account. consume_oauth_exchange_code requires the caller
    to present this same state back, so only the browser that actually
    went through this login attempt can redeem the code."""
    r = _get_redis()
    if not r:
        raise RuntimeError("Redis unavailable")
    code = secrets.token_urlsafe(32)
    payload = json.dumps({"jwt": jwt_token, "state": state})
    r.setex(
        REDIS_KEY_OAUTH_EXCHANGE.format(code=code), OAUTH_EXCHANGE_TTL_SECONDS, payload
    )
    return code


def consume_oauth_exchange_code(code: str, state: str) -> str | None:
    """Atomically look up and delete an exchange code (GETDEL — see
    consume_email_verification_token's docstring for why this must be
    atomic, not a separate GET+DELETE), then verify the presented `state`
    matches the one the code was bound to at creation. Single-use: returns
    the JWT only when the code is valid/unexpired AND state matches; None
    otherwise. Deliberately doesn't distinguish which check failed (wrong
    code vs. wrong state), to avoid giving an attacker who has a valid
    code a signal about whether a guessed state is getting closer."""
    r = _get_redis()
    if not r:
        raise RuntimeError("Redis unavailable")
    raw = r.getdel(REDIS_KEY_OAUTH_EXCHANGE.format(code=code))
    if raw is None:
        return None
    payload = json.loads(raw)
    if not secrets.compare_digest(payload["state"], state):
        return None
    return payload["jwt"]


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def generate_token(user_id: str, email: str) -> str:
    """Generate a JWT token for the user."""
    payload = {
        "userId": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(days=7),  # 7 days
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET_KEY"], algorithm="HS256")


def verify_token(token: str) -> dict:
    """Verify and decode a JWT token."""
    try:
        payload = jwt.decode(
            token, current_app.config["JWT_SECRET_KEY"], algorithms=["HS256"]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid token")


def get_user_from_token(token: str) -> User:
    """Get user from JWT token."""
    payload = verify_token(token)
    user = User.query.get(payload["userId"])
    if not user:
        raise ValueError("User not found")
    return user


def record_login(user: User) -> None:
    user.last_login_at = datetime.utcnow()
    db.session.commit()


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


def authenticate_user(email: str, password: str) -> User:
    """Authenticate a user with email and password."""
    user = User.query.filter_by(email=email).first()
    # SSO-only accounts have no password (user.password is None) — without
    # this check, verify_password's hashed.encode("utf-8") would raise
    # AttributeError instead of a clean "wrong credentials" result.
    if user and user.password and verify_password(password, user.password):
        return user
    return None


def create_user(user_data: UserCreate) -> User:
    """Create a new user."""
    # Check if user already exists
    existing_user = User.query.filter_by(email=user_data.email).first()
    if existing_user:
        raise ValueError("User with this email already exists")

    # Hash password
    hashed_password = hash_password(user_data.password)

    # Create user
    user = User(
        email=user_data.email,
        name=user_data.name,
        password=hashed_password,
        role=Role.USER,
        avatar=user_data.avatar,
    )

    db.session.add(user)
    db.session.commit()

    return user


def find_or_create_oauth_user(
    provider: str, subject_id: str, email: str, name: str | None
) -> User:
    """Find-or-create a User for an OAuth/SSO login.

    Lookup order: (1) an existing OAuth identity match, (2) an existing
    password-based account with the same email (auto-linked, overwriting
    any prior oauth_provider/oauth_subject_id — email stays the real
    source of identity truth, see the design spec's "multi-provider
    identity" simplification), (3) a brand new SSO-only account. SSO
    accounts are treated as pre-verified since the provider already
    verified the email before allowing sign-in with it — see the design
    spec's "SSO + verification" decision.

    Account pre-hijacking guard: registration is open and the email
    verification gate is soft (an unverified account is fully usable
    immediately — see the design spec), so an attacker can register
    someone else's email before they do. If auto-link found an existing
    row that was NOT already verified, nothing has ever proven that
    row's password actually belongs to this email's real owner — only
    the IdP has now proven that, by letting this login happen. So the
    old password is invalidated here, not just left in place: without
    this, the attacker's original password would keep working forever,
    giving them permanent, silent access alongside the real owner's SSO
    login to what the real owner now believes is "their" account. An
    already-verified row is left untouched — a prior verified password
    registration is itself valid proof of ownership, so this is just
    the legitimate "add SSO to my own account" case.
    """
    user = User.query.filter_by(
        oauth_provider=provider, oauth_subject_id=subject_id
    ).first()
    if user:
        return user

    user = User.query.filter_by(email=email).first()
    if user:
        if not user.email_verified:
            user.password = None
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
    try:
        db.session.commit()
    except IntegrityError:
        # Two near-simultaneous callbacks for the same brand-new user (e.g.
        # a double-click or a retried OAuth redirect) can both pass the
        # lookups above before either commits. users.email has a DB-level
        # unique constraint, so the loser hits this instead of silently
        # creating a duplicate row — treat it as a normal cache hit: roll
        # back this attempt and return the row the winner just created.
        db.session.rollback()
        user = User.query.filter_by(email=email).first()
        if user is None:
            raise
    return user
