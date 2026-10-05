import uuid
from datetime import datetime

from agents_core.models.base import db


class GithubConnection(db.Model):
    __tablename__ = "github_connections"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(
        db.String, db.ForeignKey("users.id"), nullable=False, unique=True
    )
    access_token = db.Column(db.String, nullable=False)
    scope = db.Column(db.String)
    github_user_id = db.Column(db.String)
    github_username = db.Column(db.String)
    github_avatar = db.Column(db.String)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    repos = db.relationship(
        "GithubRepo", backref="connection", lazy=True, cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "githubUsername": self.github_username,
            "githubAvatar": self.github_avatar,
            "scope": self.scope,
            "createdAt": self.created_at.isoformat(),
        }


class GithubRepo(db.Model):
    __tablename__ = "github_repos"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    connection_id = db.Column(
        db.String, db.ForeignKey("github_connections.id"), nullable=False
    )
    github_repo_id = db.Column(db.Integer)
    full_name = db.Column(db.String, nullable=False)
    name = db.Column(db.String, nullable=False)
    owner = db.Column(db.String)
    private = db.Column(db.Boolean, default=False)
    default_branch = db.Column(db.String, default="main")
    description = db.Column(db.Text)
    html_url = db.Column(db.String)
    is_linked = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "githubRepoId": self.github_repo_id,
            "fullName": self.full_name,
            "name": self.name,
            "owner": self.owner,
            "private": self.private,
            "defaultBranch": self.default_branch,
            "description": self.description,
            "htmlUrl": self.html_url,
            "isLinked": self.is_linked,
        }
