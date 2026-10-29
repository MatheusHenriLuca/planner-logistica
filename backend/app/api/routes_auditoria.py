
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_permission
from app.models.user import User
from app.repositories.audit_log_repository import count_audit_logs, get_audit_logs
from app.schemas.audit_log import AuditLogOut

router = APIRouter()


@router.get("/", response_model=dict)
def read_audit_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("pode_ver_historico")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    usuario_id: int | None = None,
    acao: str | None = None,
    entidade: str | None = None,
    entidade_id: int | None = None,
):
    """
    Lista o histórico de auditoria. Restrito a administradores.
    """

    logs = get_audit_logs(
        db,
        skip=skip,
        limit=limit,
        usuario_id=usuario_id,
        acao=acao,
        entidade=entidade,
        entidade_id=entidade_id,
    )
    
    total = count_audit_logs(
        db,
        usuario_id=usuario_id,
        acao=acao,
        entidade=entidade,
        entidade_id=entidade_id,
    )
    
    # Enrich with username
    items = []
    for log in logs:
        log_out = AuditLogOut.model_validate(log)
        log_out.usuario_nome = log.usuario.username if log.usuario else "Desconhecido"
        items.append(log_out.model_dump(mode="json"))
        
    return {
        "items": items,
        "total": total,
        "skip": skip,
        "limit": limit
    }
