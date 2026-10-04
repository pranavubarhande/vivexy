import uuid
from datetime import datetime

from agents_core.models.base import db


def _utc(dt: datetime | None) -> str | None:
    """Serialize a naive UTC datetime to an ISO-8601 string with Z suffix.
    Without Z, JavaScript's Date() treats the string as local time and
    displays tasks as overdue for users in timezones ahead of UTC.
    """
    return (dt.isoformat() + "Z") if dt else None


class ScheduledTask(db.Model):
    __tablename__ = "scheduled_tasks"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String, db.ForeignKey("users.id"), nullable=False)

    name = db.Column(db.String, nullable=False)
    prompt = db.Column(db.Text, nullable=False)

    # schedule_type: 'once' | 'daily' | 'weekly' | 'cron'
    schedule_type = db.Column(db.String, nullable=False, default="once")
    scheduled_at = db.Column(db.DateTime)  # one-time: fire at this UTC datetime
    run_time = db.Column(db.String)  # "HH:MM" UTC for daily / weekly
    run_days = db.Column(db.JSON)  # [0-6] Mon=0 for weekly
    cron_expression = db.Column(db.String)  # raw cron for schedule_type='cron'
    timezone = db.Column(db.String, default="UTC")

    # Chat config
    agent_id = db.Column(db.String)
    model_db_id = db.Column(db.String)
    model_api_id = db.Column(db.String)
    model_provider = db.Column(db.String)
    model_name = db.Column(db.String)

    # Attachments: list of ChatAttachment IDs pre-uploaded to S3
    file_ids = db.Column(db.JSON, default=list)

    # Optional GitHub / workspace context
    github_context = db.Column(db.JSON)

    is_active = db.Column(db.Boolean, default=True, nullable=False)
    next_run_at = db.Column(db.DateTime)
    last_run_at = db.Column(db.DateTime)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    runs = db.relationship(
        "ScheduledTaskRun",
        backref="task",
        lazy=True,
        order_by="ScheduledTaskRun.ran_at.desc()",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "prompt": self.prompt,
            "schedule_type": self.schedule_type,
            "scheduled_at": _utc(self.scheduled_at),
            "run_time": self.run_time,
            "run_days": self.run_days,
            "cron_expression": self.cron_expression,
            "timezone": self.timezone,
            "agent_id": self.agent_id,
            "model_db_id": self.model_db_id,
            "model_api_id": self.model_api_id,
            "model_provider": self.model_provider,
            "model_name": self.model_name,
            "file_ids": self.file_ids or [],
            "github_context": self.github_context,
            "is_active": self.is_active,
            "next_run_at": _utc(self.next_run_at),
            "last_run_at": _utc(self.last_run_at),
            "created_at": _utc(self.created_at),
            "updated_at": _utc(self.updated_at),
        }


class ScheduledTaskRun(db.Model):
    __tablename__ = "scheduled_task_runs"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = db.Column(db.String, db.ForeignKey("scheduled_tasks.id"), nullable=False)
    chat_id = db.Column(db.String, db.ForeignKey("chats.id"), nullable=True)

    # 'running' | 'completed' | 'failed'
    status = db.Column(db.String, nullable=False, default="running")
    error = db.Column(db.Text)
    ran_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "chat_id": self.chat_id,
            "status": self.status,
            "error": self.error,
            "ran_at": _utc(self.ran_at),
            "completed_at": _utc(self.completed_at),
        }
