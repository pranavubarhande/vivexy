from functools import wraps

from agents_core.models import Role, User
from agents_core.utils.auth import get_user_and_claims_from_token
from flask import jsonify, request

READ_ONLY_METHODS = ("GET", "HEAD", "OPTIONS")


def auth_middleware(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authorization header missing or invalid"}), 401

        token = auth_header.split(" ")[1]
        try:
            user, claims = get_user_and_claims_from_token(token)
            request.user = user  # Attach user to request
        except ValueError as e:
            return jsonify({"error": str(e)}), 401

        if getattr(user, "is_suspended", False):
            return jsonify({"error": "This account has been suspended"}), 403

        request.impersonator = None
        impersonator_id = claims.get("impersonatorId")
        if impersonator_id:
            impersonator = User.query.get(impersonator_id)
            if not impersonator or impersonator.role != Role.SUPER_ADMIN:
                return (
                    jsonify({"error": "Impersonation session is no longer valid"}),
                    401,
                )
            if request.method not in READ_ONLY_METHODS:
                return (
                    jsonify({"error": "Impersonation sessions are read-only"}),
                    403,
                )
            request.impersonator = impersonator

        return f(*args, **kwargs)

    return decorated_function


def superadmin_required(f):
    @wraps(f)
    @auth_middleware
    def decorated_function(*args, **kwargs):
        if request.user.role != Role.SUPER_ADMIN:
            return jsonify({"error": "Superadmin access required"}), 403
        return f(*args, **kwargs)

    return decorated_function


def platform_staff_required(f):
    """Read access for platform staff: SUPER_ADMIN, or the read-only ADMIN role."""

    @wraps(f)
    @auth_middleware
    def decorated_function(*args, **kwargs):
        if request.user.role not in (Role.SUPER_ADMIN, Role.ADMIN):
            return jsonify({"error": "Platform staff access required"}), 403
        return f(*args, **kwargs)

    return decorated_function
