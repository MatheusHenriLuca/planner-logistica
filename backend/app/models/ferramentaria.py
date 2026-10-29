from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ManutencaoFerramenta(Base):
    """Controle de quebra, manutenção e tryout de ferramentas na ferramentaria."""

    __tablename__ = "ferramentaria_manutencoes"

    id: Mapped[int] = mapped_column(primary_key=True)
    material: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    descricao: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    linha: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    posto_trabalho: Mapped[str] = mapped_column(String(50), default="", nullable=False)

    # Status: aguardando_manutencao | aguardando_preventiva | em_manutencao | tryout | disponivel
    status: Mapped[str] = mapped_column(String(30), default="aguardando_manutencao", nullable=False)
    # Tipo: corretiva | preventiva
    tipo_manutencao: Mapped[str] = mapped_column(String(30), default="corretiva", nullable=False)

    motivo_quebra: Mapped[str] = mapped_column(Text, default="", nullable=False)
    pecas_produzidas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    observacoes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    data_quebra: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    data_liberacao: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    usuario_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Detalhes de Agendamento do Tryout (definidos pelo Programador da Ferramentaria)
    tryout_setor: Mapped[str | None] = mapped_column(String(30), nullable=True)
    tryout_prensa: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tryout_ferramenta: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tryout_inicio: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tryout_fim: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class CatalogoFerramenta(Base):
    """Catálogo mestre de ferramentas com periodicidade de manutenção preventiva."""

    __tablename__ = "ferramentaria_catalogo"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    descricao: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    setor: Mapped[str] = mapped_column(String(30), default="estamparia", nullable=False)
    linha: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    posto_trabalho: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    periodicidade_dias: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    ultima_manutencao: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    proxima_manutencao: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    observacoes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    ativo: Mapped[bool] = mapped_column(default=True, nullable=False)
