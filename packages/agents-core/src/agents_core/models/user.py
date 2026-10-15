import uuid
from datetime import datetime

from sqlalchemy import Enum as SQLEnum

from agents_core.models.base import db
from agents_core.models.enums import Role


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String, unique=True, nullable=False)
    name = db.Column(db.String)
    password = db.Column(db.String, nullable=True)
    role = db.Column(SQLEnum(Role), default=Role.USER)
    avatar = db.Column(db.String)
    email_verified = db.Column(db.Boolean, default=False, nullable=False)
    oauth_provider = db.Column(db.String, nullable=True)
    oauth_subject_id = db.Column(db.String, nullable=True)
    is_suspended = db.Column(db.Boolean, default=False, nullable=False)
    last_login_at = db.Column(db.DateTime, nullable=True)
    deleted_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relations
    owned_teams = db.relationship(
        "Team", backref="owner", lazy=True, foreign_keys="Team.owner_id"
    )
    team_memberships = db.relationship("TeamMember", backref="user", lazy=True)
    subscriptions = db.relationship("Subscription", backref="user", lazy=True)
    invoices = db.relationship("Invoice", backref="user", lazy=True)
    jobs = db.relationship("Job", backref="user", lazy=True)
    chats = db.relationship("Chat", backref="user", lazy=True)
    skills = db.relationship("UserSkill", backref="user", lazy=True)
