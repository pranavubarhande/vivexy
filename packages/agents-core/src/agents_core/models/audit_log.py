import uuid
from datetime import datetime

from agents_core.models.base import db


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id = db.Column(db.String, nullable=True, index=True)
    actor_email = db.Column(db.String, nullable=True)
    action = db.Column(db.String, nullable=False, index=True)
    target_type = db.Column(db.String, nullable=False)
    target_id = db.Column(db.String, nullable=True)
    team_id = db.Column(db.String, nullable=True, index=True)
    details = db.Column(db.JSON, nullable=True)
    ip_address = db.Column(db.String, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "actorId": self.actor_id,
            "actorEmail": self.actor_email,
            "action": self.action,
            "targetType": self.target_type,
            "targetId": self.target_id,
            "teamId": self.team_id,
            "details": self.details or {},
            "ipAddress": self.ip_address,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
