from agents_core.middlewares.auth import auth_middleware
from agents_core.models import User, db
from agents_core.schemas import UserCreate, UserLogin, UserResponse
from agents_core.utils.auth import (
    authenticate_user,
    consume_email_verification_token,
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
