from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.user import Role


def _coerce_role(v: Any) -> Any:
    if isinstance(v, Role):
        return v
    if isinstance(v, str):
        try:
            return Role(v)
        except ValueError:
            pass
        try:
            from app.db.session import SessionLocal
            from app.models.perfil import Cargo

            with SessionLocal() as db:
                cargo = db.query(Cargo).filter(Cargo.nome == v).first()
                if cargo is not None:
                    return v
        except Exception:
            pass
        raise ValueError(f"Role '{v}' invalida.")
    raise ValueError("Tipo de role invalido.")


class UserCreate(BaseModel):
    username: str
    password: str
    role: Role | str = Role.USUARIO_COMUM

    @field_validator("role", mode="before")
    @classmethod
    def validate_role(cls, v: Any) -> Any:
        return _coerce_role(v)


class UserOut(BaseModel):
    id: int
    username: str
    role: Role | str

    @field_validator("role", mode="before")
    @classmethod
    def validate_role(cls, v: Any) -> Any:
        return _coerce_role(v)

    model_config = ConfigDict(from_attributes=True)


class UserRoleUpdate(BaseModel):
    role: Role | str

    @field_validator("role", mode="before")
    @classmethod
    def validate_role(cls, v: Any) -> Any:
        return _coerce_role(v)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

