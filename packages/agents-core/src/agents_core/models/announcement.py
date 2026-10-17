import uuid
from datetime import datetime

from agents_core.models.base import db


class Announcement(db.Model):
    __tablename__ = "announcements"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = db.Column(db.String, nullable=False)
    body = db.Column(db.Text, nullable=True)
    level = db.Column(db.String, default="info", nullable=False)
    team_id = db.Column(db.String, nullable=True, index=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    starts_at = db.Column(db.DateTime, nullable=True)
    ends_at = db.Column(db.DateTime, nullable=True)
    created_by = db.Column(db.String, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "body": self.body,
            "level": self.level,
            "teamId": self.team_id,
            "isActive": self.is_active,
            "startsAt": self.starts_at.isoformat() if self.starts_at else None,
            "endsAt": self.ends_at.isoformat() if self.ends_at else None,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
