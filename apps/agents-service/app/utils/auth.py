from datetime import datetime, timedelta

import bcrypt
import jwt
from flask import current_app

from app import db
from app.models import User
from app.schemas import UserCreate, UserResponse


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


def exclude_password(user: User) -> dict:
    """Return user data without password."""
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role.value,
        "avatar": user.avatar,
        "createdAt": user.created_at.isoformat() if user.created_at else None,
        "updatedAt": user.updated_at.isoformat() if user.updated_at else None,
    }


def authenticate_user(email: str, password: str) -> User:
    """Authenticate a user with email and password."""
    user = User.query.filter_by(email=email).first()
    if user and verify_password(password, user.password):
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
        role=user_data.role,
        avatar=user_data.avatar,
    )

    db.session.add(user)
    db.session.commit()

    return user
