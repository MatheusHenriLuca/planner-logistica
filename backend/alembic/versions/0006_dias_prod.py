"""add dias_prod to producao_staging and producao

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-25

"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("producao_staging") as batch_op:
        batch_op.add_column(sa.Column("dias_prod", sa.Integer(), nullable=True))

    with op.batch_alter_table("producao") as batch_op:
        batch_op.add_column(sa.Column("dias_prod", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("producao") as batch_op:
        batch_op.drop_column("dias_prod")

    with op.batch_alter_table("producao_staging") as batch_op:
        batch_op.drop_column("dias_prod")
