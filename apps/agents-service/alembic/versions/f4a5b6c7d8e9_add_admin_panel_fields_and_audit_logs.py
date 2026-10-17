"""add admin panel fields and audit logs

Revision ID: f4a5b6c7d8e9
Revises: c3d4e5f6a7b9
Create Date: 2026-10-15 00:00:00.000000+00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f4a5b6c7d8e9"
down_revision: Union[str, None] = "c3d4e5f6a7b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_suspended", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(), nullable=True))

    op.add_column(
        "teams",
        sa.Column(
            "is_suspended", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column("teams", sa.Column("seat_limit", sa.Integer(), nullable=True))
    op.add_column("teams", sa.Column("monthly_budget_usd", sa.Float(), nullable=True))
    op.add_column("teams", sa.Column("notes", sa.Text(), nullable=True))

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("actor_id", sa.String(), nullable=True),
        sa.Column("actor_email", sa.String(), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("target_type", sa.String(), nullable=False),
        sa.Column("target_id", sa.String(), nullable=True),
        sa.Column("team_id", sa.String(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_actor_id", "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_team_id", "audit_logs", ["team_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_team_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_actor_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_column("teams", "notes")
    op.drop_column("teams", "monthly_budget_usd")
    op.drop_column("teams", "seat_limit")
    op.drop_column("teams", "is_suspended")

    op.drop_column("users", "last_login_at")
    op.drop_column("users", "is_suspended")
