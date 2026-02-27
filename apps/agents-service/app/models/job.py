import uuid
from datetime import datetime

from app.models.base import db


class Job(db.Model):
    __tablename__ = "jobs"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String, nullable=False)
    analysis_prompt = db.Column(db.Text)
    run_at_time = db.Column(db.String, default="01:00")
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relations
    job_stocks = db.relationship("JobStock", backref="job", lazy=True)


class JobStock(db.Model):
    __tablename__ = "job_stocks"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = db.Column(db.String, db.ForeignKey("jobs.id"), nullable=False)
    stock_id = db.Column(db.String, db.ForeignKey("stocks.id"), nullable=False)
    analysis = db.Column(db.JSON)
    last_run_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        db.UniqueConstraint("job_id", "stock_id", name="unique_job_stock"),
    )
