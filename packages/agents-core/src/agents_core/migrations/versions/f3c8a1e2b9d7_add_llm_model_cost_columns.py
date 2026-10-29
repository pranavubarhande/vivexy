"""Add cost and capability columns to llm_models

Revision ID: f3c8a1e2b9d7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-18 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f3c8a1e2b9d7"
down_revision: Union[str, None] = "6429f0ab85c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "llm_models", sa.Column("max_output_tokens", sa.Integer(), nullable=True)
    )
    op.add_column("llm_models", sa.Column("input_cost", sa.Float(), nullable=True))
    op.add_column("llm_models", sa.Column("output_cost", sa.Float(), nullable=True))
    op.add_column(
        "llm_models",
        sa.Column(
            "supports_vision", sa.Boolean(), nullable=True, server_default="false"
        ),
    )
    op.add_column(
        "llm_models",
        sa.Column(
            "supports_reasoning", sa.Boolean(), nullable=True, server_default="false"
        ),
    )


def downgrade() -> None:
    op.drop_column("llm_models", "supports_reasoning")
    op.drop_column("llm_models", "supports_vision")
    op.drop_column("llm_models", "output_cost")
    op.drop_column("llm_models", "input_cost")
    op.drop_column("llm_models", "max_output_tokens")
