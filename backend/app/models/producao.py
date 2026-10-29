from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ColunaExtra(Base):
    """Admin/programador-managed outcome column (e.g. "Quebra de
    Ferramenta", "Concluidas") - independent of STATUS. Items reference
    this via ItemProducao.coluna_extra_id (nullable - NULL means
    unclassified/normal flow).
    """

    __tablename__ = "coluna_extra"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    setor: Mapped[str] = mapped_column(String(30), default="todos", nullable=False)


class LinhaProducao(Base):
    """Linhas fabris de produção categorizadas por setor (ex: solda, estamparia)."""

    __tablename__ = "linhas_producao"
    __table_args__ = (
        UniqueConstraint("nome", "setor", name="uq_linhas_nome_setor"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(50), nullable=False)
    descricao: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    setor: Mapped[str] = mapped_column(String(30), nullable=False)  # "solda" ou "estamparia"
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ItemProducaoStaging(Base):
    """Tabela A - SAP dump buffer, cleared after a batch send.

    Each programmer has their own staging: usuario_id scopes every
    read/write so one programmer syncing from Excel never clobbers
    another's work-in-progress.
    """

    __tablename__ = "producao_staging"
    __table_args__ = (
        UniqueConstraint(
            "usuario_id", "setor", "linha", "turno", "patan", "posto_trabalho", "material",
            name="uq_staging_usuario_setor_linha_turno_patan_posto_material",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    setor: Mapped[str] = mapped_column(String(30), default="solda", nullable=False)
    material: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    linha: Mapped[str] = mapped_column(String(50), nullable=False)
    turno: Mapped[int] = mapped_column(Integer, nullable=False)
    patan: Mapped[str] = mapped_column(String(10), nullable=False)
    posto_trabalho: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    sequencia: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    kanbans: Mapped[int] = mapped_column(Integer, nullable=False)
    qtd_por_kanban: Mapped[int] = mapped_column(Integer, nullable=False)
    tempo_por_peca_minutos: Mapped[float] = mapped_column(Float, nullable=False)
    demanda: Mapped[float] = mapped_column(Float, nullable=False)
    saldo_estoque: Mapped[float] = mapped_column(Float, nullable=False)
    dias_prod: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kanban_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kanban_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_critico: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    comp_comb: Mapped[str | None] = mapped_column(Text, default="", nullable=True)
    anotacoes: Mapped[str | None] = mapped_column(Text, default="", nullable=True)
    mostrar_anotacoes_quadro: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ItemProducao(Base):
    """Tabela B - official Kanban, immutable persisted source. Never overwritten by staging."""

    __tablename__ = "producao"
    __table_args__ = (
        Index(
            "uq_producao_setor_linha_turno_patan_posto_sequencia",
            "setor",
            "linha",
            "turno",
            "patan",
            "posto_trabalho",
            "sequencia",
            unique=True,
            postgresql_where=text("coluna_extra_id IS NULL AND status = 2"),
            sqlite_where=text("coluna_extra_id IS NULL AND status = 2"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    setor: Mapped[str] = mapped_column(String(30), default="solda", nullable=False)
    material: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    linha: Mapped[str] = mapped_column(String(50), nullable=False)
    turno: Mapped[int] = mapped_column(Integer, nullable=False)
    patan: Mapped[str] = mapped_column(String(10), nullable=False)
    posto_trabalho: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    sequencia: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hora_inicial: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hora_final: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    almoco_incluso: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    kanbans: Mapped[int] = mapped_column(Integer, nullable=False)
    qtd_por_kanban: Mapped[int] = mapped_column(Integer, nullable=False)
    tempo_por_peca_minutos: Mapped[float] = mapped_column(Float, nullable=False)
    saldo_estoque: Mapped[float | None] = mapped_column(Float, nullable=True)
    dias_prod: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kanban_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kanban_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_critico: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    em_producao: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    inicio_real: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    fim_real: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    quantidade_produzida_real: Mapped[int | None] = mapped_column(Integer, nullable=True)
    motivo_interrupcao: Mapped[str | None] = mapped_column(String(50), nullable=True)
    coluna_extra_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("coluna_extra.id", ondelete="SET NULL"), nullable=True
    )
    comp_comb: Mapped[str | None] = mapped_column(Text, default="", nullable=True)
    anotacoes: Mapped[str | None] = mapped_column(Text, default="", nullable=True)
    mostrar_anotacoes_quadro: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
