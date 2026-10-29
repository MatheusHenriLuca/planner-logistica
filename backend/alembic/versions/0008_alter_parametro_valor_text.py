"""Alter parametros_sistema valor column to Text

Revision ID: 0008_alter_parametro_valor_text
Revises: 0007_alter_patan_length_10
Create Date: 2026-10-21
"""

from alembic import op
import sqlalchemy as sa


revision = "0008_alter_parametro_valor_text"
down_revision = "0007_alter_patan_length_10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("parametros_sistema"):
        op.create_table(
            "parametros_sistema",
            sa.Column("chave", sa.String(length=100), primary_key=True),
            sa.Column("valor", sa.Text(), nullable=False),
            sa.Column("descricao", sa.String(length=255), nullable=False),
            sa.Column("tipo", sa.String(length=20), nullable=False, server_default="string"),
        )
    else:
        with op.batch_alter_table("parametros_sistema") as batch_op:
            batch_op.alter_column(
                "valor",
                type_=sa.Text(),
                existing_type=sa.String(length=200),
                nullable=False,
            )


def downgrade() -> None:
    with op.batch_alter_table("parametros_sistema") as batch_op:
        batch_op.alter_column(
            "valor",
            type_=sa.String(length=200),
            existing_type=sa.Text(),
            nullable=False,
        )
