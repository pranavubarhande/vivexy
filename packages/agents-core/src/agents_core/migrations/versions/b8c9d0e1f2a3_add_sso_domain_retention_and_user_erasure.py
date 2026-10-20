"""add SSO domain policy, retention and user erasure

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-10-15 18:00:00.000000+00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("email_domain", sa.String(), nullable=True))
    op.create_index("ix_teams_email_domain", "teams", ["email_domain"])
    for column in ("domain_verified", "auto_join_domain", "require_sso"):
        op.add_column(
            "teams",
            sa.Column(column, sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    op.add_column("teams", sa.Column("retention_days", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "deleted_at")
    op.drop_column("teams", "retention_days")
    for column in ("require_sso", "auto_join_domain", "domain_verified"):
        op.drop_column("teams", column)
    op.drop_index("ix_teams_email_domain", table_name="teams")
    op.drop_column("teams", "email_domain")
