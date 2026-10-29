from typing import Any

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def create_audit_log(
    db: Session,
    usuario_id: int,
    acao: str,
    entidade: str,
    entidade_id: int | None = None,
    detalhes: dict[str, Any] | None = None,
) -> AuditLog:
    """Cria um registro de auditoria no banco."""
    db_obj = AuditLog(
        usuario_id=usuario_id,
        acao=acao,
        entidade=entidade,
        entidade_id=entidade_id,
        detalhes=detalhes,
    )
    db.add(db_obj)
    db.flush()
    return db_obj

def get_audit_logs(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    usuario_id: int | None = None,
    acao: str | None = None,
    entidade: str | None = None,
    entidade_id: int | None = None,
) -> list[AuditLog]:
    """Retorna o histórico de auditoria, filtrável e ordenado do mais recente para o mais antigo."""
    query = db.query(AuditLog)
    
    if usuario_id is not None:
        query = query.filter(AuditLog.usuario_id == usuario_id)
    if acao is not None:
        query = query.filter(AuditLog.acao == acao)
    if entidade is not None:
        query = query.filter(AuditLog.entidade == entidade)
    if entidade_id is not None:
        query = query.filter(AuditLog.entidade_id == entidade_id)
        
    return query.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()

def count_audit_logs(
    db: Session,
    usuario_id: int | None = None,
    acao: str | None = None,
    entidade: str | None = None,
    entidade_id: int | None = None,
) -> int:
    query = db.query(AuditLog)
    
    if usuario_id is not None:
        query = query.filter(AuditLog.usuario_id == usuario_id)
    if acao is not None:
        query = query.filter(AuditLog.acao == acao)
    if entidade is not None:
        query = query.filter(AuditLog.entidade == entidade)
    if entidade_id is not None:
        query = query.filter(AuditLog.entidade_id == entidade_id)
        
    return query.count()
