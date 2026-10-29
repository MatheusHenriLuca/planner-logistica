"""add colaboracao tables (checklist, label, comentario, anexo)

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-27

"""
import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

LABELS_PADRAO = [
    {"nome": "Etiqueta Azul", "cor": "#3B82F6"},
    {"nome": "Etiqueta Verde", "cor": "#22C55E"},
    {"nome": "Etiqueta Amarela", "cor": "#EAB308"},
    {"nome": "Etiqueta Vermelha", "cor": "#EF4444"},
    {"nome": "Etiqueta Roxa", "cor": "#A855F7"},
    {"nome": "Etiqueta Cinza", "cor": "#6B7280"},
]


def upgrade() -> None:
    op.create_table(
        "checklist_item",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "item_producao_id",
            sa.Integer(),
            sa.ForeignKey("producao.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("concluido", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ordem", sa.Integer(), nullable=False),
    )

    label_table = op.create_table(
        "label",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=50), nullable=False),
        sa.Column("cor", sa.String(length=20), nullable=False),
    )
    op.create_index("ix_label_nome", "label", ["nome"], unique=True)

    op.create_table(
        "item_producao_label",
        sa.Column(
            "item_producao_id",
            sa.Integer(),
            sa.ForeignKey("producao.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("label_id", sa.Integer(), sa.ForeignKey("label.id"), primary_key=True),
    )

    op.create_table(
        "comentario",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "item_producao_id",
            sa.Integer(),
            sa.ForeignKey("producao.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("autor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("criado_em", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "anexo",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "item_producao_id",
            sa.Integer(),
            sa.ForeignKey("producao.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("titulo", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("enviado_por", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("criado_em", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.bulk_insert(label_table, LABELS_PADRAO)


def downgrade() -> None:
    op.drop_table("anexo")
    op.drop_table("comentario")
    op.drop_table("item_producao_label")
    op.drop_index("ix_label_nome", table_name="label")
    op.drop_table("label")
    op.drop_table("checklist_item")
