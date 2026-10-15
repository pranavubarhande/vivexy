import uuid
from datetime import datetime

from sqlalchemy import Enum as SQLEnum

from agents_core.models.base import db
from agents_core.models.enums import TeamRole


class Team(db.Model):
    __tablename__ = "teams"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String, nullable=False)
    description = db.Column(db.Text)
    slug = db.Column(db.String, unique=True, nullable=False)
    owner_id = db.Column(db.String, db.ForeignKey("users.id"), nullable=False)
    is_suspended = db.Column(db.Boolean, default=False, nullable=False)
    seat_limit = db.Column(db.Integer, nullable=True)
    monthly_budget_usd = db.Column(db.Float, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relations
    members = db.relationship("TeamMember", backref="team", lazy=True)
    subscriptions = db.relationship("Subscription", backref="team", lazy=True)
    invites = db.relationship("TeamInvite", backref="team", lazy=True)


class TeamMember(db.Model):
    __tablename__ = "team_members"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String, db.ForeignKey("users.id"), nullable=False)
    team_id = db.Column(db.String, db.ForeignKey("teams.id"), nullable=False)
    role = db.Column(SQLEnum(TeamRole), default=TeamRole.MEMBER)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("user_id", "team_id", name="unique_user_team"),
    )


class TeamInvite(db.Model):
    __tablename__ = "team_invites"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String, nullable=False)
    role = db.Column(SQLEnum(TeamRole), default=TeamRole.MEMBER)
    token = db.Column(db.String, unique=True, nullable=False)
    team_id = db.Column(db.String, db.ForeignKey("teams.id"), nullable=False)
    invited_by = db.Column(db.String, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
