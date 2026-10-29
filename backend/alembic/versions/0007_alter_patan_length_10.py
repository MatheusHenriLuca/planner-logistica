"""Alter patan column length to 10 in producao and producao_staging

Revision ID: 0007_alter_patan_length_10
Revises: bc6d5f66aff7
Create Date: 2026-10-19
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_alter_patan_length_10"
down_revision = "bc6d5f66aff7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("producao_staging") as batch_op:
        batch_op.alter_column(
            "patan",
            type_=sa.String(length=10),
            existing_type=sa.String(length=1),
            nullable=False,
        )

    with op.batch_alter_table("producao") as batch_op:
        batch_op.alter_column(
            "patan",
            type_=sa.String(length=10),
            existing_type=sa.String(length=1),
            nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("producao_staging") as batch_op:
        batch_op.alter_column(
            "patan",
            type_=sa.String(length=1),
            existing_type=sa.String(length=10),
            nullable=False,
        )

    with op.batch_alter_table("producao") as batch_op:
        batch_op.alter_column(
            "patan",
            type_=sa.String(length=1),
            existing_type=sa.String(length=10),
            nullable=False,
        )
