"""
Usage / cost tracking API routes.
"""

from flask import Blueprint, jsonify, request

from app.business_logic.usage import (
    get_daily_usage,
    get_recent_usage,
    get_usage_by_model,
    get_usage_summary,
)
from app.middlewares.auth import auth_middleware

bp = Blueprint("usage", __name__, url_prefix="/usage")


@bp.route("/summary", methods=["GET"])
@auth_middleware
def summary():
    """Return token usage summary for the authenticated user.
    ---
    tags:
      - Usage
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: days
        type: integer
        default: 30
        description: Number of days to look back
    responses:
      200:
        description: Usage summary
    """
    try:
        days = int(request.args.get("days", 30))
        user_id = request.user.id
        return jsonify(get_usage_summary(user_id, days=days))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/by-model", methods=["GET"])
@auth_middleware
def by_model():
    """Return per-model token and cost breakdown.
    ---
    tags:
      - Usage
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: days
        type: integer
        default: 30
    responses:
      200:
        description: Per-model breakdown list
    """
    try:
        days = int(request.args.get("days", 30))
        user_id = request.user.id
        return jsonify(get_usage_by_model(user_id, days=days))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/daily", methods=["GET"])
@auth_middleware
def daily():
    """Return daily token and cost totals.
    ---
    tags:
      - Usage
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: days
        type: integer
        default: 30
    responses:
      200:
        description: Daily usage list
    """
    try:
        days = int(request.args.get("days", 30))
        user_id = request.user.id
        return jsonify(get_daily_usage(user_id, days=days))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/recent", methods=["GET"])
@auth_middleware
def recent():
    """Return most recent usage records.
    ---
    tags:
      - Usage
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: limit
        type: integer
        default: 50
    responses:
      200:
        description: Recent usage records
    """
    try:
        limit = int(request.args.get("limit", 50))
        user_id = request.user.id
        return jsonify(get_recent_usage(user_id, limit=limit))
    except Exception as e:
        return jsonify({"error": str(e)}), 500
