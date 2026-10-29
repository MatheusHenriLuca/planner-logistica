from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditLogBase(BaseModel):
    acao: str
    entidade: str
    entidade_id: int | None = None
    detalhes: dict[str, Any] | None = None


class AuditLogCreate(AuditLogBase):
    usuario_id: int


class AuditLogOut(AuditLogBase):
    id: int
    usuario_id: int
    created_at: datetime
    
    # Extra field to include username in responses
    usuario_nome: str | None = None

    model_config = ConfigDict(from_attributes=True)
