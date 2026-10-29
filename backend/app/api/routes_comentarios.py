from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.colaboracao_repository import (
    criar_comentario,
    item_existe,
    listar_comentarios,
    obter_usernames,
)
from app.schemas.colaboracao import ComentarioCreate, ComentarioOut

router = APIRouter(prefix="/producao/itens/{item_id}/comentarios", tags=["comentarios"])


@router.get("", response_model=list[ComentarioOut])
def listar_comentarios_do_item(
    item_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> list[ComentarioOut]:
    comentarios = listar_comentarios(db, item_id)
    usernames = obter_usernames(db, {c.autor_id for c in comentarios})
    return [
        ComentarioOut(
            id=c.id,
            texto=c.texto,
            autor_id=c.autor_id,
            autor_username=usernames.get(c.autor_id, ""),
            criado_em=c.criado_em,
        )
        for c in comentarios
    ]


@router.post("", response_model=ComentarioOut, status_code=status.HTTP_201_CREATED)
def criar_comentario_do_item(
    item_id: int,
    payload: ComentarioCreate,
    db: Session = Depends(get_db),  # noqa: B008
    usuario_atual: User = Depends(get_current_user),  # noqa: B008
) -> ComentarioOut:
    if not item_existe(db, item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item nao encontrado.")
    # autor_id always comes from the authenticated user, never from the
    # request body - see Task 7's spec.
    comentario = criar_comentario(db, item_id, usuario_atual.id, payload.texto)
    resposta = ComentarioOut(
        id=comentario.id,
        texto=comentario.texto,
        autor_id=comentario.autor_id,
        autor_username=usuario_atual.username,
        criado_em=comentario.criado_em,
    )
    db.commit()
    return resposta
