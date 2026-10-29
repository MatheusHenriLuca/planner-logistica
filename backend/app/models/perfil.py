from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Cargo(Base):
    """Perfil / Cargo dinâmico de usuário com permissões granulares."""

    __tablename__ = "cargos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    descricao: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    is_sistema: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Permissões do sistema
    pode_programar: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pode_iniciar_producao: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    pode_reordenar_producao: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pode_mover_colunas: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pode_gerenciar_colunas: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pode_ver_historico: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pode_gerenciar_usuarios: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pode_importar_sap: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pode_configurar_parametros: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pode_gerenciar_ferramentaria: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pode_gerenciar_linhas: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pode_ver_solda: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    pode_ver_estamparia: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

