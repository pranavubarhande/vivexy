"""add missing artifact types

Revision ID: 7e9f0a1b2c3d
Revises: ('3b00cd49b297', 'b1c4e5f6a7d8')
Create Date: 2026-03-19 00:35:00.000000+00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7e9f0a1b2c3d"
down_revision: Union[str, Sequence[str], None] = ("3b00cd49b297", "b1c4e5f6a7d8")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new values to the enum
    # Note: Postgres doesn't allow adding values to an enum within a transaction
    # if it's being used by a column. However, 'ADD VALUE IF NOT EXISTS' is usually okay
    # depending on the context.
    # For safety in varied environments, we wrap in try/except or just use plain SQL.
    op.execute("ALTER TYPE artifacttype ADD VALUE IF NOT EXISTS 'DOCX'")
    op.execute("ALTER TYPE artifacttype ADD VALUE IF NOT EXISTS 'PPTX'")
    op.execute("ALTER TYPE artifacttype ADD VALUE IF NOT EXISTS 'PDF'")
    op.execute("ALTER TYPE artifacttype ADD VALUE IF NOT EXISTS 'OTHER'")


def downgrade() -> None:
    # Removing values from an enum is complex and generally not recommended
    # in Postgres without recreating the type and altering columns.
    pass
