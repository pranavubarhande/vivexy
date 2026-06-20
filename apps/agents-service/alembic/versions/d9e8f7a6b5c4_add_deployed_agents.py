"""add deployed_agents table

Revision ID: d9e8f7a6b5c4
Revises: b9c0d1e2f3a4
Create Date: 2026-05-17 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "d9e8f7a6b5c4"
down_revision: Union[str, None] = "b9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "deployed_agents",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("agent_id", sa.String(), nullable=False),
        sa.Column("deployed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "agent_id", name="uq_user_deployed_agent"),
    )
    op.create_index("ix_deployed_agents_user_id", "deployed_agents", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_deployed_agents_user_id", table_name="deployed_agents")
    op.drop_table("deployed_agents")
