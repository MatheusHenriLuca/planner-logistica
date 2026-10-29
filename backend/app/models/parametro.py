from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ParametroSistema(Base):
    """Configurações e parâmetros globais do sistema configuráveis pelo Administrador."""

    __tablename__ = "parametros_sistema"

    chave: Mapped[str] = mapped_column(String(50), primary_key=True)
    valor: Mapped[str] = mapped_column(Text, nullable=False)
    descricao: Mapped[str] = mapped_column(String(255), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), default="boolean", nullable=False)
