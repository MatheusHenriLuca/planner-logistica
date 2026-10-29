from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.perfil import Cargo
from app.models.user import Role, User
from app.repositories.audit_log_repository import create_audit_log
from app.repositories.linha_repository import (
    criar_linha,
    listar_linhas,
    obter_linha_por_id,
    obter_linha_por_nome_e_setor,
    remover_linha,
    seed_linhas_padrao,
)
from app.schemas.linha import LinhaProducaoCreate, LinhaProducaoOut

router = APIRouter(prefix="/linhas", tags=["linhas"])


def _pode_gerenciar_linhas(user: User, db: Session) -> bool:
    if user.role == Role.ADMIN.value:
        return True
    cargo = db.query(Cargo).filter(Cargo.nome == user.role).first()
    return bool(cargo and cargo.pode_gerenciar_linhas)


@router.get("", response_model=list[LinhaProducaoOut])
def obter_linhas(
    setor: str | None = Query(None, description="Filtrar por setor ('solda' ou 'estamparia')"),
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> list[LinhaProducaoOut]:
    seed_linhas_padrao(db)
    db.commit()
    linhas = listar_linhas(db, setor=setor)
    return [LinhaProducaoOut.model_validate(linha) for linha in linhas]


@router.post("", response_model=LinhaProducaoOut, status_code=status.HTTP_201_CREATED)
def criar_nova_linha(
    payload: LinhaProducaoCreate,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> LinhaProducaoOut:
    if not _pode_gerenciar_linhas(current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores ou usuários autorizados podem criar linhas de produção.",
        )

    nome = payload.nome.strip().upper()
    setor = payload.setor.strip().lower()

    if setor not in ("solda", "estamparia"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Setor inválido. Deve ser 'solda' ou 'estamparia'.",
        )

    existente = obter_linha_por_nome_e_setor(db, nome, setor)
    if existente and existente.ativo:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A {nome} já está cadastrada no setor {setor}.",
        )

    linha = criar_linha(db, payload)
    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="criar_linha",
        entidade="linhas_producao",
        entidade_id=linha.id,
        detalhes={"nome": linha.nome, "setor": linha.setor, "descricao": linha.descricao},
    )
    db.commit()
    return LinhaProducaoOut.model_validate(linha)


@router.delete("/{linha_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_linha(
    linha_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> None:
    if not _pode_gerenciar_linhas(current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores ou usuários autorizados podem remover linhas.",
        )

    linha = obter_linha_por_id(db, linha_id)
    if not linha:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Linha não encontrada.",
        )

    nome = linha.nome
    setor = linha.setor
    remover_linha(db, linha_id)
    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="remover_linha",
        entidade="linhas_producao",
        entidade_id=linha_id,
        detalhes={"nome": nome, "setor": setor},
    )
    db.commit()
