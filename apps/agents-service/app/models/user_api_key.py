import uuid
from datetime import datetime

from app.models.base import db


class UserApiKey(db.Model):
    __tablename__ = "user_api_keys"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(
        db.String, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider = db.Column(db.String, nullable=False)
    encrypted_key = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        db.UniqueConstraint("user_id", "provider", name="uq_user_api_key_provider"),
    )
