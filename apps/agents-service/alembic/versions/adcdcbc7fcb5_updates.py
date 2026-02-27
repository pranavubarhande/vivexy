"""updates

Revision ID: adcdcbc7fcb5
Revises: 28023ade9f92
Create Date: 2026-01-24 13:05:22.731195+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'adcdcbc7fcb5'
down_revision: Union[str, None] = '28023ade9f92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass