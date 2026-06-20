import uuid
from datetime import datetime

from app.models.base import db


class DeployedAgent(db.Model):
    __tablename__ = "deployed_agents"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String, db.ForeignKey("users.id"), nullable=False)
    agent_id = db.Column(db.String, nullable=False)
    deployed_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("user_id", "agent_id", name="uq_user_deployed_agent"),
    )
