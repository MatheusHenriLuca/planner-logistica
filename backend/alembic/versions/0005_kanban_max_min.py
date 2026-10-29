"""add kanban_max, kanban_min and saldo_estoque to producao_staging and producao

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-23

"""
import sqlalchemy as sa

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("producao_staging") as batch_op:
        batch_op.add_column(sa.Column("kanban_max", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("kanban_min", sa.Integer(), nullable=True))

    with op.batch_alter_table("producao") as batch_op:
        batch_op.add_column(sa.Column("saldo_estoque", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("kanban_max", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("kanban_min", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("producao") as batch_op:
        batch_op.drop_column("kanban_min")
        batch_op.drop_column("kanban_max")
        batch_op.drop_column("saldo_estoque")

    with op.batch_alter_table("producao_staging") as batch_op:
        batch_op.drop_column("kanban_min")
        batch_op.drop_column("kanban_max")
