from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from app.business_logic.teams import (
    add_team_member,
    create_team,
    delete_team,
    get_team,
    get_team_members,
    get_user_teams,
    remove_team_member,
    update_team,
)
from app.middlewares.auth import auth_middleware
from app.schemas import TeamCreate, TeamMemberCreate, TeamUpdate

bp = Blueprint("teams", __name__, url_prefix="/teams")


@bp.route("", methods=["GET"])
@auth_middleware
def list_teams():
    """Get all teams for the authenticated user."""
    try:
        user = request.user
        teams = get_user_teams(user.id)
        return jsonify({"teams": teams})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("", methods=["POST"])
@auth_middleware
def create_new_team():
    """Create a new team."""
    try:
        user = request.user
        data = request.get_json()
        team_data = TeamCreate(**data)
        team = create_team(team_data, user.id)
        return jsonify({"team": team, "message": "Team created successfully"}), 201
    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<team_id>", methods=["GET"])
@auth_middleware
def get_team_details(team_id):
    """Get a specific team."""
    try:
        user = request.user
        team = get_team(team_id, user.id)
        return jsonify({"team": team})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<team_id>", methods=["PATCH"])
@auth_middleware
def update_team_details(team_id):
    """Update a team."""
    try:
        user = request.user
        data = request.get_json()
        team_data = TeamUpdate(**data)
        team = update_team(team_id, team_data, user.id)
        return jsonify({"team": team, "message": "Team updated successfully"})
    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<team_id>", methods=["DELETE"])
@auth_middleware
def delete_team_endpoint(team_id):
    """Delete a team."""
    try:
        user = request.user
        result = delete_team(team_id, user.id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<team_id>/members", methods=["GET"])
@auth_middleware
def list_members(team_id):
    """Get team members."""
    try:
        user = request.user
        members = get_team_members(team_id, user.id)
        return jsonify({"members": members})
    except ValueError as e:
        return jsonify({"error": str(e)}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<team_id>/members", methods=["POST"])
@auth_middleware
def add_member(team_id):
    """Add a member to the team."""
    try:
        user = request.user
        data = request.get_json()
        member_data = TeamMemberCreate(**data)
        result = add_team_member(team_id, member_data, user.id)
        return jsonify(result), 201
    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<team_id>/members/<user_id>", methods=["DELETE"])
@auth_middleware
def remove_member(team_id, user_id):
    """Remove a member from the team."""
    try:
        requester = request.user
        result = remove_team_member(team_id, user_id, requester.id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
