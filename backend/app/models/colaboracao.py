"""ORM models for Fase 2 collaboration features (checklist, label, comentario, anexo).

FK cascade note: producao_repository.bulk_persist deletes and re-inserts every
non-preserved ItemProducao row on each resubmission of a (linha, turno, patan)
scope (existing Fase 1 behavior - see that function's own docstring). Every FK
below that targets producao.id uses ondelete="CASCADE" so a resubmission does
not raise a FK-violation IntegrityError when a resequenced item already has
checklist/label/comment/attachment rows: the child rows are cleared along with
the row they belong to, instead of blocking the delete. A plain reorder-and-
resubmit therefore clears an item's collaboration data - a consequence of
bulk_persist's replace-not-update design, not something this migration can fix
without redesigning bulk_persist itself (out of scope here).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ChecklistItem(Base):
    """Checklist step attached to an ItemProducao (Tabela B) card."""

    __tablename__ = "checklist_item"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_producao_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("producao.id", ondelete="CASCADE"), nullable=False
    )
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    concluido: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False)


class Label(Base):
    """Catalog entry for a colored tag; applied to items via ItemProducaoLabel."""

    __tablename__ = "label"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    cor: Mapped[str] = mapped_column(String(20), nullable=False)


class ItemProducaoLabel(Base):
    """Join table: which labels are applied to which ItemProducao (N:N)."""

    __tablename__ = "item_producao_label"

    item_producao_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("producao.id", ondelete="CASCADE"), primary_key=True
    )
    label_id: Mapped[int] = mapped_column(Integer, ForeignKey("label.id"), primary_key=True)


class Comentario(Base):
    """Comment thread entry on an ItemProducao card."""

    __tablename__ = "comentario"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_producao_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("producao.id", ondelete="CASCADE"), nullable=False
    )
    autor_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    # DB-computed timestamp (no Python-side default): criado_em must reflect
    # when Postgres persisted the row, not the app server's clock.
    criado_em: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )


class Anexo(Base):
    """Link-style attachment on an ItemProducao card (title + URL, no file upload)."""

    __tablename__ = "anexo"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_producao_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("producao.id", ondelete="CASCADE"), nullable=False
    )
    titulo: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    enviado_por: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
