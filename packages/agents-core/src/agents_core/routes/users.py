from agents_core.business_logic.api_keys import (
    delete_user_api_key,
    get_user_api_keys,
    upsert_user_api_key,
)
from agents_core.business_logic.data_lifecycle import erase_user, export_user_data
from agents_core.business_logic.features import require_feature, user_features
from agents_core.business_logic.users import (
    get_user_profile,
    update_user_password,
    update_user_profile,
)
from agents_core.constants.features import FEATURE_API_KEYS
from agents_core.middlewares.auth import auth_middleware
from flask import Blueprint, jsonify, request

bp = Blueprint("users", __name__, url_prefix="/users")


@bp.route("/me", methods=["GET"])
@auth_middleware
def get_profile():
    """Get authenticated user's profile.
    ---
    tags:
      - Users
    security:
      - BearerAuth: []
    responses:
      200:
        description: User profile data
      401:
        description: Unauthorized
      404:
        description: User not found
    """
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
    """Update authenticated user's profile.
    ---
    tags:
      - Users
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            name:
              type: string
              example: Updated Name
            email:
              type: string
              example: newemail@example.com
    responses:
      200:
        description: Profile updated
        schema:
          type: object
          properties:
            user:
              type: object
      400:
        description: No valid fields or validation error
      401:
        description: Unauthorized
    """
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
    """Update authenticated user's password.
    ---
    tags:
      - Users
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - current_password
            - new_password
          properties:
            current_password:
              type: string
              example: oldpass123
            new_password:
              type: string
              example: newpass456
    responses:
      200:
        description: Password updated
        schema:
          type: object
          properties:
            user:
              type: object
      400:
        description: Validation error or incorrect current password
      401:
        description: Unauthorized
    """
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
    """Delete authenticated user's account.
    ---
    tags:
      - Users
    security:
      - BearerAuth: []
    responses:
      200:
        description: Account deleted
      401:
        description: Unauthorized
      404:
        description: User not found
    """
    try:
        user = request.user
        result = erase_user(user.id, user, allow_self=True)
        return jsonify({"user": result})
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/me/features", methods=["GET"])
@auth_middleware
def my_features():
    """Features available to the caller after their teams' feature flags.
    ---
    tags:
      - Users
    security:
      - BearerAuth: []
    responses:
      200:
        description: Map of feature name to enabled
    """
    try:
        return jsonify({"features": user_features(request.user.id)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/me/api-keys", methods=["GET"])
@auth_middleware
def list_api_keys():
    """List all API keys for the authenticated user.
    ---
    tags:
      - Users
    security:
      - BearerAuth: []
    responses:
      200:
        description: List of API keys (masked)
        schema:
          type: array
          items:
            type: object
      401:
        description: Unauthorized
    """
    try:
        user_id = request.user.id
        keys = get_user_api_keys(user_id)
        return jsonify(keys)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/me/api-keys/<provider>", methods=["PUT"])
@auth_middleware
@require_feature(FEATURE_API_KEYS)
def set_api_key(provider):
    """Set or update an API key for a specific provider.
    ---
    tags:
      - Users
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: provider
        type: string
        required: true
        description: Provider name (e.g. openai, anthropic, google)
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - api_key
          properties:
            api_key:
              type: string
              example: sk-xxxxxxxxxxxxx
    responses:
      200:
        description: API key saved
      400:
        description: Missing api_key or invalid provider
      401:
        description: Unauthorized
    """
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
    """Remove an API key for a specific provider.
    ---
    tags:
      - Users
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: provider
        type: string
        required: true
        description: Provider name to remove
    responses:
      200:
        description: API key removed
        schema:
          type: object
          properties:
            success:
              type: boolean
      401:
        description: Unauthorized
      404:
        description: API key not found for provider
    """
    try:
        user_id = request.user.id
        delete_user_api_key(user_id, provider)
        return jsonify({"success": True})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/me/export", methods=["GET"])
@auth_middleware
def export_my_data():
    """Download a copy of your data (profile, teams, chats, usage).
    ---
    tags:
      - Users
    security:
      - BearerAuth: []
    responses:
      200:
        description: JSON export
    """
    try:
        return jsonify(export_user_data(request.user.id))
    except Exception as e:
        return jsonify({"error": str(e)}), 500
