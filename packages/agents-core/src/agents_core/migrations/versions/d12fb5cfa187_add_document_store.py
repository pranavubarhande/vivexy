"""add document store

Revision ID: d12fb5cfa187
Revises: c9d0e1f2a3b4
Create Date: 2026-10-31 20:08:29.561315+00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d12fb5cfa187"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("team_id", sa.String(), sa.ForeignKey("teams.id"), nullable=True),
        sa.Column("owner_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("scope_type", sa.String(), nullable=True),
        sa.Column("scope_id", sa.String(), nullable=True),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("s3_key", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("stage", sa.String(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("paginated", sa.Boolean(), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("ocr_page_count", sa.Integer(), nullable=True),
        sa.Column("chunk_count", sa.Integer(), nullable=True),
        sa.Column("embedding_model", sa.String(), nullable=True),
        sa.Column("vector_namespace", sa.String(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_documents_owner", "documents", ["owner_id"])
    op.create_index(
        "ix_documents_team_scope", "documents", ["team_id", "scope_type", "scope_id"]
    )
    op.create_table(
        "document_pages",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column(
            "document_id",
            sa.String(),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("ocr", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "document_id", "page_number", name="uq_document_pages_document_page"
        ),
    )
    op.create_table(
        "document_chunks",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column(
            "document_id",
            sa.String(),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("char_start", sa.Integer(), nullable=False),
        sa.Column("char_end", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_document_chunks_document", "document_chunks", ["document_id"])


def downgrade() -> None:
    op.drop_index("ix_document_chunks_document", table_name="document_chunks")
    op.drop_table("document_chunks")
    op.drop_table("document_pages")
    op.drop_index("ix_documents_team_scope", table_name="documents")
    op.drop_index("ix_documents_owner", table_name="documents")
    op.drop_table("documents")
