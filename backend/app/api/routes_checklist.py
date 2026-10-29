from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.colaboracao import ChecklistItem
from app.models.user import User
from app.repositories.colaboracao_repository import (
    atualizar_checklist_item,
    criar_checklist_item,
    item_existe,
    listar_checklist,
    remover_checklist_item,
    seed_checklist_padrao,
)
from app.schemas.colaboracao import ChecklistItemCreate, ChecklistItemOut, ChecklistItemUpdate

router = APIRouter(prefix="/producao/itens/{item_id}/checklist", tags=["checklist"])


@router.get("", response_model=list[ChecklistItemOut])
def listar_checklist_do_item(
    item_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> list[ChecklistItem]:
    return listar_checklist(db, item_id)


@router.post("", response_model=ChecklistItemOut, status_code=status.HTTP_201_CREATED)
def criar_item_checklist(
    item_id: int,
    payload: ChecklistItemCreate,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> ChecklistItemOut:
    if not item_existe(db, item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item nao encontrado.")
    item = criar_checklist_item(db, item_id, payload.texto, payload.ordem)
    # Build the response before commit: expire_on_commit=True would force a
    # lazy-reload on each attribute access below otherwise - same pattern/
    # reasoning as routes_producao.py's submeter_sequencia.
    resposta = ChecklistItemOut(
        id=item.id,
        item_producao_id=item.item_producao_id,
        texto=item.texto,
        concluido=item.concluido,
        ordem=item.ordem,
    )
    db.commit()
    return resposta


@router.patch("/{checklist_item_id}", response_model=ChecklistItemOut)
def atualizar_item_checklist(
    item_id: int,
    checklist_item_id: int,
    payload: ChecklistItemUpdate,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> ChecklistItemOut:
    item = atualizar_checklist_item(
        db, checklist_item_id, texto=payload.texto, concluido=payload.concluido
    )
    if item is None or item.item_producao_id != item_id:
        # Safe to reject even though atualizar_checklist_item already flushed
        # the change: without a db.commit() below, get_db's finally-block
        # db.close() discards the uncommitted flush.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item de checklist nao encontrado.",
        )
    resposta = ChecklistItemOut(
        id=item.id,
        item_producao_id=item.item_producao_id,
        texto=item.texto,
        concluido=item.concluido,
        ordem=item.ordem,
    )
    db.commit()
    return resposta


@router.delete("/{checklist_item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_item_checklist(
    item_id: int,
    checklist_item_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> None:
    pertence_ao_item = any(i.id == checklist_item_id for i in listar_checklist(db, item_id))
    if not pertence_ao_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item de checklist nao encontrado.",
        )
    remover_checklist_item(db, checklist_item_id)
    db.commit()


@router.post("/redefinir-padrao", response_model=list[ChecklistItemOut])
def redefinir_checklist_do_item(
    item_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> list[ChecklistItem]:
    if not item_existe(db, item_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item nao encontrado."
        )
    itens_atuais = listar_checklist(db, item_id)
    for it in itens_atuais:
        remover_checklist_item(db, it.id)
    seed_checklist_padrao(db, item_id)
    db.commit()
    return listar_checklist(db, item_id)

