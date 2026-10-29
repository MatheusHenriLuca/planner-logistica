from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import Role, User
from app.repositories.audit_log_repository import create_audit_log
from app.repositories.parametro_repository import (
    atualizar_cargo,
    atualizar_parametro,
    criar_cargo,
    listar_cargos,
    listar_parametros,
    obter_cargo,
    obter_cargo_por_nome,
    remover_cargo,
    seed_parametros_e_cargos_padrao,
)
from app.schemas.parametro import ParametroOut, ParametroUpdate
from app.schemas.perfil import CargoCreate, CargoOut, CargoUpdate

router = APIRouter(tags=["parametros"])


@router.get("/parametros", response_model=list[ParametroOut])
def obter_parametros_sistema(
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> list[ParametroOut]:
    seed_parametros_e_cargos_padrao(db)
    db.commit()
    params = listar_parametros(db)
    return [ParametroOut.model_validate(p) for p in params]


@router.patch("/parametros/{chave}", response_model=ParametroOut)
def alterar_parametro_sistema(
    chave: str,
    payload: ParametroUpdate,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN)),  # noqa: B008
) -> ParametroOut:
    param = atualizar_parametro(db, chave, payload.valor)
    if not param:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parâmetro não encontrado.")

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="atualizar_parametro",
        entidade="parametro_sistema",
        detalhes={"chave": chave, "valor": payload.valor},
    )
    db.commit()
    return ParametroOut.model_validate(param)


@router.get("/cargos", response_model=list[CargoOut])
def listar_todos_cargos(
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> list[CargoOut]:
    seed_parametros_e_cargos_padrao(db)
    db.commit()
    cargos = listar_cargos(db)
    return [CargoOut.model_validate(c) for c in cargos]


@router.post("/cargos", response_model=CargoOut, status_code=status.HTTP_201_CREATED)
def criar_novo_cargo(
    payload: CargoCreate,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN)),  # noqa: B008
) -> CargoOut:
    nome = payload.nome.strip().lower()
    if obter_cargo_por_nome(db, nome):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cargo '{nome}' já existe.",
        )

    cargo = criar_cargo(db, payload)
    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="criar_cargo",
        entidade="cargos",
        entidade_id=cargo.id,
        detalhes={"nome": cargo.nome, "descricao": cargo.descricao},
    )
    db.commit()
    return CargoOut.model_validate(cargo)


@router.patch("/cargos/{cargo_id}", response_model=CargoOut)
def editar_cargo(
    cargo_id: int,
    payload: CargoUpdate,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN)),  # noqa: B008
) -> CargoOut:
    cargo = atualizar_cargo(db, cargo_id, payload)
    if not cargo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cargo não encontrado.",
        )

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="atualizar_cargo",
        entidade="cargos",
        entidade_id=cargo.id,
        detalhes={"nome": cargo.nome},
    )
    db.commit()
    return CargoOut.model_validate(cargo)


@router.delete("/cargos/{cargo_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_cargo(
    cargo_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN)),  # noqa: B008
) -> None:
    cargo = obter_cargo(db, cargo_id)
    if not cargo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cargo não encontrado.",
        )
    if cargo.is_sistema:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cargos nativos do sistema não podem ser removidos.",
        )

    nome = cargo.nome
    remover_cargo(db, cargo_id)
    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="remover_cargo",
        entidade="cargos",
        entidade_id=cargo_id,
        detalhes={"nome": nome},
    )
    db.commit()
