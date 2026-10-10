"""add sso and email verification fields to users

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-10-05 00:00:00.000000+00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a8"
down_revision: Union[str, None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SSO-only users have no password.
    op.alter_column("users", "password", existing_type=sa.String(), nullable=True)
    # server_default=false() is required here, not optional: this is a NOT
    # NULL column being added to a table that already has rows, and every
    # existing row needs a value or the ALTER fails.
    op.add_column(
        "users",
        sa.Column(
            "email_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column("users", sa.Column("oauth_provider", sa.String(), nullable=True))
    op.add_column("users", sa.Column("oauth_subject_id", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "oauth_subject_id")
    op.drop_column("users", "oauth_provider")
    op.drop_column("users", "email_verified")
    # Deliberately NOT restoring `nullable=False` on password: any SSO-only
    # user created while this migration was applied has password=NULL, and
    # re-imposing NOT NULL here would make the downgrade itself fail outright
    # (or require silently deleting/mutating those rows, which a schema
    # downgrade should never do). Leaving it nullable is a strict superset of
    # the original constraint and doesn't break anything that depended on it
    # being NOT NULL, since every pre-existing row already has a password.
