from agents_core.schemas import (
    ProjectChatAdd,
    ProjectCreate,
    ProjectTeamShare,
    ProjectUpdate,
)
from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from app.business_logic.projects import (
    add_chat_to_project,
    create_project,
    delete_project,
    get_project,
    get_project_chats,
    get_project_teams,
    get_user_projects,
    remove_chat_from_project,
    revoke_team_access,
    share_project_with_team,
    update_project,
)
from app.middlewares.auth import auth_middleware

bp = Blueprint("projects", __name__, url_prefix="/projects")


@bp.route("/unassigned-chats", methods=["GET"])
@auth_middleware
def get_unassigned_chats():
    """Return the current user's chats that are not in any project."""
    try:
        from agents_core.models.chat import Chat as ChatModel
        from agents_core.models.project import ProjectChat

        user = request.user
        assigned_ids = [pc.chat_id for pc in ProjectChat.query.all()]
        q = ChatModel.query.filter_by(user_id=user.id)
        if assigned_ids:
            q = q.filter(~ChatModel.id.in_(assigned_ids))
        chats = q.order_by(ChatModel.created_at.desc()).all()
        return jsonify(
            {
                "chats": [
                    {
                        "id": c.id,
                        "title": c.title,
                        "agentId": c.agent_id,
                        "createdAt": c.created_at.isoformat(),
                        "updatedAt": c.updated_at.isoformat(),
                    }
                    for c in chats
                ]
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("", methods=["GET"])
@auth_middleware
def list_projects():
    try:
        projects = get_user_projects(request.user.id)
        return jsonify({"projects": projects})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("", methods=["POST"])
@auth_middleware
def create_new_project():
    try:
        data = ProjectCreate(**request.get_json())
        project = create_project(data, request.user.id)
        return jsonify({"project": project}), 201
    except ValidationError as e:
        return jsonify({"error": "Invalid input", "details": e.errors()}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<project_id>", methods=["GET"])
@auth_middleware
def get_project_detail(project_id):
    try:
        project = get_project(project_id, request.user.id)
        return jsonify({"project": project})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<project_id>", methods=["PATCH"])
@auth_middleware
def update_project_detail(project_id):
    try:
        data = ProjectUpdate(**request.get_json())
        project = update_project(project_id, data, request.user.id)
        return jsonify({"project": project})
    except ValidationError as e:
        return jsonify({"error": "Invalid input", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<project_id>", methods=["DELETE"])
@auth_middleware
def delete_project_endpoint(project_id):
    try:
        result = delete_project(project_id, request.user.id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Chats ─────────────────────────────────────────────────────────────────────


@bp.route("/<project_id>/chats", methods=["GET"])
@auth_middleware
def list_project_chats(project_id):
    try:
        chats = get_project_chats(project_id, request.user.id)
        return jsonify({"chats": chats})
    except ValueError as e:
        return jsonify({"error": str(e)}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<project_id>/chats", methods=["POST"])
@auth_middleware
def add_chat(project_id):
    try:
        data = ProjectChatAdd(**request.get_json())
        result = add_chat_to_project(project_id, data.chat_id, request.user.id)
        return jsonify(result), 201
    except ValidationError as e:
        return jsonify({"error": "Invalid input", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<project_id>/chats/<chat_id>", methods=["DELETE"])
@auth_middleware
def remove_chat(project_id, chat_id):
    try:
        result = remove_chat_from_project(project_id, chat_id, request.user.id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Team sharing ───────────────────────────────────────────────────────────────


@bp.route("/<project_id>/teams", methods=["GET"])
@auth_middleware
def list_project_teams(project_id):
    try:
        teams = get_project_teams(project_id, request.user.id)
        return jsonify({"teams": teams})
    except ValueError as e:
        return jsonify({"error": str(e)}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<project_id>/teams", methods=["POST"])
@auth_middleware
def share_with_team(project_id):
    try:
        data = ProjectTeamShare(**request.get_json())
        result = share_project_with_team(project_id, data.team_id, request.user.id)
        return jsonify(result), 201
    except ValidationError as e:
        return jsonify({"error": "Invalid input", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<project_id>/teams/<team_id>", methods=["DELETE"])
@auth_middleware
def revoke_team(project_id, team_id):
    try:
        result = revoke_team_access(project_id, team_id, request.user.id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500
