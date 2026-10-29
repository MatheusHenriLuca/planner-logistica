import anyio
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.core.ws_manager import manager
from app.db.session import get_db
from app.models.user import Role, User
from app.repositories.audit_log_repository import create_audit_log
from app.repositories.producao_repository import (
    criar_coluna_extra,
    listar_colunas_extras,
    mover_para_coluna_extra,
    remover_coluna_extra,
    renomear_coluna_extra,
)
from app.schemas.producao import (
    ColunaExtraCreate,
    ColunaExtraOut,
    ItemProducaoOut,
    MoverColunaExtraRequest,
    to_item_producao_out,
)

router = APIRouter(prefix="/producao", tags=["producao"])


@router.get("/colunas-extras", response_model=list[ColunaExtraOut])
def listar_colunas(
    setor: str | None = None,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> list[ColunaExtraOut]:
    colunas = listar_colunas_extras(db, setor=setor)
    return [ColunaExtraOut(id=c.id, nome=c.nome, setor=getattr(c, "setor", "todos")) for c in colunas]


@router.post(
    "/colunas-extras", response_model=ColunaExtraOut, status_code=status.HTTP_201_CREATED
)
def criar_coluna(
    payload: ColunaExtraCreate,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
) -> ColunaExtraOut:
    coluna = criar_coluna_extra(db, payload.nome, setor=payload.setor)
    resposta = ColunaExtraOut(id=coluna.id, nome=coluna.nome, setor=coluna.setor)
    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="criar_coluna_extra",
        entidade="coluna_extra",
        entidade_id=coluna.id,
        detalhes={"nome": coluna.nome},
    )
    db.commit()
    return resposta


@router.delete("/colunas-extras/{coluna_extra_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_coluna(
    coluna_extra_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
) -> None:
    try:
        removido = remover_coluna_extra(db, coluna_extra_id)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    if not removido:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Coluna extra nao encontrada."
        )
    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="remover_coluna_extra",
        entidade="coluna_extra",
        entidade_id=coluna_extra_id,
        detalhes={"coluna_extra_id": coluna_extra_id},
    )
    db.commit()


@router.patch("/colunas-extras/{coluna_extra_id}", response_model=ColunaExtraOut)
def renomear_coluna(
    coluna_extra_id: int,
    payload: ColunaExtraCreate,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
) -> ColunaExtraOut:
    try:
        coluna = renomear_coluna_extra(db, coluna_extra_id, payload.nome)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    if coluna is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Coluna extra nao encontrada."
        )
    resposta = ColunaExtraOut(id=coluna.id, nome=coluna.nome)
    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="renomear_coluna_extra",
        entidade="coluna_extra",
        entidade_id=coluna.id,
        detalhes={"nome_novo": coluna.nome},
    )
    db.commit()
    return resposta


@router.patch("/itens/{item_id}/coluna-extra", response_model=ItemProducaoOut)
def mover_item_coluna_extra(
    item_id: int,
    payload: MoverColunaExtraRequest,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> ItemProducaoOut:
    try:
        item = mover_para_coluna_extra(db, item_id, payload.coluna_extra_id)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item nao encontrado.")
    resposta = to_item_producao_out(item)
    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="mover_coluna_extra",
        entidade="producao",
        entidade_id=item_id,
        detalhes={
            "material": item.material,
            "linha": item.linha,
            "posto_trabalho": item.posto_trabalho,
            "coluna_extra_id": payload.coluna_extra_id,
        },
    )
    db.commit()
    anyio.from_thread.run(
        manager.broadcast,
        {
            "tipo": "producao_atualizada",
            "linha": item.linha,
            "turno": item.turno,
            "patan": item.patan,
        },
    )
    return resposta
