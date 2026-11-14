import uuid
from datetime import datetime

from agents_core.constants.prompts import PROMPT_VISIBILITY_PERSONAL
from agents_core.models.base import db


class Prompt(db.Model):
    """A saved prompt with fill-in fields. Personal prompts belong to their
    owner; team prompts are shared with every member and managed by admins."""

    __tablename__ = "prompts"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = db.Column(
        db.String, db.ForeignKey("teams.id", ondelete="CASCADE"), nullable=True
    )
    owner_id = db.Column(
        db.String, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    visibility = db.Column(
        db.String(20), nullable=False, default=PROMPT_VISIBILITY_PERSONAL
    )
    title = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(64), nullable=True)
    body = db.Column(db.Text, nullable=False)
    fields = db.Column(db.JSON, nullable=False, default=list)
    use_count = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        db.Index("ix_prompts_team_visibility", "team_id", "visibility"),
        db.Index("ix_prompts_owner", "owner_id"),
    )
