import uuid
from datetime import datetime

from agents_core.constants.analyses import (
    ANALYSIS_STATUS_QUEUED,
    RESULT_STATUS_PENDING,
)
from agents_core.models.base import db


class DocumentAnalysis(db.Model):
    """A review grid, summary or timeline over a set of documents. It lives in
    the same team and scope as its documents, so whoever can read them can
    read the analysis."""

    __tablename__ = "document_analyses"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = db.Column(
        db.String, db.ForeignKey("teams.id", ondelete="CASCADE"), nullable=True
    )
    owner_id = db.Column(
        db.String, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    scope_type = db.Column(db.String(64), nullable=True)
    scope_id = db.Column(db.String(128), nullable=True)
    kind = db.Column(db.String(20), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), nullable=False, default=ANALYSIS_STATUS_QUEUED)
    document_ids = db.Column(db.JSON, nullable=False)
    questions = db.Column(db.JSON, nullable=False, default=list)
    options = db.Column(db.JSON, nullable=False, default=dict)
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

    results = db.relationship(
        "DocumentAnalysisResult",
        backref="analysis",
        lazy=True,
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        db.Index("ix_document_analyses_scope", "team_id", "scope_type", "scope_id"),
        db.Index("ix_document_analyses_owner", "owner_id"),
    )


class DocumentAnalysisResult(db.Model):
    """One cell of a review grid (a document and a question), or one
    document's summary or timeline events."""

    __tablename__ = "document_analysis_results"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id = db.Column(
        db.String,
        db.ForeignKey("document_analyses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id = db.Column(
        db.String, db.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    question_id = db.Column(db.String(32), nullable=True)
    status = db.Column(db.String(20), nullable=False, default=RESULT_STATUS_PENDING)
    answer = db.Column(db.Text, nullable=True)
    found = db.Column(db.Boolean, nullable=True)
    items = db.Column(db.JSON, nullable=True)
    citations = db.Column(db.JSON, nullable=False, default=list)
    error = db.Column(db.Text, nullable=True)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        db.UniqueConstraint(
            "analysis_id", "document_id", "question_id", name="uq_analysis_result_cell"
        ),
    )
