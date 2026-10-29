from collections import defaultdict
from datetime import datetime, time, timezone

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.datetime_utils import agora_brasilia
from app.core.deps import get_current_user, require_role
from app.core.ws_manager import manager
from app.db.session import get_db
from app.domain.patan import Patan
from app.domain.sequenciamento import Turno
from app.domain.status import PlanItemStatus
from app.models.ferramentaria import ManutencaoFerramenta
from app.models.producao import ColunaExtra, ItemProducao
from app.models.user import Role, User
from app.repositories.audit_log_repository import create_audit_log
from app.repositories.colaboracao_repository import criar_comentario
from app.repositories.parametro_repository import obter_parametro
from app.repositories.producao_repository import (
    editar_item_persistido,
    excluir_item_producao,
    inserir_item_producao_direto,
    listar_persistidos,
    mover_para_coluna_extra,
    reordenar_persistidos,
)
from app.schemas.colaboracao import AnotacoesOut, AnotacoesUpdate
from app.schemas.ferramentaria import ConcluirProducaoPayload, QuebraFerramentaPayload
from app.schemas.producao import (
    EditarItemProducaoRequest,
    InserirItemProducaoRequest,
    InserirItemProducaoResponse,
    ItemProducaoOut,
    ReordenarProducaoRequest,
    to_item_producao_out,
)

router = APIRouter(prefix="/producao", tags=["producao"])


def enriquecer_itens_producao_em_linha(itens: list[ItemProducaoOut]) -> list[ItemProducaoOut]:
    """Identifica materiais em tandem / Produção em Linha (presentes em mais de um posto da linha).
    
    Regras de ouro de domínio:
    1. Itens em colunas extras (Concluídas, Quebra, etc.) NUNCA recebem marcação de produção em linha.
    2. Apenas itens ativos (coluna_extra_id is None) e com status NORMAL contam.
    3. O agrupamento em tandem é estritamente fechado por (linha, turno, data_planejada, material).
    """
    postos_por_chave: dict[tuple, set[str]] = defaultdict(set)
    for it in itens:
        if it.coluna_extra_id is not None or it.status == PlanItemStatus.EXCLUIDO.value:
            continue
        mat = (it.material or "").strip().upper()
        if mat:
            data_str = it.hora_inicial.strftime("%Y-%m-%d") if it.hora_inicial else "sem_data"
            chave = (it.linha, it.turno, data_str, mat)
            postos_por_chave[chave].add(it.posto_trabalho)

    for it in itens:
        if it.coluna_extra_id is not None or it.status == PlanItemStatus.EXCLUIDO.value:
            it.producao_em_linha = False
            it.postos_vinculados = []
            continue

        mat = (it.material or "").strip().upper()
        data_str = it.hora_inicial.strftime("%Y-%m-%d") if it.hora_inicial else "sem_data"
        chave = (it.linha, it.turno, data_str, mat)
        postos = postos_por_chave.get(chave, set())

        if mat and len(postos) > 1:
            it.producao_em_linha = True
            it.postos_vinculados = sorted(list(postos))
        else:
            it.producao_em_linha = False
            it.postos_vinculados = []

    return itens


@router.get("/tabela-b", response_model=list[ItemProducaoOut])
def listar_tabela_b(
    linha: str | None = None,
    setor: str | None = Query(None),
    patan: str | None = None,
    turno: Turno | None = None,
    data: str | None = Query(None, description="Filtro por data no formato YYYY-MM-DD ou todas"),
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> list[ItemProducaoOut]:
    registros = listar_persistidos(
        db,
        linha=linha,
        patan=patan.value if hasattr(patan, "value") else patan,
        turno=turno.value if turno is not None else None,
        setor=setor,
        data=data,
    )
    itens = [to_item_producao_out(r) for r in registros]
    return enriquecer_itens_producao_em_linha(itens)


@router.patch("/reordenar", response_model=list[ItemProducaoOut])
def reordenar_producao(
    payload: ReordenarProducaoRequest,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
) -> list[ItemProducaoOut]:
    registros = reordenar_persistidos(
        db,
        payload.linha,
        payload.turno.value if payload.turno is not None else None,
        payload.patan.value if payload.patan is not None else None,
        payload.posto_trabalho,
        payload.ids_em_ordem,
        setor=payload.setor,
        recalcular_horarios=payload.recalcular_horarios,
    )
    if registros is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item(ns) nao encontrados neste posto/escopo.",
        )
    resposta = [to_item_producao_out(r) for r in registros]
    resposta = enriquecer_itens_producao_em_linha(resposta)
    
    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="reordenar_producao",
        entidade="producao",
        detalhes={
            "linha": payload.linha,
            "turno": payload.turno.value if payload.turno is not None else None,
            "patan": payload.patan.value if payload.patan is not None else None,
            "posto_trabalho": payload.posto_trabalho,
        }
    )
    
    db.commit()
    anyio.from_thread.run(
        manager.broadcast,
        {
            "tipo": "producao_atualizada",
            "linha": payload.linha,
            "setor": payload.setor,
            "turno": payload.turno.value if payload.turno is not None else None,
            "patan": payload.patan.value if payload.patan is not None else None,
        },
    )
    return resposta


@router.post("/inserir-card", response_model=InserirItemProducaoResponse)
def inserir_card_producao(
    payload: InserirItemProducaoRequest,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
) -> InserirItemProducaoResponse:
    # Carregar configurações dinâmicas de horários e refeições
    shift_start_times = None
    meal_times = None
    lunch_break_minutes = 40
    try:
        p_t1 = obter_parametro(db, "hora_inicio_turno_1")
        p_t2 = obter_parametro(db, "hora_inicio_turno_2")
        p_t3 = obter_parametro(db, "hora_inicio_turno_3")
        if p_t1 and p_t2 and p_t3:
            h1, m1 = map(int, p_t1.valor.split(":"))
            h2, m2 = map(int, p_t2.valor.split(":"))
            h3, m3 = map(int, p_t3.valor.split(":"))
            shift_start_times = {
                Turno.PRIMEIRO: time(h1, m1),
                Turno.SEGUNDO: time(h2, m2),
                Turno.TERCEIRO: time(h3, m3),
            }

        p_m1 = obter_parametro(db, "hora_refeicao_turno_1")
        p_m2 = obter_parametro(db, "hora_refeicao_turno_2")
        p_m3 = obter_parametro(db, "hora_refeicao_turno_3")
        if p_m1 and p_m2 and p_m3:
            mh1, mm1 = map(int, p_m1.valor.split(":"))
            mh2, mm2 = map(int, p_m2.valor.split(":"))
            mh3, mm3 = map(int, p_m3.valor.split(":"))
            meal_times = {
                Turno.PRIMEIRO: time(mh1, mm1),
                Turno.SEGUNDO: time(mh2, mm2),
                Turno.TERCEIRO: time(mh3, mm3),
            }

        p_dur = obter_parametro(db, "duracao_refeicao_minutos")
        if p_dur:
            lunch_break_minutes = int(p_dur.valor)
    except Exception:
        pass

    novo_item, afetados = inserir_item_producao_direto(
        db=db,
        setor=payload.setor,
        linha=payload.linha,
        turno=payload.turno.value,
        patan=payload.patan.value,
        posto_trabalho=payload.posto_trabalho,
        material=payload.material,
        kanbans=payload.kanbans,
        qtd_por_kanban=payload.qtd_por_kanban,
        tempo_por_peca_minutos=payload.tempo_por_peca_minutos,
        hora_inicial=payload.hora_inicial,
        is_critico=payload.is_critico,
        demanda=payload.demanda,
        saldo_estoque=payload.saldo_estoque,
        lunch_break_minutes=lunch_break_minutes,
        meal_times=meal_times,
        shift_start_times=shift_start_times,
    )

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="inserir_card_producao",
        entidade="producao",
        detalhes={
            "item_id": novo_item.id,
            "setor": payload.setor,
            "linha": payload.linha,
            "turno": payload.turno.value,
            "posto_trabalho": payload.posto_trabalho,
            "material": payload.material,
            "hora_inicial": payload.hora_inicial.isoformat(),
            "itens_reordenados": len(afetados),
        },
    )
    db.commit()

    anyio.from_thread.run(
        manager.broadcast,
        {
            "tipo": "producao_atualizada",
            "linha": payload.linha,
            "setor": payload.setor,
            "turno": payload.turno.value,
        },
    )

    return InserirItemProducaoResponse(
        item_criado=to_item_producao_out(novo_item),
        total_afetados=len(afetados),
        mensagem=f"Card de {payload.material} inserido com sucesso às {novo_item.hora_inicial.strftime('%H:%M')}. {len(afetados)} item(ns) subsequentes reordenados.",
    )


@router.patch("/itens/{item_id}/iniciar-producao", response_model=ItemProducaoOut)
def iniciar_producao_item(
    item_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> ItemProducaoOut:
    item = db.get(ItemProducao, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item não encontrado.")

    if item.coluna_extra_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível iniciar um item que já foi concluído ou arquivado.",
        )

    # Identifica o grupo de Produção em Linha (Tandem):
    # Mesmo setor, linha, turno, material, data_planejada (data de hora_inicial), ativos (coluna_extra_id is None e status normal)
    item_data_str = item.hora_inicial.strftime("%Y-%m-%d") if item.hora_inicial else None
    mat = (item.material or "").strip()

    grupo_tandem = [item]
    if mat:
        stmt_irmaos = select(ItemProducao).where(
            ItemProducao.setor == item.setor,
            ItemProducao.linha == item.linha,
            ItemProducao.turno == item.turno,
            ItemProducao.material == item.material,
            ItemProducao.coluna_extra_id.is_(None),
            ItemProducao.status == PlanItemStatus.NORMAL.value,
            ItemProducao.id != item.id,
        )
        for irmao in db.scalars(stmt_irmaos).all():
            irmao_data_str = irmao.hora_inicial.strftime("%Y-%m-%d") if irmao.hora_inicial else None
            if irmao_data_str == item_data_str:
                grupo_tandem.append(irmao)

    # Regra de Posição 0 / Topo da Fila e Guarda Tandem:
    # Para cada posto participante do lote (ou do item solo), verifica se há algum item anterior não concluído
    for part in grupo_tandem:
        stmt_anteriores = select(ItemProducao).where(
            ItemProducao.setor == part.setor,
            ItemProducao.linha == part.linha,
            ItemProducao.turno == part.turno,
            ItemProducao.posto_trabalho == part.posto_trabalho,
            ItemProducao.coluna_extra_id.is_(None),
            ItemProducao.status == PlanItemStatus.NORMAL.value,
            ItemProducao.id != part.id,
            ItemProducao.sequencia < part.sequencia,
        )
        anteriores = list(db.scalars(stmt_anteriores).all())
        if anteriores:
            primeiro_bloqueador = min(anteriores, key=lambda x: x.sequencia)
            if len(grupo_tandem) > 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Não é possível iniciar a Produção em Linha: o posto {part.posto_trabalho} ainda precisa concluir o item '{primeiro_bloqueador.material}' antes deste lote.",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"O posto {part.posto_trabalho} ainda precisa concluir o item '{primeiro_bloqueador.material}' antes de iniciar este lote.",
                )

    now = agora_brasilia()
    postos_sincronizados = []
    for part in grupo_tandem:
        part.em_producao = True
        if not part.inicio_real:
            part.inicio_real = now
        postos_sincronizados.append(part.posto_trabalho)

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="iniciar_producao",
        entidade="producao",
        entidade_id=item.id,
        detalhes={
            "material": item.material,
            "posto": item.posto_trabalho,
            "linha": item.linha,
            "turno": item.turno,
            "postos_sincronizados": postos_sincronizados,
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
    res = to_item_producao_out(item)
    if len(postos_sincronizados) > 1:
        res.producao_em_linha = True
        res.postos_vinculados = sorted(postos_sincronizados)
    return res


@router.patch("/itens/{item_id}/pausar-producao", response_model=ItemProducaoOut)
def pausar_producao_item(
    item_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> ItemProducaoOut:
    item = db.get(ItemProducao, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item não encontrado.")

    item.em_producao = False
    postos_pausados = [item.posto_trabalho]
    item_data_str = item.hora_inicial.strftime("%Y-%m-%d") if item.hora_inicial else None
    if item.material and item.material.strip():
        stmt_irmaos = select(ItemProducao).where(
            ItemProducao.setor == item.setor,
            ItemProducao.linha == item.linha,
            ItemProducao.turno == item.turno,
            ItemProducao.material == item.material,
            ItemProducao.em_producao.is_(True),
            ItemProducao.id != item.id,
        )
        irmaos = list(db.scalars(stmt_irmaos).all())
        for irmao in irmaos:
            irmao_data_str = irmao.hora_inicial.strftime("%Y-%m-%d") if irmao.hora_inicial else None
            if irmao_data_str == item_data_str:
                irmao.em_producao = False
                postos_pausados.append(irmao.posto_trabalho)

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="pausar_producao",
        entidade="producao",
        entidade_id=item.id,
        detalhes={
            "material": item.material,
            "posto": item.posto_trabalho,
            "postos_pausados": postos_pausados,
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
    res = to_item_producao_out(item)
    if len(postos_pausados) > 1:
        res.producao_em_linha = True
        res.postos_vinculados = sorted(postos_pausados)
    return res


@router.patch("/itens/{item_id}/desfazer-inicio", response_model=ItemProducaoOut)
def desfazer_inicio_item(
    item_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> ItemProducaoOut:
    item = db.get(ItemProducao, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item não encontrado.")

    if not item.em_producao:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item não está em produção.")

    item.em_producao = False
    item.inicio_real = None

    postos_desfeitos = [item.posto_trabalho]
    item_data_str = item.hora_inicial.strftime("%Y-%m-%d") if item.hora_inicial else None
    if item.material and item.material.strip():
        stmt_irmaos = select(ItemProducao).where(
            ItemProducao.setor == item.setor,
            ItemProducao.linha == item.linha,
            ItemProducao.turno == item.turno,
            ItemProducao.material == item.material,
            ItemProducao.em_producao.is_(True),
            ItemProducao.id != item.id,
        )
        irmaos = list(db.scalars(stmt_irmaos).all())
        for irmao in irmaos:
            irmao_data_str = irmao.hora_inicial.strftime("%Y-%m-%d") if irmao.hora_inicial else None
            if irmao_data_str == item_data_str:
                irmao.em_producao = False
                irmao.inicio_real = None
                postos_desfeitos.append(irmao.posto_trabalho)

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="desfazer_inicio_acidental",
        entidade="producao",
        entidade_id=item.id,
        detalhes={
            "material": item.material,
            "posto": item.posto_trabalho,
            "postos_desfeitos": postos_desfeitos,
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
    res = to_item_producao_out(item)
    if len(postos_desfeitos) > 1:
        res.producao_em_linha = True
        res.postos_vinculados = sorted(postos_desfeitos)
    return res


@router.patch("/itens/{item_id}/concluir-producao", response_model=ItemProducaoOut)
def concluir_producao_item(
    item_id: int,
    payload: ConcluirProducaoPayload,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> ItemProducaoOut:
    item = db.get(ItemProducao, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item não encontrado.")

    # Procura coluna extra 'Concluídas' ou 'Concluidas'
    coluna = db.scalar(select(ColunaExtra).where(func.lower(ColunaExtra.nome) == "concluídas"))
    if not coluna:
        coluna = db.scalar(select(ColunaExtra).where(func.lower(ColunaExtra.nome) == "concluidas"))
    if not coluna:
        coluna = ColunaExtra(nome="Concluídas")
        db.add(coluna)
        db.flush()

    mover_para_coluna_extra(db, item.id, coluna.id)
    item.em_producao = False
    item.sequencia = 0
    item.fim_real = agora_brasilia()
    item.quantidade_produzida_real = payload.pecas_produzidas
    item.motivo_interrupcao = None

    if payload.comentarios and payload.comentarios.strip():
        criar_comentario(
            db=db,
            item_producao_id=item.id,
            autor_id=current_user.id,
            texto=f"Conclusão de produção ({payload.pecas_produzidas} peças): {payload.comentarios.strip()}",
        )

    # Identificar se o item faz parte de Produção em Linha (Tandem) para concluir os postos parceiros
    postos_concluidos = [item.posto_trabalho]
    item_data_str = item.hora_inicial.strftime("%Y-%m-%d") if item.hora_inicial else None
    if item.material and item.material.strip():
        stmt_irmaos = select(ItemProducao).where(
            ItemProducao.setor == item.setor,
            ItemProducao.linha == item.linha,
            ItemProducao.turno == item.turno,
            ItemProducao.material == item.material,
            ItemProducao.em_producao.is_(True),
            ItemProducao.id != item.id,
        )
        irmaos = list(db.scalars(stmt_irmaos).all())
        for irmao in irmaos:
            irmao_data_str = irmao.hora_inicial.strftime("%Y-%m-%d") if irmao.hora_inicial else None
            if irmao_data_str == item_data_str:
                mover_para_coluna_extra(db, irmao.id, coluna.id)
                irmao.em_producao = False
                irmao.sequencia = 0
                irmao.fim_real = item.fim_real
                irmao.quantidade_produzida_real = payload.pecas_produzidas
                irmao.motivo_interrupcao = None
                postos_concluidos.append(irmao.posto_trabalho)
                if payload.comentarios and payload.comentarios.strip():
                    criar_comentario(
                        db=db,
                        item_producao_id=irmao.id,
                        autor_id=current_user.id,
                        texto=f"Conclusão em linha sincronizada com {item.posto_trabalho} ({payload.pecas_produzidas} peças): {payload.comentarios.strip()}",
                    )

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="concluir_producao",
        entidade="producao",
        entidade_id=item.id,
        detalhes={
            "material": item.material,
            "posto": item.posto_trabalho,
            "pecas_produzidas": payload.pecas_produzidas,
            "comentarios": payload.comentarios,
            "coluna_extra": coluna.nome,
            "postos_concluidos": postos_concluidos,
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
    return to_item_producao_out(item)


@router.patch("/itens/{item_id}/quebra-ferramenta", response_model=ItemProducaoOut)
def registrar_quebra_ferramenta_item(
    item_id: int,
    payload: QuebraFerramentaPayload,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> ItemProducaoOut:
    item = db.get(ItemProducao, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item não encontrado.")

    # Procura coluna extra 'Quebra de Máquina' ou 'Quebra de Maquina'
    coluna = db.scalar(
        select(ColunaExtra).where(
            func.lower(ColunaExtra.nome).in_(["quebra de máquina", "quebra de maquina", "quebra"])
        )
    )
    if not coluna:
        coluna = ColunaExtra(nome="Quebra de Máquina")
        db.add(coluna)
        db.flush()

    mover_para_coluna_extra(db, item.id, coluna.id)
    item.em_producao = False
    item.sequencia = 0
    item.fim_real = agora_brasilia()
    item.quantidade_produzida_real = payload.pecas_produzidas
    item.motivo_interrupcao = "quebra"

    # Cria registro formal na ferramentaria
    mat_code = item.material or item.posto_trabalho
    manutencao = ManutencaoFerramenta(
        material=mat_code,
        descricao=f"{mat_code} - Linha {item.linha} ({item.posto_trabalho})",
        linha=item.linha,
        posto_trabalho=item.posto_trabalho,
        status="aguardando_manutencao",
        motivo_quebra=payload.motivo_quebra,
        pecas_produzidas=payload.pecas_produzidas,
        observacoes=payload.observacoes or "",
        data_quebra=agora_brasilia(),
        usuario_id=current_user.id,
    )
    db.add(manutencao)

    # Cria comentário no card para visibilidade do operador
    comentario_txt = (
        f"⚠️ [QUEBRA DE MÁQUINA/FERRAMENTA] Peças produzidas até a avaria: {payload.pecas_produzidas}. "
        f"Motivo: {payload.motivo_quebra}"
    )
    if payload.observacoes and payload.observacoes.strip():
        comentario_txt += f" | Obs: {payload.observacoes.strip()}"
    criar_comentario(db=db, item_producao_id=item.id, autor_id=current_user.id, texto=comentario_txt)

    # Regra de Produção em Linha (Tandem):
    # O card que teve quebra vai para conserto na Ferramentaria;
    # Os outros cards vinculados em tandem entram como CONCLUÍDAS normalmente.
    postos_concluidos_tandem: list[str] = []
    item_data_str = item.hora_inicial.strftime("%Y-%m-%d") if item.hora_inicial else None
    if item.material and item.material.strip():
        stmt_irmaos = select(ItemProducao).where(
            ItemProducao.setor == item.setor,
            ItemProducao.linha == item.linha,
            ItemProducao.turno == item.turno,
            ItemProducao.material == item.material,
            ItemProducao.em_producao.is_(True),
            ItemProducao.id != item.id,
        )
        irmaos = list(db.scalars(stmt_irmaos).all())
        if irmaos:
            coluna_concluidas = db.scalar(
                select(ColunaExtra).where(func.lower(ColunaExtra.nome) == "concluídas")
            )
            if not coluna_concluidas:
                coluna_concluidas = db.scalar(
                    select(ColunaExtra).where(func.lower(ColunaExtra.nome) == "concluidas")
                )
            if not coluna_concluidas:
                coluna_concluidas = ColunaExtra(nome="Concluídas")
                db.add(coluna_concluidas)
                db.flush()

            for irmao in irmaos:
                irmao_data_str = irmao.hora_inicial.strftime("%Y-%m-%d") if irmao.hora_inicial else None
                if irmao_data_str == item_data_str:
                    mover_para_coluna_extra(db, irmao.id, coluna_concluidas.id)
                    irmao.em_producao = False
                    irmao.sequencia = 0
                    irmao.fim_real = item.fim_real
                    irmao.quantidade_produzida_real = payload.pecas_produzidas
                    irmao.motivo_interrupcao = None
                    postos_concluidos_tandem.append(irmao.posto_trabalho)
                    criar_comentario(
                        db=db,
                        item_producao_id=irmao.id,
                        autor_id=current_user.id,
                        texto=(
                            f"✓ Concluído via encerramento em linha por quebra no posto parceiro {item.posto_trabalho} "
                            f"({payload.pecas_produzidas} peças produzidas)."
                        ),
                    )

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="quebra_ferramenta",
        entidade="producao",
        entidade_id=item.id,
        detalhes={
            "material": item.material,
            "posto": item.posto_trabalho,
            "pecas_produzidas": payload.pecas_produzidas,
            "motivo_quebra": payload.motivo_quebra,
            "coluna_extra": coluna.nome,
            "postos_concluidos_tandem": postos_concluidos_tandem,
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
    anyio.from_thread.run(
        manager.broadcast,
        {
            "tipo": "ferramentaria_atualizada",
            "material": mat_code,
        },
    )
    return to_item_producao_out(item)


@router.get("/itens/{item_id}/anotacoes", response_model=AnotacoesOut)
def obter_anotacoes_do_item(
    item_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> AnotacoesOut:
    item = db.get(ItemProducao, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item nao encontrado.")
    return AnotacoesOut(
        item_id=item.id,
        anotacoes=item.anotacoes or "",
        mostrar_anotacoes_quadro=bool(item.mostrar_anotacoes_quadro),
    )


@router.patch("/itens/{item_id}/anotacoes", response_model=ItemProducaoOut)
def atualizar_anotacoes(
    item_id: int,
    payload: AnotacoesUpdate,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
) -> ItemProducaoOut:
    item = db.get(ItemProducao, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item nao encontrado.")

    item.anotacoes = payload.anotacoes
    item.mostrar_anotacoes_quadro = payload.mostrar_anotacoes_quadro

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="atualizar_anotacoes",
        entidade="producao",
        entidade_id=item.id,
        detalhes={
            "material": item.material,
            "mostrar_anotacoes_quadro": payload.mostrar_anotacoes_quadro,
        },
    )
    db.commit()

    anyio.from_thread.run(
        manager.broadcast,
        {
            "tipo": "producao_atualizada",
            "linha": item.linha,
            "setor": item.setor,
            "turno": item.turno,
        },
    )

    return to_item_producao_out(item)


@router.patch("/itens/{item_id}", response_model=ItemProducaoOut)
def editar_item_producao(
    item_id: int,
    payload: EditarItemProducaoRequest,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
) -> ItemProducaoOut:
    try:
        item = editar_item_persistido(db, item_id, payload)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item nao encontrado.")

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="editar_item_producao",
        entidade="producao",
        entidade_id=item.id,
        detalhes={
            "material": item.material,
            "posto": item.posto_trabalho,
            "kanbans": item.kanbans,
            "qtd_por_kanban": item.qtd_por_kanban,
            "hora_inicial": item.hora_inicial.isoformat() if item.hora_inicial else None,
            "hora_final": item.hora_final.isoformat() if item.hora_final else None,
            "recalcular_subsequentes": payload.recalcular_subsequentes,
        },
    )
    db.commit()

    anyio.from_thread.run(
        manager.broadcast,
        {
            "tipo": "producao_atualizada",
            "linha": item.linha,
            "setor": item.setor,
            "turno": item.turno,
            "patan": item.patan,
        },
    )

    return to_item_producao_out(item)


@router.delete("/itens/{item_id}", status_code=status.HTTP_200_OK)
def excluir_item_producao_endpoint(
    item_id: int,
    remover_irmaos_tandem: bool = Query(True, description="Se for item em tandem, remove também das máquinas parceiras"),
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
) -> dict[str, object]:
    resultado = excluir_item_producao(db, item_id, remover_irmaos_tandem=remover_irmaos_tandem)
    if not resultado:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item nao encontrado.")

    item, irmaos = resultado
    total_removidos = 1 + len(irmaos)

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="excluir_item_producao",
        entidade="producao",
        entidade_id=item.id,
        detalhes={
            "material": item.material,
            "posto": item.posto_trabalho,
            "total_removidos": total_removidos,
            "postos_removidos": [item.posto_trabalho, *[i.posto_trabalho for i in irmaos]],
            "remover_irmaos_tandem": remover_irmaos_tandem,
        },
    )
    db.commit()

    anyio.from_thread.run(
        manager.broadcast,
        {
            "tipo": "producao_atualizada",
            "linha": item.linha,
            "setor": item.setor,
            "turno": item.turno,
            "patan": item.patan,
        },
    )

    return {
        "mensagem": f"Item {item.material} removido com sucesso ({total_removidos} ordens removidas). Cascata recalculada.",
        "itens_removidos": total_removidos,
    }


@router.delete("/limpar-producao", status_code=status.HTTP_200_OK)
def limpar_producao(
    linha: str = Query(..., description="Nome da linha a ser limpa"),
    setor: str = Query("solda", description="Setor ('solda' ou 'estamparia')"),
    turno: int | None = Query(None, description="Turno opcional (se omitido, limpa todos os turnos da linha)"),
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN)),  # noqa: B008
) -> dict[str, object]:
    from sqlalchemy import delete

    condicoes = [
        ItemProducao.linha == linha,
        ItemProducao.setor == setor,
    ]
    if turno is not None:
        condicoes.append(ItemProducao.turno == turno)

    stmt = delete(ItemProducao).where(*condicoes)
    res = db.execute(stmt)
    removidos = res.rowcount

    create_audit_log(
        db=db,
        usuario_id=current_user.id,
        acao="limpar_producao",
        entidade="producao",
        detalhes={
            "linha": linha,
            "setor": setor,
            "turno": turno,
            "itens_removidos": removidos,
        },
    )
    db.commit()

    anyio.from_thread.run(
        manager.broadcast,
        {
            "tipo": "producao_atualizada",
            "linha": linha,
            "setor": setor,
            "turno": turno,
        },
    )

    return {
        "mensagem": f"Produção da {linha} ({setor}) limpa com sucesso.",
        "itens_removidos": removidos,
        "linha": linha,
        "setor": setor,
        "turno": turno,
    }

