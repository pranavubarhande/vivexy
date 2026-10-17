"""Client admin panel routes (team OWNER / ADMIN)."""

from agents_core.business_logic.admin import (
    bulk_invite,
    export_team_usage_csv,
    get_administered_teams,
    get_team_audit_logs,
    get_team_members_with_usage,
    get_team_overview,
    list_team_invites,
    remove_member,
    revoke_invite,
    transfer_ownership,
    update_member_role,
    update_team_settings,
    verify_team_domain,
)
from agents_core.middlewares.auth import auth_middleware
from agents_core.schemas import (
    BulkInviteCreate,
    OwnershipTransfer,
    TeamMemberRoleUpdate,
    TeamSettingsUpdate,
)
from agents_core.utils.http import error_response, int_arg
from flask import Blueprint, Response, current_app, jsonify, request

bp = Blueprint("admin", __name__, url_prefix="/admin")


def _fail(error: Exception):
    if not isinstance(error, (ValueError, PermissionError, LookupError)):
        current_app.logger.exception("Admin request failed")
    return error_response(error)


@bp.route("/teams", methods=["GET"])
@auth_middleware
def list_admin_teams():
    """List teams the caller can administer.
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    responses:
      200:
        description: Teams where the caller is OWNER or ADMIN
    """
    try:
        return jsonify({"teams": get_administered_teams(request.user)})
    except Exception as e:
        return _fail(e)


@bp.route("/teams/<team_id>/overview", methods=["GET"])
@auth_middleware
def team_overview(team_id):
    """Team KPIs, spend and daily usage.
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: team_id
        type: string
        required: true
      - in: query
        name: days
        type: integer
        default: 30
    responses:
      200:
        description: Team overview
      403:
        description: Not a team owner/admin
    """
    try:
        days = int_arg("days", 30)
        return jsonify(get_team_overview(team_id, request.user, days))
    except Exception as e:
        return _fail(e)


@bp.route("/teams/<team_id>/members", methods=["GET"])
@auth_middleware
def team_members(team_id):
    """Members with per-member usage.
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: team_id
        type: string
        required: true
      - in: query
        name: days
        type: integer
        default: 30
    responses:
      200:
        description: Members
    """
    try:
        days = int_arg("days", 30)
        members = get_team_members_with_usage(team_id, request.user, days)
        return jsonify({"members": members})
    except Exception as e:
        return _fail(e)


@bp.route("/teams/<team_id>/members/<user_id>", methods=["PATCH"])
@auth_middleware
def change_member_role(team_id, user_id):
    """Change a member's team role (owner only).
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            role:
              type: string
              enum: [ADMIN, MEMBER]
    responses:
      200:
        description: Role updated
    """
    try:
        payload = TeamMemberRoleUpdate(**(request.get_json() or {}))
        return jsonify(update_member_role(team_id, user_id, payload, request.user))
    except Exception as e:
        return _fail(e)


@bp.route("/teams/<team_id>/transfer-ownership", methods=["POST"])
@auth_middleware
def transfer_team_ownership(team_id):
    """Hand the team to another member (owner only); you become an admin.
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            userId:
              type: string
    responses:
      200:
        description: Ownership transferred
    """
    try:
        payload = OwnershipTransfer(**(request.get_json() or {}))
        return jsonify(transfer_ownership(team_id, payload.user_id, request.user))
    except Exception as e:
        return _fail(e)


@bp.route("/teams/<team_id>/domain/verify", methods=["POST"])
@auth_middleware
def verify_domain(team_id):
    """Verify the team's email domain by checking its DNS TXT record.
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    responses:
      200:
        description: Domain verified
      400:
        description: Record not found yet
    """
    try:
        return jsonify(verify_team_domain(team_id, request.user))
    except Exception as e:
        return _fail(e)


@bp.route("/teams/<team_id>/members/<user_id>", methods=["DELETE"])
@auth_middleware
def delete_member(team_id, user_id):
    """Remove a member from the team.
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    responses:
      200:
        description: Member removed
    """
    try:
        return jsonify(remove_member(team_id, user_id, request.user))
    except Exception as e:
        return _fail(e)


@bp.route("/teams/<team_id>/invites", methods=["GET"])
@auth_middleware
def team_invites(team_id):
    """List pending and expired invites.
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    responses:
      200:
        description: Invites
    """
    try:
        return jsonify({"invites": list_team_invites(team_id, request.user)})
    except Exception as e:
        return _fail(e)


@bp.route("/teams/<team_id>/invites/<invite_id>", methods=["DELETE"])
@auth_middleware
def delete_invite(team_id, invite_id):
    """Revoke an invite.
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    responses:
      200:
        description: Invite revoked
    """
    try:
        return jsonify(revoke_invite(team_id, invite_id, request.user))
    except Exception as e:
        return _fail(e)


@bp.route("/teams/<team_id>/settings", methods=["PATCH"])
@auth_middleware
def team_settings(team_id):
    """Update team admin settings (monthly budget).
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            monthlyBudgetUsd:
              type: number
    responses:
      200:
        description: Settings updated
    """
    try:
        payload = TeamSettingsUpdate(**(request.get_json() or {}))
        return jsonify(update_team_settings(team_id, payload, request.user))
    except Exception as e:
        return _fail(e)


@bp.route("/teams/<team_id>/audit-logs", methods=["GET"])
@auth_middleware
def team_audit_logs(team_id):
    """Audit log for this team.
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: page
        type: integer
        default: 1
      - in: query
        name: pageSize
        type: integer
        default: 50
    responses:
      200:
        description: Paginated audit log
    """
    try:
        page = int_arg("page", 1, maximum=10_000)
        page_size = int_arg("pageSize", 50, maximum=100)
        return jsonify(get_team_audit_logs(team_id, request.user, page, page_size))
    except Exception as e:
        return _fail(e)


@bp.route("/teams/<team_id>/invites/bulk", methods=["POST"])
@auth_middleware
def team_bulk_invite(team_id):
    """Invite many people at once (e.g. from a CSV).
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            emails:
              type: array
              items:
                type: string
            role:
              type: string
              enum: [ADMIN, MEMBER]
    responses:
      200:
        description: Lists of added, invited and skipped emails
    """
    try:
        payload = BulkInviteCreate(**(request.get_json() or {}))
        return jsonify(bulk_invite(team_id, payload, request.user))
    except Exception as e:
        return _fail(e)


@bp.route("/teams/<team_id>/usage/export", methods=["GET"])
@auth_middleware
def team_usage_export(team_id):
    """Download team usage as CSV.
    ---
    tags:
      - Admin
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: days
        type: integer
        default: 30
    produces:
      - text/csv
    responses:
      200:
        description: CSV file
    """
    try:
        days = int_arg("days", 30)
        csv_content = export_team_usage_csv(team_id, request.user, days)
        return Response(
            csv_content,
            mimetype="text/csv",
            headers={
                "Content-Disposition": (f"attachment; filename=team-usage-{days}d.csv")
            },
        )
    except Exception as e:
        return _fail(e)
