from enum import Enum

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Role(str, Enum):
    ADMIN = "admin"
    PROGRAMADOR = "programador"
    USUARIO_COMUM = "usuario_comum"
    OPERADOR_SOLDA = "operador_solda"
    OPERADOR_ESTAMPARIA = "operador_estamparia"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
