from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.colaboracao import Label
from app.models.user import User
from app.repositories.colaboracao_repository import (
    item_existe,
    listar_catalogo_labels,
    listar_labels_do_item,
    substituir_labels_do_item,
)
from app.schemas.colaboracao import LabelOut, LabelSetRequest

router = APIRouter(tags=["labels"])


@router.get("/labels", response_model=list[LabelOut])
def listar_catalogo(
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> list[Label]:
    return listar_catalogo_labels(db)


@router.get("/producao/itens/{item_id}/labels", response_model=list[LabelOut])
def listar_labels_do_item_route(
    item_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> list[Label]:
    return listar_labels_do_item(db, item_id)


@router.put("/producao/itens/{item_id}/labels", response_model=list[LabelOut])
def substituir_labels_do_item_route(
    item_id: int,
    payload: LabelSetRequest,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> list[LabelOut]:
    if not item_existe(db, item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item nao encontrado.")
    catalogo_ids = {label.id for label in listar_catalogo_labels(db)}
    ids_invalidos = set(payload.label_ids) - catalogo_ids
    if ids_invalidos:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Labels inexistentes: {sorted(ids_invalidos)}.",
        )
    # Dedupe (order-preserving) before replacing: substituir_labels_do_item has no
    # dedup guard, so a repeated id would try to insert the same composite PK twice
    # and raise IntegrityError (flagged in Task 3's review, fixed here at the route).
    label_ids = list(dict.fromkeys(payload.label_ids))
    labels = substituir_labels_do_item(db, item_id, label_ids)
    # Build the response before commit - same reasoning as routes_checklist.py.
    resposta = [LabelOut(id=label.id, nome=label.nome, cor=label.cor) for label in labels]
    db.commit()
    return resposta
