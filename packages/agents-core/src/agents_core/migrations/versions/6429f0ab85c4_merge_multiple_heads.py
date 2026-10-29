"""Merge multiple heads

Revision ID: 6429f0ab85c4
Revises: a1948b11a680, a1b2c3d4e5f6
Create Date: 2026-04-18 12:15:26.777320+00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6429f0ab85c4"
down_revision: Union[str, None] = ("a1948b11a680", "a1b2c3d4e5f6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
