from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.colaboracao_repository import (
    criar_anexo,
    item_existe,
    listar_anexos,
    obter_usernames,
    remover_anexo,
)
from app.schemas.colaboracao import AnexoCreate, AnexoOut

router = APIRouter(prefix="/producao/itens/{item_id}/anexos", tags=["anexos"])


@router.get("", response_model=list[AnexoOut])
def listar_anexos_do_item(
    item_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> list[AnexoOut]:
    anexos = listar_anexos(db, item_id)
    usernames = obter_usernames(db, {a.enviado_por for a in anexos})
    return [
        AnexoOut(
            id=a.id,
            titulo=a.titulo,
            url=a.url,
            enviado_por=a.enviado_por,
            enviado_por_username=usernames.get(a.enviado_por, ""),
            criado_em=a.criado_em,
        )
        for a in anexos
    ]


@router.post("", response_model=AnexoOut, status_code=status.HTTP_201_CREATED)
def criar_anexo_do_item(
    item_id: int,
    payload: AnexoCreate,
    db: Session = Depends(get_db),  # noqa: B008
    usuario_atual: User = Depends(get_current_user),  # noqa: B008
) -> AnexoOut:
    if not item_existe(db, item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item nao encontrado.")
    # enviado_por always comes from the authenticated user, never from the
    # request body - see Task 8's spec.
    anexo = criar_anexo(db, item_id, payload.titulo, payload.url, usuario_atual.id)
    resposta = AnexoOut(
        id=anexo.id,
        titulo=anexo.titulo,
        url=anexo.url,
        enviado_por=anexo.enviado_por,
        enviado_por_username=usuario_atual.username,
        criado_em=anexo.criado_em,
    )
    db.commit()
    return resposta


@router.delete("/{anexo_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_anexo_do_item(
    item_id: int,
    anexo_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> None:
    pertence_ao_item = any(a.id == anexo_id for a in listar_anexos(db, item_id))
    if not pertence_ao_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anexo nao encontrado.")
    remover_anexo(db, anexo_id)
    db.commit()
