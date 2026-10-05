import uuid
from datetime import datetime

from agents_core.models.base import db

SKILL_PLATFORMS = ("desktop", "web", "both")


class UserSkill(db.Model):
    __tablename__ = "user_skills"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String, nullable=False)
    description = db.Column(db.String, default="")
    content = db.Column(db.Text, nullable=False)
    files = db.Column(db.JSON)
    enabled = db.Column(db.Boolean, default=True, nullable=False)
    platform = db.Column(db.String, default="both", nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        db.UniqueConstraint("user_id", "name", name="uq_user_skill_name"),
    )
