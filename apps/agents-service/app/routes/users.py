from flask import Blueprint, jsonify, request

from app.business_logic.api_keys import (
    delete_user_api_key,
    get_user_api_keys,
    upsert_user_api_key,
)
from app.business_logic.users import (
    delete_user,
    get_user_profile,
    update_user_password,
    update_user_profile,
)
from app.middlewares.auth import auth_middleware

bp = Blueprint("users", __name__, url_prefix="/users")


@bp.route("/me", methods=["GET"])
@auth_middleware
def get_profile():
    try:
        user_id = request.user.id
        user = get_user_profile(user_id)
        return jsonify(user)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/me", methods=["PATCH"])
@auth_middleware
def update_profile():
    try:
        user_id = request.user.id
        data = request.get_json()

        # Check if any valid fields are provided
        if not any(key in data for key in ["name", "email"]):
            return jsonify({"error": "No valid fields to update"}), 400

        result = update_user_profile(user_id, data)
        return jsonify({"user": result})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/me", methods=["PUT"])
@auth_middleware
def update_password():
    try:
        user_id = request.user.id
        data = request.get_json()

        current_password = data.get("current_password")
        new_password = data.get("new_password")

        if not current_password or not new_password:
            return (
                jsonify({"error": "Current password and new password are required"}),
                400,
            )

        if len(new_password) < 8:
            return (
                jsonify({"error": "New password must be at least 8 characters long"}),
                400,
            )

        result = update_user_password(user_id, current_password, new_password)
        return jsonify({"user": result})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/me", methods=["DELETE"])
@auth_middleware
def delete_account():
    try:
        user_id = request.user.id
        result = delete_user(user_id)
        return jsonify({"user": result})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/me/api-keys", methods=["GET"])
@auth_middleware
def list_api_keys():
    try:
        user_id = request.user.id
        keys = get_user_api_keys(user_id)
        return jsonify(keys)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/me/api-keys/<provider>", methods=["PUT"])
@auth_middleware
def set_api_key(provider):
    try:
        user_id = request.user.id
        data = request.get_json() or {}
        api_key = data.get("api_key", "").strip()
        if not api_key:
            return jsonify({"error": "api_key is required"}), 400
        result = upsert_user_api_key(user_id, provider, api_key)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/me/api-keys/<provider>", methods=["DELETE"])
@auth_middleware
def remove_api_key(provider):
    try:
        user_id = request.user.id
        delete_user_api_key(user_id, provider)
        return jsonify({"success": True})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500
