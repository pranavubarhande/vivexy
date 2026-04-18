"""artifact_content_nullable

Revision ID: b1c4e5f6a7d8
Revises: 095dca0b14df
Create Date: 2026-03-06 12:00:00.000000+00:00

Artifact content is optional: web uses S3, desktop uses local folder.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b1c4e5f6a7d8"
down_revision: Union[str, None] = "095dca0b14df"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "artifacts",
        "content",
        existing_type=sa.Text(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "artifacts",
        "content",
        existing_type=sa.Text(),
        nullable=False,
    )
