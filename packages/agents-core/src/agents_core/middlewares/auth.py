from functools import wraps

from agents_core.models import Role
from agents_core.utils.auth import get_user_from_token
from flask import jsonify, request


def auth_middleware(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authorization header missing or invalid"}), 401

        token = auth_header.split(" ")[1]
        try:
            user = get_user_from_token(token)
            request.user = user  # Attach user to request
        except ValueError as e:
            return jsonify({"error": str(e)}), 401

        if getattr(user, "is_suspended", False):
            return jsonify({"error": "This account has been suspended"}), 403

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
