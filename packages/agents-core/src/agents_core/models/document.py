import uuid
from datetime import datetime

from agents_core.constants.documents import DOCUMENT_STATUS_QUEUED
from agents_core.models.base import db


class Document(db.Model):
    """A file in the document store. Owned by a team (or a user when team_id is
    null) and optionally scoped, e.g. scope_type="matter", so extensions can
    group and authorize documents without core knowing what a scope means."""

    __tablename__ = "documents"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = db.Column(db.String, db.ForeignKey("teams.id"), nullable=True)
    owner_id = db.Column(db.String, db.ForeignKey("users.id"), nullable=False)
    scope_type = db.Column(db.String, nullable=True)
    scope_id = db.Column(db.String, nullable=True)
    filename = db.Column(db.String, nullable=False)
    mime_type = db.Column(db.String, nullable=False)
    size = db.Column(db.BigInteger, nullable=False)
    sha256 = db.Column(db.String(64), nullable=False)
    s3_key = db.Column(db.String, nullable=False)
    status = db.Column(db.String, nullable=False, default=DOCUMENT_STATUS_QUEUED)
    stage = db.Column(db.String, nullable=True)
    error = db.Column(db.Text, nullable=True)
    paginated = db.Column(db.Boolean, nullable=False, default=False)
    page_count = db.Column(db.Integer, nullable=True)
    ocr_page_count = db.Column(db.Integer, nullable=True)
    chunk_count = db.Column(db.Integer, nullable=True)
    embedding_model = db.Column(db.String, nullable=True)
    vector_namespace = db.Column(db.String, nullable=True)
    processed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    pages = db.relationship(
        "DocumentPage",
        backref="document",
        lazy=True,
        cascade="all, delete-orphan",
        order_by="DocumentPage.page_number",
    )
    chunks = db.relationship(
        "DocumentChunk",
        backref="document",
        lazy=True,
        cascade="all, delete-orphan",
        order_by="DocumentChunk.chunk_index",
    )

    __table_args__ = (
        db.Index("ix_documents_team_scope", "team_id", "scope_type", "scope_id"),
        db.Index("ix_documents_owner", "owner_id"),
    )


class DocumentPage(db.Model):
    __tablename__ = "document_pages"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = db.Column(
        db.String, db.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    page_number = db.Column(db.Integer, nullable=False)
    text = db.Column(db.Text, nullable=False, default="")
    ocr = db.Column(db.Boolean, nullable=False, default=False)

    __table_args__ = (
        db.UniqueConstraint(
            "document_id", "page_number", name="uq_document_pages_document_page"
        ),
    )


class DocumentChunk(db.Model):
    """A passage that lies within one page; char_start/char_end index into that
    page's text so a citation can highlight the exact span."""

    __tablename__ = "document_chunks"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = db.Column(
        db.String, db.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index = db.Column(db.Integer, nullable=False)
    page_number = db.Column(db.Integer, nullable=False)
    char_start = db.Column(db.Integer, nullable=False)
    char_end = db.Column(db.Integer, nullable=False)
    text = db.Column(db.Text, nullable=False)

    __table_args__ = (db.Index("ix_document_chunks_document", "document_id"),)
