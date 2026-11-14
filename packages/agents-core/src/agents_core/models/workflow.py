import uuid
from datetime import datetime

from agents_core.constants.workflows import (
    STEP_STATUS_PENDING,
    WORKFLOW_STATUS_QUEUED,
)
from agents_core.models.base import db


class WorkflowRun(db.Model):
    """One run of a guided workflow. Like an analysis, it lives in the team
    and scope of its documents, so whoever can read them can read the run."""

    __tablename__ = "workflow_runs"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = db.Column(
        db.String, db.ForeignKey("teams.id", ondelete="CASCADE"), nullable=True
    )
    owner_id = db.Column(
        db.String, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    scope_type = db.Column(db.String(64), nullable=True)
    scope_id = db.Column(db.String(128), nullable=True)
    workflow_key = db.Column(db.String(100), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), nullable=False, default=WORKFLOW_STATUS_QUEUED)
    inputs = db.Column(db.JSON, nullable=False, default=dict)
    document_ids = db.Column(db.JSON, nullable=False, default=list)
    model_id = db.Column(
        db.String, db.ForeignKey("llm_models.id", ondelete="SET NULL"), nullable=True
    )
    error = db.Column(db.Text, nullable=True)
    input_tokens = db.Column(db.Integer, nullable=False, default=0)
    output_tokens = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    completed_at = db.Column(db.DateTime, nullable=True)

    steps = db.relationship(
        "WorkflowRunStep",
        backref="run",
        lazy=True,
        cascade="all, delete-orphan",
        order_by="WorkflowRunStep.position",
    )

    __table_args__ = (
        db.Index("ix_workflow_runs_scope", "team_id", "scope_type", "scope_id"),
        db.Index("ix_workflow_runs_owner", "owner_id"),
    )


class WorkflowRunStep(db.Model):
    """The saved output of one step. Editing it marks the steps after it to
    run again."""

    __tablename__ = "workflow_run_steps"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = db.Column(
        db.String,
        db.ForeignKey("workflow_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step_key = db.Column(db.String(64), nullable=False)
    position = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), nullable=False, default=STEP_STATUS_PENDING)
    output = db.Column(db.Text, nullable=True)
    citations = db.Column(db.JSON, nullable=False, default=list)
    analysis_id = db.Column(
        db.String,
        db.ForeignKey("document_analyses.id", ondelete="SET NULL"),
        nullable=True,
    )
    edited = db.Column(db.Boolean, nullable=False, default=False)
    error = db.Column(db.Text, nullable=True)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    completed_at = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        db.UniqueConstraint("run_id", "step_key", name="uq_workflow_run_step"),
    )
