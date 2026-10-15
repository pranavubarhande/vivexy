"""Platform operator routes. Every endpoint requires User.role == SUPER_ADMIN."""

from agents_core.business_logic.superadmin import (
    get_client_detail,
    get_platform_audit_logs,
    get_platform_overview,
    get_platform_usage,
    get_user_detail,
    list_clients,
    list_users,
    update_client,
    update_user,
)
from agents_core.middlewares.auth import superadmin_required
from agents_core.models import Role
from agents_core.schemas import ClientUpdate, PlatformUserUpdate
from agents_core.utils.http import bool_arg, error_response, int_arg
from flask import Blueprint, current_app, jsonify, request

bp = Blueprint("superadmin", __name__, url_prefix="/superadmin")


def _fail(error: Exception):
    if not isinstance(error, (ValueError, PermissionError, LookupError)):
        current_app.logger.exception("Superadmin request failed")
    return error_response(error)


def _page_args():
    return int_arg("page", 1, maximum=10_000), int_arg("pageSize", 25, maximum=100)


@bp.route("/overview", methods=["GET"])
@superadmin_required
def overview():
    """Platform-wide KPIs.
    ---
    tags:
      - Superadmin
    security:
      - BearerAuth: []
    responses:
      200:
        description: Users, clients, activity, spend and plan mix
      403:
        description: Superadmin access required
    """
    try:
        return jsonify(get_platform_overview())
    except Exception as e:
        return _fail(e)


@bp.route("/usage", methods=["GET"])
@superadmin_required
def usage():
    """Platform daily usage and model mix.
    ---
    tags:
      - Superadmin
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: days
        type: integer
        default: 30
    responses:
      200:
        description: Daily series and per-model breakdown
    """
    try:
        return jsonify(get_platform_usage(int_arg("days", 30)))
    except Exception as e:
        return _fail(e)


@bp.route("/clients", methods=["GET"])
@superadmin_required
def clients():
    """Paginated client (team) list.
    ---
    tags:
      - Superadmin
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: search
        type: string
      - in: query
        name: suspended
        type: boolean
      - in: query
        name: page
        type: integer
      - in: query
        name: pageSize
        type: integer
      - in: query
        name: days
        type: integer
    responses:
      200:
        description: Clients
    """
    try:
        page, page_size = _page_args()
        return jsonify(
            list_clients(
                search=request.args.get("search"),
                suspended=bool_arg("suspended"),
                page=page,
                page_size=page_size,
                days=int_arg("days", 30),
            )
        )
    except Exception as e:
        return _fail(e)


@bp.route("/clients/<team_id>", methods=["GET"])
@superadmin_required
def client_detail(team_id):
    """Client detail: members, invites, usage, notes.
    ---
    tags:
      - Superadmin
    security:
      - BearerAuth: []
    responses:
      200:
        description: Client detail
      404:
        description: Not found
    """
    try:
        return jsonify(get_client_detail(team_id, int_arg("days", 30)))
    except Exception as e:
        return _fail(e)


@bp.route("/clients/<team_id>", methods=["PATCH"])
@superadmin_required
def client_update(team_id):
    """Suspend a client, set its seat limit or notes.
    ---
    tags:
      - Superadmin
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        schema:
          type: object
          properties:
            isSuspended:
              type: boolean
            seatLimit:
              type: integer
            notes:
              type: string
    responses:
      200:
        description: Updated client detail
    """
    try:
        payload = ClientUpdate(**(request.get_json() or {}))
        return jsonify(update_client(team_id, payload, request.user))
    except Exception as e:
        return _fail(e)


@bp.route("/users", methods=["GET"])
@superadmin_required
def users():
    """Paginated platform user list.
    ---
    tags:
      - Superadmin
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: search
        type: string
      - in: query
        name: role
        type: string
        enum: [USER, ADMIN, SUPER_ADMIN]
      - in: query
        name: suspended
        type: boolean
    responses:
      200:
        description: Users
    """
    try:
        page, page_size = _page_args()
        role_value = request.args.get("role")
        role = Role(role_value) if role_value else None
        return jsonify(
            list_users(
                search=request.args.get("search"),
                role=role,
                suspended=bool_arg("suspended"),
                page=page,
                page_size=page_size,
                days=int_arg("days", 30),
            )
        )
    except Exception as e:
        return _fail(e)


@bp.route("/users/<user_id>", methods=["GET"])
@superadmin_required
def user_detail(user_id):
    """User detail: teams, usage, chats.
    ---
    tags:
      - Superadmin
    security:
      - BearerAuth: []
    responses:
      200:
        description: User detail
    """
    try:
        return jsonify(get_user_detail(user_id, int_arg("days", 30)))
    except Exception as e:
        return _fail(e)


@bp.route("/users/<user_id>", methods=["PATCH"])
@superadmin_required
def user_update(user_id):
    """Suspend a user or change their platform role.
    ---
    tags:
      - Superadmin
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        schema:
          type: object
          properties:
            isSuspended:
              type: boolean
            role:
              type: string
              enum: [USER, ADMIN, SUPER_ADMIN]
    responses:
      200:
        description: Updated user detail
    """
    try:
        payload = PlatformUserUpdate(**(request.get_json() or {}))
        return jsonify(update_user(user_id, payload, request.user))
    except Exception as e:
        return _fail(e)


@bp.route("/audit-logs", methods=["GET"])
@superadmin_required
def audit_logs():
    """Platform-wide audit log.
    ---
    tags:
      - Superadmin
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: teamId
        type: string
      - in: query
        name: action
        type: string
    responses:
      200:
        description: Paginated audit log
    """
    try:
        page = int_arg("page", 1, maximum=10_000)
        page_size = int_arg("pageSize", 50, maximum=100)
        return jsonify(
            get_platform_audit_logs(
                team_id=request.args.get("teamId"),
                action=request.args.get("action"),
                page=page,
                page_size=page_size,
            )
        )
    except Exception as e:
        return _fail(e)
