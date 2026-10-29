"""add coluna_extra table and ItemProducao.coluna_extra_id

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-27

"""
import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coluna_extra",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=100), nullable=False),
    )
    op.create_index("ix_coluna_extra_nome", "coluna_extra", ["nome"], unique=True)
    # batch mode: SQLite has no ALTER TABLE ADD CONSTRAINT support and needs
    # the copy-and-move strategy; Postgres (the production target) applies it
    # as a plain ALTER TABLE under the same call (see 0002 for precedent).
    # The FK needs an explicit name here (unlike model-level FKs elsewhere in
    # this codebase) because SQLite's batch recreate strategy must be able to
    # track the constraint through the copy-table process.
    with op.batch_alter_table("producao") as batch_op:
        batch_op.add_column(
            sa.Column(
                "coluna_extra_id",
                sa.Integer(),
                sa.ForeignKey(
                    "coluna_extra.id", ondelete="SET NULL", name="fk_producao_coluna_extra_id"
                ),
                nullable=True,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("producao") as batch_op:
        batch_op.drop_column("coluna_extra_id")
    op.drop_index("ix_coluna_extra_nome", table_name="coluna_extra")
    op.drop_table("coluna_extra")
