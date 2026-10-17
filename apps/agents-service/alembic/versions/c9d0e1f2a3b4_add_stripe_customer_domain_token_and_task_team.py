"""add Stripe customer, domain verification token and scheduled task team

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-10-17 12:00:00.000000+00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("stripe_customer_id", sa.String(), nullable=True))
    op.create_index(
        "ix_teams_stripe_customer_id", "teams", ["stripe_customer_id"], unique=True
    )
    op.add_column(
        "teams", sa.Column("domain_verification_token", sa.String(), nullable=True)
    )
    op.add_column(
        "scheduled_tasks",
        sa.Column("team_id", sa.String(), sa.ForeignKey("teams.id"), nullable=True),
    )
    op.create_index("ix_scheduled_tasks_team_id", "scheduled_tasks", ["team_id"])


def downgrade() -> None:
    op.drop_index("ix_scheduled_tasks_team_id", table_name="scheduled_tasks")
    op.drop_column("scheduled_tasks", "team_id")
    op.drop_column("teams", "domain_verification_token")
    op.drop_index("ix_teams_stripe_customer_id", table_name="teams")
    op.drop_column("teams", "stripe_customer_id")
