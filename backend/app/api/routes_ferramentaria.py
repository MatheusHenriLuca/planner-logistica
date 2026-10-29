import anyio
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_permission
from app.core.ws_manager import manager
from app.db.session import get_db
from app.models.user import User
from app.repositories.audit_log_repository import create_audit_log
from app.repositories.ferramentaria_repository import (
    atualizar_status_manutencao,
    criar_manutencao,
    listar_manutencoes,
    listar_materiais_bloqueados,
)
from app.schemas.ferramentaria import (
    CatalogoFerramentaCreate,
    CatalogoFerramentaOut,
    CatalogoFerramentaUpdate,
    ManutencaoCreate,
    ManutencaoOut,
    ManutencaoUpdateStatus,
)

router = APIRouter(prefix="/ferramentaria", tags=["ferramentaria"])


@router.get("/manutencoes", response_model=list[ManutencaoOut])
def get_manutencoes(
    status_filtro: str | None = Query(None, alias="status"),
    material: str | None = None,
    db: Session = Depends(get_db),  # noqa: B008
    _current_user: User = Depends(get_current_user),  # noqa: B008
) -> list[ManutencaoOut]:
    """Lista as ferramentas em manutenção ou histórico da ferramentaria."""
    itens = listar_manutencoes(db, status=status_filtro, material=material)
    return [ManutencaoOut.model_validate(it) for it in itens]


@router.get("/materiais-bloqueados", response_model=list[str])
def get_materiais_bloqueados(
    db: Session = Depends(get_db),  # noqa: B008
    _current_user: User = Depends(get_current_user),  # noqa: B008
) -> list[str]:
    """Retorna a lista de materiais atualmente bloqueados (em manutenção ou tryout)."""
    return listar_materiais_bloqueados(db)


@router.post(
    "/manutencoes",
    response_model=ManutencaoOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("pode_gerenciar_ferramentaria"))],
)
def criar_ordem_manutencao(
    payload: ManutencaoCreate,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> ManutencaoOut:
    """Cria manualmente uma ordem de manutenção/tryout de ferramenta."""
    manutencao = criar_manutencao(db, payload, usuario_id=current_user.id)
    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="criar_manutencao_ferramenta",
        entidade="ferramentaria",
        entidade_id=manutencao.id,
        detalhes={
            "material": manutencao.material,
            "motivo": manutencao.motivo_quebra,
            "status": manutencao.status,
        },
    )
    db.commit()
    anyio.from_thread.run(
        manager.broadcast,
        {"tipo": "ferramentaria_atualizada", "material": manutencao.material},
    )
    return ManutencaoOut.model_validate(manutencao)


@router.patch(
    "/manutencoes/{manutencao_id}/status",
    response_model=ManutencaoOut,
    dependencies=[Depends(require_permission("pode_gerenciar_ferramentaria"))],
)
def atualizar_status(
    manutencao_id: int,
    payload: ManutencaoUpdateStatus,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> ManutencaoOut:
    """Atualiza o estágio da ferramenta na ferramentaria ou a libera como disponível (OK)."""
    # Validações estritas quando o destino for Tryout
    if payload.status == "tryout":
        if current_user.role not in ("admin", "programador_ferramentaria"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Apenas o Programador da Ferramentaria pode agendar e enviar ferramentas para Tryout.",
            )
        if not payload.tryout_prensa or not payload.tryout_inicio or not payload.tryout_fim:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Prensa/posto e horários de início e término são obrigatórios para agendamento de Tryout.",
            )
        if payload.tryout_fim <= payload.tryout_inicio:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O horário de término do Tryout deve ser posterior ao horário de início.",
            )

    manutencao = atualizar_status_manutencao(
        db,
        manutencao_id,
        status=payload.status,
        observacoes=payload.observacoes,
        tryout_setor=payload.tryout_setor,
        tryout_prensa=payload.tryout_prensa,
        tryout_ferramenta=payload.tryout_ferramenta,
        tryout_inicio=payload.tryout_inicio,
        tryout_fim=payload.tryout_fim,
    )
    if not manutencao:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registro de manutenção não encontrado.",
        )

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="atualizar_status_ferramenta",
        entidade="ferramentaria",
        entidade_id=manutencao.id,
        detalhes={
            "material": manutencao.material,
            "novo_status": manutencao.status,
            "tryout_prensa": manutencao.tryout_prensa,
            "tryout_setor": manutencao.tryout_setor,
            "tryout_inicio": str(manutencao.tryout_inicio) if manutencao.tryout_inicio else None,
            "tryout_fim": str(manutencao.tryout_fim) if manutencao.tryout_fim else None,
            "data_liberacao": str(manutencao.data_liberacao) if manutencao.data_liberacao else None,
        },
    )
    anyio.from_thread.run(
        manager.broadcast,
        {"tipo": "ferramentaria_atualizada", "material": manutencao.material},
    )
    return ManutencaoOut.model_validate(manutencao)


# --- Rotas do Catálogo de Ferramentas & Preventivas ---


@router.get("/catalogo", response_model=list[CatalogoFerramentaOut])
def get_catalogo_ferramentas(
    setor: str | None = None,
    busca: str | None = None,
    db: Session = Depends(get_db),  # noqa: B008
    _current_user: User = Depends(get_current_user),  # noqa: B008
) -> list[CatalogoFerramentaOut]:
    """Lista as ferramentas cadastradas no catálogo com status preventivo."""
    from app.repositories.ferramentaria_repository import listar_catalogo

    return listar_catalogo(db, setor=setor, busca=busca)


@router.post(
    "/catalogo",
    response_model=CatalogoFerramentaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("pode_gerenciar_ferramentaria"))],
)
def criar_ferramenta_no_catalogo(
    payload: CatalogoFerramentaCreate,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> CatalogoFerramentaOut:
    """Cadastra uma nova ferramenta no catálogo mestre da ferramentaria."""
    from app.repositories.ferramentaria_repository import criar_ferramenta_catalogo, _calcular_status_preventiva

    ferr = criar_ferramenta_catalogo(db, payload)
    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="criar_ferramenta_catalogo",
        entidade="ferramentaria_catalogo",
        entidade_id=ferr.id,
        detalhes={"codigo": ferr.codigo, "periodicidade_dias": ferr.periodicidade_dias},
    )
    db.commit()
    st, dias = _calcular_status_preventiva(ferr)
    return CatalogoFerramentaOut(
        id=ferr.id,
        codigo=ferr.codigo,
        descricao=ferr.descricao,
        setor=ferr.setor,
        linha=ferr.linha,
        posto_trabalho=ferr.posto_trabalho,
        periodicidade_dias=ferr.periodicidade_dias,
        ultima_manutencao=ferr.ultima_manutencao,
        proxima_manutencao=ferr.proxima_manutencao,
        observacoes=ferr.observacoes,
        ativo=ferr.ativo,
        status_preventiva=st,
        dias_restantes=dias,
    )


@router.put(
    "/catalogo/{catalogo_id}",
    response_model=CatalogoFerramentaOut,
    dependencies=[Depends(require_permission("pode_gerenciar_ferramentaria"))],
)
def atualizar_ferramenta_no_catalogo(
    catalogo_id: int,
    payload: CatalogoFerramentaUpdate,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> CatalogoFerramentaOut:
    """Atualiza dados cadastrais ou periodicidade de uma ferramenta."""
    from app.repositories.ferramentaria_repository import atualizar_ferramenta_catalogo, _calcular_status_preventiva

    ferr = atualizar_ferramenta_catalogo(db, catalogo_id, payload)
    if not ferr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ferramenta não encontrada.")

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="atualizar_ferramenta_catalogo",
        entidade="ferramentaria_catalogo",
        entidade_id=ferr.id,
        detalhes={"codigo": ferr.codigo},
    )
    db.commit()
    st, dias = _calcular_status_preventiva(ferr)
    return CatalogoFerramentaOut(
        id=ferr.id,
        codigo=ferr.codigo,
        descricao=ferr.descricao,
        setor=ferr.setor,
        linha=ferr.linha,
        posto_trabalho=ferr.posto_trabalho,
        periodicidade_dias=ferr.periodicidade_dias,
        ultima_manutencao=ferr.ultima_manutencao,
        proxima_manutencao=ferr.proxima_manutencao,
        observacoes=ferr.observacoes,
        ativo=ferr.ativo,
        status_preventiva=st,
        dias_restantes=dias,
    )


@router.delete(
    "/catalogo/{catalogo_id}",
    dependencies=[Depends(require_permission("pode_gerenciar_ferramentaria"))],
)
def remover_ferramenta_do_catalogo(
    catalogo_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> dict:
    """Remove uma ferramenta do catálogo."""
    from app.repositories.ferramentaria_repository import remover_ferramenta_catalogo

    ok = remover_ferramenta_catalogo(db, catalogo_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ferramenta não encontrada.")
    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="remover_ferramenta_catalogo",
        entidade="ferramentaria_catalogo",
        entidade_id=catalogo_id,
        detalhes={},
    )
    db.commit()
    return {"ok": True}


@router.post(
    "/catalogo/{catalogo_id}/abrir-preventiva",
    response_model=ManutencaoOut,
    dependencies=[Depends(require_permission("pode_gerenciar_ferramentaria"))],
)
def acionar_preventiva(
    catalogo_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> ManutencaoOut:
    """Abre ordem de manutenção preventiva para uma ferramenta com 1 clique."""
    from app.repositories.ferramentaria_repository import abrir_preventiva_catalogo

    manutencao = abrir_preventiva_catalogo(db, catalogo_id, usuario_id=current_user.id)
    if not manutencao:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ferramenta não encontrada.")

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="abrir_preventiva_ferramenta",
        entidade="ferramentaria",
        entidade_id=manutencao.id,
        detalhes={"material": manutencao.material, "tipo": "preventiva"},
    )
    db.commit()
    anyio.from_thread.run(
        manager.broadcast,
        {"tipo": "ferramentaria_atualizada", "material": manutencao.material},
    )
    return ManutencaoOut.model_validate(manutencao)

