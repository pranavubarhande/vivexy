from agents_core.business_logic.teams import (
    add_team_member,
    create_team,
    delete_team,
    get_team,
    get_team_features,
    get_team_members,
    get_user_teams,
    remove_team_member,
    update_team,
)
from agents_core.middlewares.auth import auth_middleware
from agents_core.schemas import TeamCreate, TeamMemberCreate, TeamUpdate
from flask import Blueprint, jsonify, request
from pydantic import ValidationError

bp = Blueprint("teams", __name__, url_prefix="/teams")


@bp.route("", methods=["GET"])
@auth_middleware
def list_teams():
    """Get all teams for the authenticated user.
    ---
    tags:
      - Teams
    security:
      - BearerAuth: []
    responses:
      200:
        description: List of teams
        schema:
          type: object
          properties:
            teams:
              type: array
              items:
                type: object
      401:
        description: Unauthorized
    """
    try:
        user = request.user
        teams = get_user_teams(user.id)
        return jsonify({"teams": teams})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("", methods=["POST"])
@auth_middleware
def create_new_team():
    """Create a new team.
    ---
    tags:
      - Teams
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - name
          properties:
            name:
              type: string
              example: Engineering Team
            description:
              type: string
              example: Backend engineering squad
    responses:
      201:
        description: Team created
        schema:
          type: object
          properties:
            team:
              type: object
            message:
              type: string
      400:
        description: Validation error
      401:
        description: Unauthorized
    """
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
    """Get a specific team.
    ---
    tags:
      - Teams
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: team_id
        type: string
        required: true
    responses:
      200:
        description: Team details
        schema:
          type: object
          properties:
            team:
              type: object
      401:
        description: Unauthorized
      404:
        description: Team not found
    """
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
    """Update a team.
    ---
    tags:
      - Teams
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: team_id
        type: string
        required: true
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            name:
              type: string
            description:
              type: string
    responses:
      200:
        description: Team updated
      400:
        description: Validation error
      401:
        description: Unauthorized
      403:
        description: Not team owner
    """
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
    """Delete a team.
    ---
    tags:
      - Teams
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: team_id
        type: string
        required: true
    responses:
      200:
        description: Team deleted
      401:
        description: Unauthorized
      403:
        description: Not team owner
    """
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
    """Get team members.
    ---
    tags:
      - Teams
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: team_id
        type: string
        required: true
    responses:
      200:
        description: List of team members
        schema:
          type: object
          properties:
            members:
              type: array
              items:
                type: object
      401:
        description: Unauthorized
      403:
        description: Not a team member
    """
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
    """Add a member to the team.
    ---
    tags:
      - Teams
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: team_id
        type: string
        required: true
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - email
          properties:
            email:
              type: string
              example: member@example.com
            role:
              type: string
              example: member
    responses:
      201:
        description: Member added
      400:
        description: Validation error or already a member
      401:
        description: Unauthorized
    """
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
    """Remove a member from the team.
    ---
    tags:
      - Teams
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: team_id
        type: string
        required: true
      - in: path
        name: user_id
        type: string
        required: true
    responses:
      200:
        description: Member removed
      400:
        description: Cannot remove yourself or invalid request
      401:
        description: Unauthorized
    """
    try:
        requester = request.user
        result = remove_team_member(team_id, user_id, requester.id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<team_id>/features", methods=["GET"])
@auth_middleware
def team_features(team_id):
    """Feature flags enabled for a team (visible to its members).
    ---
    tags:
      - Teams
    security:
      - BearerAuth: []
    responses:
      200:
        description: Map of feature flag name to enabled
      403:
        description: Not a team member
    """
    try:
        return jsonify({"features": get_team_features(team_id, request.user.id)})
    except ValueError as e:
        return jsonify({"error": str(e)}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500
