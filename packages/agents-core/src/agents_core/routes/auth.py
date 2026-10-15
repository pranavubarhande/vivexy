from agents_core.business_logic.teams import claim_pending_invites
from agents_core.middlewares.auth import auth_middleware
from agents_core.models import User, db
from agents_core.schemas import UserCreate, UserLogin, UserResponse
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
    record_login,
    set_resend_cooldown,
)
from agents_core.utils.email import send_verification_email
from agents_core.utils.oauth import oauth
from flask import Blueprint, current_app, jsonify, redirect, request
from pydantic import ValidationError

bp = Blueprint("auth", __name__, url_prefix="/auth")


def _send_verification_email_for(user) -> bool:
    """Best-effort: a Resend (or Redis) outage must never fail registration —
    the verification gate is soft, the user can always request a resend
    later. Returns whether the send actually succeeded so resend_verification
    (whose entire purpose is the send) can report failure accurately instead
    of silently claiming success and burning the caller's cooldown window;
    register() intentionally ignores the return value."""
    try:
        token = create_email_verification_token(user.id)
        verification_url = (
            f"{current_app.config['FRONTEND_URL']}/verify-email?token={token}"
        )
        send_verification_email(user.email, verification_url)
        return True
    except Exception:
        current_app.logger.exception(
            "Failed to send verification email to user_id=%s", user.id
        )
        return False


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

        if user.is_suspended:
            return jsonify({"error": "This account has been suspended"}), 403

        record_login(user)
        claim_pending_invites(user)
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
        record_login(user)
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
      503:
        description: Redis unavailable — try again shortly
    """
    data = request.get_json() or {}
    token = data.get("token")
    if not token:
        return jsonify({"error": "Token is required"}), 400

    try:
        user_id = consume_email_verification_token(token)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503

    if not user_id:
        return jsonify({"error": "Invalid or expired verification link"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.email_verified = True
    db.session.commit()
    claim_pending_invites(user)

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
      502:
        description: Failed to send the verification email
      503:
        description: Redis unavailable — try again shortly
    """
    user = request.user

    if user.email_verified:
        return jsonify({"error": "Email is already verified"}), 400

    try:
        on_cooldown = is_resend_on_cooldown(user.id)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503

    if on_cooldown:
        return jsonify({"error": "Please wait before requesting another email"}), 429

    if not _send_verification_email_for(user):
        return (
            jsonify(
                {
                    "error": "Failed to send verification email. Please try again shortly."
                }
            ),
            502,
        )

    try:
        set_resend_cooldown(user.id)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503

    return jsonify({"success": True})


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
      - in: query
        name: state
        required: true
        type: string
        description: >
          Random nonce generated by the frontend before this redirect,
          stored client-side (sessionStorage) and required again at
          /auth/oauth/exchange. Binds the exchange code to the browser
          that actually completed the provider's consent screen — see
          create_oauth_exchange_code's docstring.
    responses:
      302:
        description: Redirect to the provider's consent screen
      400:
        description: Missing state parameter
      404:
        description: Unknown provider
      503:
        description: Provider is registered but has no client_id/secret configured yet
    """
    if provider not in ALLOWED_OAUTH_PROVIDERS:
        return jsonify({"error": "Unknown provider"}), 404

    # Authlib's client.authorize_redirect() doesn't validate client_id —
    # with one unset (None), it still returns a normal 302 straight to the
    # real provider, whose OWN generic "invalid_client" error page is then
    # all the user sees, with nothing in our logs pointing at the real
    # cause. Catch that here with a clear error instead, before a provider
    # is enabled in ALLOWED_OAUTH_PROVIDERS ahead of its real credentials
    # being set.
    client_id_key = f"{provider.upper()}_CLIENT_ID"
    if not current_app.config.get(client_id_key):
        current_app.logger.error(
            "OAuth login requested for provider=%s but %s is not configured",
            provider,
            client_id_key,
        )
        return jsonify({"error": "OAuth provider is not configured"}), 503

    client_state = request.args.get("state")
    if not client_state:
        return jsonify({"error": "Missing state parameter"}), 400

    client = oauth.create_client(provider)
    redirect_uri = f"{current_app.config['BACKEND_URL']}/auth/oauth/{provider}/callback"
    # Passing our own state makes Authlib use it (instead of generating a
    # random one) for both its session-bound CSRF check on this round trip
    # AND as the value the provider echoes back verbatim in the callback —
    # see oauth_callback, which reads it back out to bind the exchange code.
    return client.authorize_redirect(redirect_uri, state=client_state)


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
        # Already validated by authorize_access_token() above against what
        # Authlib stored server-side for this session in oauth_login — safe
        # to trust as the frontend's nonce here.
        client_state = request.args.get("state")
        if not client_state:
            raise ValueError("Missing state in provider callback")

        userinfo = token.get("userinfo") if token else None
        if not userinfo or not userinfo.get("email"):
            raise ValueError("Provider did not return an email address")

        user = find_or_create_oauth_user(
            provider=provider,
            subject_id=userinfo["sub"],
            email=userinfo["email"],
            name=userinfo.get("name"),
        )
        if user.is_suspended:
            return redirect(f"{frontend_url}/login?error=account_suspended")
        record_login(user)
        claim_pending_invites(user)
        jwt_token = generate_token(user.id, user.email)
        code = create_oauth_exchange_code(jwt_token, client_state)
    except Exception:
        current_app.logger.exception("OAuth callback failed for provider=%s", provider)
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
            - state
          properties:
            code:
              type: string
            state:
              type: string
              description: >
                The same nonce the frontend generated before redirecting
                to /auth/oauth/<provider>/login. Must match what the code
                was bound to, or the exchange is rejected — see
                create_oauth_exchange_code's docstring.
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
        description: Invalid or expired code, or state mismatch
      503:
        description: Redis unavailable — try again shortly
    """
    data = request.get_json() or {}
    code = data.get("code")
    state = data.get("state")
    # isinstance checks, not just truthiness: a non-string state (e.g. a
    # JSON number or array) would pass `not state` but then throw inside
    # secrets.compare_digest in consume_oauth_exchange_code, turning a bad
    # request into an unhandled 500 instead of a clean 400.
    if not isinstance(code, str) or not code or not isinstance(state, str) or not state:
        return jsonify({"error": "Code and state are required"}), 400

    try:
        jwt_token = consume_oauth_exchange_code(code, state)
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
