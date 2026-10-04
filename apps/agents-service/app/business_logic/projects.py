from datetime import datetime
from typing import Any, Dict, List

from agents_core.models import Chat, Team, db
from agents_core.models.project import Project, ProjectChat, ProjectTeam
from agents_core.schemas.project import ProjectCreate, ProjectUpdate


def _project_to_dict(project: Project) -> Dict[str, Any]:
    chat_count = ProjectChat.query.filter_by(project_id=project.id).count()
    team_count = ProjectTeam.query.filter_by(project_id=project.id).count()
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "color": project.color,
        "ownerId": project.owner_id,
        "createdAt": project.created_at.isoformat(),
        "updatedAt": project.updated_at.isoformat(),
        "_count": {
            "chats": chat_count,
            "teams": team_count,
        },
    }


def _assert_owner(project_id: str, user_id: str) -> Project:
    project = Project.query.filter_by(id=project_id, owner_id=user_id).first()
    if not project:
        raise ValueError("Project not found or access denied")
    return project


def _assert_access(project_id: str, user_id: str) -> Project:
    """Owner or member of a team that has been shared the project."""
    project = Project.query.filter_by(id=project_id).first()
    if not project:
        raise ValueError("Project not found")
    if project.owner_id == user_id:
        return project
    # Check team membership
    shared = (
        ProjectTeam.query.join(Team, Team.id == ProjectTeam.team_id)
        .filter(
            ProjectTeam.project_id == project_id,
            Team.members.any(user_id=user_id),
        )
        .first()
    )
    if not shared:
        raise ValueError("Access denied")
    return project


# ── Projects ──────────────────────────────────────────────────────────────────


def get_user_projects(user_id: str) -> List[Dict[str, Any]]:
    owned = Project.query.filter_by(owner_id=user_id).all()

    shared_ids = (
        db.session.query(ProjectTeam.project_id)
        .join(Team, Team.id == ProjectTeam.team_id)
        .filter(Team.members.any(user_id=user_id))
        .all()
    )
    shared_project_ids = {r[0] for r in shared_ids}

    all_projects = list(owned)
    owned_ids = {p.id for p in owned}
    for pid in shared_project_ids:
        if pid not in owned_ids:
            p = Project.query.get(pid)
            if p:
                all_projects.append(p)

    return [_project_to_dict(p) for p in all_projects]


def get_project(project_id: str, user_id: str) -> Dict[str, Any]:
    project = _assert_access(project_id, user_id)
    return _project_to_dict(project)


def create_project(data: ProjectCreate, owner_id: str) -> Dict[str, Any]:
    project = Project(
        name=data.name,
        description=data.description,
        color=data.color,
        owner_id=owner_id,
    )
    db.session.add(project)
    db.session.commit()
    return _project_to_dict(project)


def update_project(
    project_id: str, data: ProjectUpdate, user_id: str
) -> Dict[str, Any]:
    project = _assert_owner(project_id, user_id)
    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.color is not None:
        project.color = data.color
    project.updated_at = datetime.utcnow()
    db.session.commit()
    return _project_to_dict(project)


def delete_project(project_id: str, user_id: str) -> Dict[str, Any]:
    project = _assert_owner(project_id, user_id)
    db.session.delete(project)
    db.session.commit()
    return {"message": "Project deleted successfully"}


# ── Chats ─────────────────────────────────────────────────────────────────────


def get_project_chats(project_id: str, user_id: str) -> List[Dict[str, Any]]:
    _assert_access(project_id, user_id)
    links = ProjectChat.query.filter_by(project_id=project_id).all()
    chats = []
    for link in links:
        chat = Chat.query.get(link.chat_id)
        if chat:
            chats.append(
                {
                    "id": chat.id,
                    "title": chat.title,
                    "agentId": chat.agent_id,
                    "createdAt": chat.created_at.isoformat(),
                    "updatedAt": chat.updated_at.isoformat(),
                }
            )
    return chats


def add_chat_to_project(project_id: str, chat_id: str, user_id: str) -> Dict[str, Any]:
    _assert_owner(project_id, user_id)
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found or not yours")
    existing = ProjectChat.query.filter_by(
        project_id=project_id, chat_id=chat_id
    ).first()
    if existing:
        raise ValueError("Chat is already in this project")
    link = ProjectChat(project_id=project_id, chat_id=chat_id)
    db.session.add(link)
    db.session.commit()
    return {"message": "Chat added to project"}


def remove_chat_from_project(
    project_id: str, chat_id: str, user_id: str
) -> Dict[str, Any]:
    _assert_owner(project_id, user_id)
    link = ProjectChat.query.filter_by(project_id=project_id, chat_id=chat_id).first()
    if not link:
        raise ValueError("Chat not found in project")
    db.session.delete(link)
    db.session.commit()
    return {"message": "Chat removed from project"}


# ── Team sharing ───────────────────────────────────────────────────────────────


def get_project_teams(project_id: str, user_id: str) -> List[Dict[str, Any]]:
    _assert_access(project_id, user_id)
    links = ProjectTeam.query.filter_by(project_id=project_id).all()
    result = []
    for link in links:
        team = Team.query.get(link.team_id)
        if team:
            result.append(
                {
                    "id": link.id,
                    "projectId": project_id,
                    "teamId": link.team_id,
                    "addedAt": link.added_at.isoformat(),
                    "team": {
                        "id": team.id,
                        "name": team.name,
                        "description": team.description,
                    },
                }
            )
    return result


def share_project_with_team(
    project_id: str, team_id: str, user_id: str
) -> Dict[str, Any]:
    _assert_owner(project_id, user_id)
    team = Team.query.get(team_id)
    if not team:
        raise ValueError("Team not found")
    existing = ProjectTeam.query.filter_by(
        project_id=project_id, team_id=team_id
    ).first()
    if existing:
        raise ValueError("Project already shared with this team")
    link = ProjectTeam(project_id=project_id, team_id=team_id)
    db.session.add(link)
    db.session.commit()
    return {"message": "Project shared with team"}


def revoke_team_access(project_id: str, team_id: str, user_id: str) -> Dict[str, Any]:
    _assert_owner(project_id, user_id)
    link = ProjectTeam.query.filter_by(project_id=project_id, team_id=team_id).first()
    if not link:
        raise ValueError("Team does not have access to this project")
    db.session.delete(link)
    db.session.commit()
    return {"message": "Team access revoked"}
