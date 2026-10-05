import uuid
from datetime import datetime

from agents_core.models.base import db


class Project(db.Model):
    __tablename__ = "projects"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String, nullable=False)
    description = db.Column(db.Text)
    color = db.Column(db.String(20))
    owner_id = db.Column(db.String, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    project_chats = db.relationship(
        "ProjectChat", backref="project", lazy=True, cascade="all, delete-orphan"
    )
    project_teams = db.relationship(
        "ProjectTeam", backref="project", lazy=True, cascade="all, delete-orphan"
    )


class ProjectChat(db.Model):
    """Associates a chat with a project."""

    __tablename__ = "project_chats"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = db.Column(
        db.String, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    chat_id = db.Column(
        db.String, db.ForeignKey("chats.id", ondelete="CASCADE"), nullable=False
    )
    added_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("project_id", "chat_id", name="unique_project_chat"),
    )


class ProjectTeam(db.Model):
    """Grants a team access to a project."""

    __tablename__ = "project_teams"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = db.Column(
        db.String, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    team_id = db.Column(
        db.String, db.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    added_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("project_id", "team_id", name="unique_project_team"),
    )
