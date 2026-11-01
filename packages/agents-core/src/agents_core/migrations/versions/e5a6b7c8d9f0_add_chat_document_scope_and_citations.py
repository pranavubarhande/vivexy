"""add chat document scope, message citations and chunk full-text index

Revision ID: e5a6b7c8d9f0
Revises: d12fb5cfa187
Create Date: 2026-11-01 07:00:00.000000+00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5a6b7c8d9f0"
down_revision: Union[str, None] = "d12fb5cfa187"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chats", sa.Column("document_scope_type", sa.String(), nullable=True))
    op.add_column("chats", sa.Column("document_scope_id", sa.String(), nullable=True))
    op.add_column("messages", sa.Column("citations", sa.JSON(), nullable=True))
    op.add_column("messages", sa.Column("citation_check", sa.JSON(), nullable=True))
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX ix_document_chunks_fts ON document_chunks "
            "USING gin (to_tsvector('english', text))"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_document_chunks_fts")
    op.drop_column("messages", "citation_check")
    op.drop_column("messages", "citations")
    op.drop_column("chats", "document_scope_id")
    op.drop_column("chats", "document_scope_type")
