"""add unique constraint on oauth_provider+oauth_subject_id

Revision ID: c3d4e5f6a7b9
Revises: b2c3d4e5f6a8
Create Date: 2026-10-05 00:00:00.000000+00:00

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b9"
down_revision: Union[str, None] = "b2c3d4e5f6a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # find_or_create_oauth_user() already enforces "one user per OAuth
    # identity" at the application level, but nothing stopped a future
    # bug (or a direct DB write) from creating two rows with the same
    # (oauth_provider, oauth_subject_id) pair. Postgres unique constraints
    # treat NULL as distinct from any other NULL, so password-only users
    # (both columns NULL) are correctly unaffected by this constraint.
    op.create_unique_constraint(
        "uq_users_oauth_provider_subject_id",
        "users",
        ["oauth_provider", "oauth_subject_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_users_oauth_provider_subject_id", "users", type_="unique")
