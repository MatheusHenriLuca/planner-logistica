"""initial tables

Revision ID: 0001
Revises:
Create Date: 2026-08-24

"""
import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "producao_staging",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("linha", sa.String(length=50), nullable=False),
        sa.Column("turno", sa.Integer(), nullable=False),
        sa.Column("patan", sa.String(length=1), nullable=False),
        sa.Column("posto_trabalho", sa.String(length=50), nullable=False),
        sa.Column("status", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("sequencia", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("kanbans", sa.Integer(), nullable=False),
        sa.Column("qtd_por_kanban", sa.Integer(), nullable=False),
        sa.Column("tempo_por_peca_minutos", sa.Float(), nullable=False),
        sa.Column("demanda", sa.Float(), nullable=False),
        sa.Column("saldo_estoque", sa.Float(), nullable=False),
        sa.Column("is_critico", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.create_table(
        "producao",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("linha", sa.String(length=50), nullable=False),
        sa.Column("turno", sa.Integer(), nullable=False),
        sa.Column("patan", sa.String(length=1), nullable=False),
        sa.Column("posto_trabalho", sa.String(length=50), nullable=False),
        sa.Column("status", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("sequencia", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("hora_inicial", sa.DateTime(), nullable=True),
        sa.Column("hora_final", sa.DateTime(), nullable=True),
        sa.Column("almoco_incluso", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("kanbans", sa.Integer(), nullable=False),
        sa.Column("qtd_por_kanban", sa.Integer(), nullable=False),
        sa.Column("tempo_por_peca_minutos", sa.Float(), nullable=False),
        sa.Column("is_critico", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("em_producao", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_table("producao")
    op.drop_table("producao_staging")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
