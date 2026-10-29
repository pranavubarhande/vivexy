"""Add github integration and chat checkpoints

Revision ID: c7d8e9f0a1b2
Revises: 01d1631d506f
Create Date: 2026-05-03

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "01d1631d506f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "github_connections",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("access_token", sa.String(), nullable=False),
        sa.Column("scope", sa.String(), nullable=True),
        sa.Column("github_user_id", sa.String(), nullable=True),
        sa.Column("github_username", sa.String(), nullable=True),
        sa.Column("github_avatar", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_table(
        "github_repos",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("connection_id", sa.String(), nullable=False),
        sa.Column("github_repo_id", sa.Integer(), nullable=True),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("owner", sa.String(), nullable=True),
        sa.Column("private", sa.Boolean(), nullable=True),
        sa.Column("default_branch", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("html_url", sa.String(), nullable=True),
        sa.Column("is_linked", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["connection_id"], ["github_connections.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "chat_checkpoints",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("chat_id", sa.String(), nullable=False),
        sa.Column("message_id", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["chat_id"], ["chats.id"]),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("chat_checkpoints")
    op.drop_table("github_repos")
    op.drop_table("github_connections")
