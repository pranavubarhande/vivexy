"""add message_id to chat_attachments

Revision ID: f7a8b9c0d1e2
Revises: e1f2a3b4c5d6
Create Date: 2026-05-17 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_attachments",
        sa.Column("message_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_chat_attachments_message_id",
        "chat_attachments",
        "messages",
        ["message_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_chat_attachments_message_id", "chat_attachments", ["message_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_chat_attachments_message_id", "chat_attachments")
    op.drop_constraint(
        "fk_chat_attachments_message_id", "chat_attachments", type_="foreignkey"
    )
    op.drop_column("chat_attachments", "message_id")
