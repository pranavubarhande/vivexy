"""add team attribution, budget policy, announcements

Revision ID: a7b8c9d0e1f2
Revises: f4a5b6c7d8e9
Create Date: 2026-10-15 12:00:00.000000+00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chats", sa.Column("team_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_chats_team_id_teams",
        "chats",
        "teams",
        ["team_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_chats_team_id", "chats", ["team_id"])

    op.add_column("token_usage", sa.Column("team_id", sa.String(), nullable=True))
    op.create_index("ix_token_usage_team_id", "token_usage", ["team_id"])

    op.add_column(
        "teams",
        sa.Column(
            "budget_enforcement",
            sa.String(),
            nullable=False,
            server_default="warn",
        ),
    )
    op.add_column("teams", sa.Column("budget_alert_month", sa.String(), nullable=True))
    op.add_column(
        "teams", sa.Column("budget_alert_threshold", sa.Integer(), nullable=True)
    )
    op.add_column("teams", sa.Column("allowed_model_ids", sa.JSON(), nullable=True))
    op.add_column("teams", sa.Column("feature_flags", sa.JSON(), nullable=True))

    op.create_table(
        "announcements",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("level", sa.String(), nullable=False, server_default="info"),
        sa.Column("team_id", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("starts_at", sa.DateTime(), nullable=True),
        sa.Column("ends_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_announcements_team_id", "announcements", ["team_id"])


def downgrade() -> None:
    op.drop_index("ix_announcements_team_id", table_name="announcements")
    op.drop_table("announcements")

    op.drop_column("teams", "feature_flags")
    op.drop_column("teams", "allowed_model_ids")
    op.drop_column("teams", "budget_alert_threshold")
    op.drop_column("teams", "budget_alert_month")
    op.drop_column("teams", "budget_enforcement")

    op.drop_index("ix_token_usage_team_id", table_name="token_usage")
    op.drop_column("token_usage", "team_id")

    op.drop_index("ix_chats_team_id", table_name="chats")
    op.drop_constraint("fk_chats_team_id_teams", "chats", type_="foreignkey")
    op.drop_column("chats", "team_id")
