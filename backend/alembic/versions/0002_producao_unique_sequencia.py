"""add unique constraint on producao (linha, turno, patan, posto_trabalho, sequencia)

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-26

"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # batch mode: SQLite has no ALTER TABLE ADD CONSTRAINT support and needs
    # the copy-and-move strategy; Postgres (the production target) applies it
    # as a plain ALTER TABLE under the same call.
    with op.batch_alter_table("producao") as batch_op:
        batch_op.create_unique_constraint(
            "uq_producao_linha_turno_patan_posto_sequencia",
            ["linha", "turno", "patan", "posto_trabalho", "sequencia"],
        )


def downgrade() -> None:
    with op.batch_alter_table("producao") as batch_op:
        batch_op.drop_constraint(
            "uq_producao_linha_turno_patan_posto_sequencia", type_="unique"
        )
