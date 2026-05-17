"""stub for existing DB revision

Revision ID: e0f1a2b3c4d5
Revises: d8e9f0a1b2c3
Create Date: 2026-05-16 00:00:00.000000

This file exists so Alembic can resolve the revision chain.
The corresponding migration was already applied to the database.
"""

from typing import Sequence, Union

revision: str = "e0f1a2b3c4d5"
down_revision: Union[str, None] = "d8e9f0a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
