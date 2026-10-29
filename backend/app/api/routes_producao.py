import logging
import re
from typing import Any
from collections import defaultdict
from datetime import date, datetime, time, timedelta

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.core.ws_manager import manager
from app.db.session import get_db
from app.domain.estoque import diagnosticar_estoque
from app.domain.patan import Patan
from app.domain.sequenciamento import (
    LUNCH_BREAK_MINUTES,
    MEAL_TIME,
    SHIFT_START_TIME,
    SequenciaItem,
    Turno,
    _meal_datetime,
    calcular_cascata,
    calcular_tempo_producao_minutos,
)
from app.domain.status import PlanItemStatus
from app.models.producao import ItemProducaoStaging
from app.models.user import Role, User
from app.repositories.audit_log_repository import create_audit_log
from app.repositories.ferramentaria_repository import listar_materiais_bloqueados
from app.repositories.parametro_repository import obter_parametro
from app.repositories.producao_repository import (
    bulk_persist,
    get_pecas_criticas_by_linha,
    get_staging_itens,
    limpar_staging_apos_submit,
)
from app.schemas.producao import (
    BulkSubmitRequest,
    ItemProducaoOut,
    SequenciaResponse,
    to_item_producao_out,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/producao", tags=["producao"])


@router.get("/sequencia", response_model=SequenciaResponse)
def obter_sequencia(
    linha: str,
    turno: Turno,
    patan: str,
    setor: str = Query("solda"),
    data_base: date | None = None,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> SequenciaResponse:
    # Local wall-clock day: shift start times (SHIFT_START_TIME) are naive
    # local times with no tz concept anywhere in this domain.
    data = data_base or date.today()  # noqa: DTZ011
    patan_str = patan.value if hasattr(patan, "value") else str(patan).strip().upper()
    staging = get_staging_itens(db, current_user.id, linha, turno.value, patan_str, setor=setor)
    criticos = get_pecas_criticas_by_linha(db, current_user.id, linha, setor=setor)

    if not staging:
        total_setor = db.scalar(
            select(func.count(ItemProducaoStaging.id)).where(ItemProducaoStaging.setor == setor)
        ) or 0
        if total_setor == 0:
            try:
                from app.services.excel_import import importar_staging
                from app.core.config import get_settings
                settings = get_settings()
                base_excel = Path(settings.excel_path)
                if setor == "estamparia":
                    excel_path = base_excel.parent / "AutomacaoPlanner_Estamparia.xlsx"
                else:
                    excel_path = base_excel
                if excel_path.is_file():
                    importar_staging(db, current_user.id, excel_path, setor=setor)
                    db.commit()
                    staging = get_staging_itens(db, current_user.id, linha, turno.value, patan_str, setor=setor)
                    criticos = get_pecas_criticas_by_linha(db, current_user.id, linha, setor=setor)
            except Exception as exc:
                logger.warning("Falha no auto-import de staging para setor %s: %s", setor, exc)

    # get_staging_itens and get_pecas_criticas_by_linha can both return the
    # same physical row (a CRITICO item that also belongs to the exact
    # queried scope) - dedupe by id so it renders once, not twice.
    registros_por_posto: dict[str, list[ItemProducaoStaging]] = defaultdict(list)
    vistos: set[int] = set()
    for registro in [*staging, *criticos]:
        if registro.id in vistos:
            continue
        vistos.add(registro.id)
        registros_por_posto[registro.posto_trabalho].append(registro)

    resultado: list[ItemProducaoOut] = []
    
    # Carrega horários configurados dos turnos e refeições se existirem no banco
    shift_starts = dict(SHIFT_START_TIME)
    meal_times = dict(MEAL_TIME)
    lunch_break_min = LUNCH_BREAK_MINUTES

    def _parse_time(val: str | None, default_val: time) -> time:
        if not val or ":" not in val:
            return default_val
        try:
            parts = val.strip().split(":")
            return time(int(parts[0]), int(parts[1]))
        except Exception:
            return default_val

    p_t1 = obter_parametro(db, "hora_inicio_turno_1")
    p_t2 = obter_parametro(db, "hora_inicio_turno_2")
    p_t3 = obter_parametro(db, "hora_inicio_turno_3")
    if p_t1: shift_starts[Turno.PRIMEIRO] = _parse_time(p_t1.valor, shift_starts[Turno.PRIMEIRO])
    if p_t2: shift_starts[Turno.SEGUNDO] = _parse_time(p_t2.valor, shift_starts[Turno.SEGUNDO])
    if p_t3: shift_starts[Turno.TERCEIRO] = _parse_time(p_t3.valor, shift_starts[Turno.TERCEIRO])

    p_m1 = obter_parametro(db, "hora_refeicao_turno_1")
    p_m2 = obter_parametro(db, "hora_refeicao_turno_2")
    p_m3 = obter_parametro(db, "hora_refeicao_turno_3")
    if p_m1: meal_times[Turno.PRIMEIRO] = _parse_time(p_m1.valor, meal_times[Turno.PRIMEIRO])
    if p_m2: meal_times[Turno.SEGUNDO] = _parse_time(p_m2.valor, meal_times[Turno.SEGUNDO])
    if p_m3: meal_times[Turno.TERCEIRO] = _parse_time(p_m3.valor, meal_times[Turno.TERCEIRO])

    p_dur = obter_parametro(db, "duracao_refeicao_minutos")
    if p_dur and p_dur.valor.isdigit():
        lunch_break_min = int(p_dur.valor)

    for registros in registros_por_posto.values():
        normais = sorted(
            (r for r in registros if r.status == PlanItemStatus.NORMAL.value),
            key=lambda r: r.sequencia,
        )
        itens_dominio = [
            SequenciaItem(
                sequencia=r.sequencia,
                status=PlanItemStatus(r.status),
                posto_trabalho=r.posto_trabalho,
                tempo_producao_minutos=calcular_tempo_producao_minutos(
                    r.kanbans, r.qtd_por_kanban, r.tempo_por_peca_minutos
                ),
            )
            for r in normais
        ]
        # Keyed by row id, not sequencia: unsequenced staging rows all share
        # sequencia=0 (server_default), which would otherwise collide in a
        # {sequencia: result} dict. calcular_cascata returns results in the
        # same order as `normais`, so zipping the two positionally - mirroring
        # frontend/src/state/sequenciaReducer.ts's recalcularGrupo - is the
        # only correct way to reattach each row's OWN computed window.
        calculados_por_id = dict(
            zip(
                (r.id for r in normais),
                calcular_cascata(
                    turno,
                    data,
                    itens_dominio,
                    shift_start_times=shift_starts,
                    meal_times=meal_times,
                    lunch_break_minutes=lunch_break_min,
                ),
                strict=True,
            )
        )

        for r in registros:
            calculado = calculados_por_id.get(r.id)
            diagnostico = diagnosticar_estoque(r.demanda, r.saldo_estoque)
            resultado.append(
                ItemProducaoOut(
                    id=r.id,
                    material=getattr(r, 'material', ''),
                    linha=r.linha,
                    turno=r.turno,
                    patan=r.patan,
                    posto_trabalho=r.posto_trabalho,
                    status=r.status,
                    sequencia=r.sequencia,
                    hora_inicial=calculado.hora_inicial if calculado else None,
                    hora_final=calculado.hora_final if calculado else None,
                    almoco_incluso=calculado.almoco_incluso if calculado else False,
                    kanbans=r.kanbans,
                    qtd_por_kanban=r.qtd_por_kanban,
                    tempo_por_peca_minutos=r.tempo_por_peca_minutos,
                    is_critico=r.is_critico,
                    tem_falta_estoque=diagnostico.tem_falta,
                    saldo_estoque=getattr(r, "saldo_estoque", None),
                    demanda=getattr(r, "demanda", None),
                    dias_prod=getattr(r, "dias_prod", None),
                    kanban_max=getattr(r, "kanban_max", None),
                    kanban_min=getattr(r, "kanban_min", None),
                    coluna_extra_id=None,
                    comp_comb=getattr(r, "comp_comb", "") or "",
                    anotacoes=getattr(r, "anotacoes", "") or "",
                    mostrar_anotacoes_quadro=getattr(r, "mostrar_anotacoes_quadro", False),
                )
            )

    # Sincronização de Produção em Linha (Tandem):
    # Materiais que rodam simultaneamente em mais de um posto da linha devem ter seus horários de início alinhados ao maior hora_inicial
    # e os itens subsequentes de cada fila de posto recalculados em cascata contínua.
    itens_normais_por_posto: dict[str, list[ItemProducaoOut]] = defaultdict(list)
    for it in resultado:
        if it.status == PlanItemStatus.NORMAL.value and it.hora_inicial is not None:
            itens_normais_por_posto[it.posto_trabalho].append(it)
    for p in itens_normais_por_posto:
        itens_normais_por_posto[p].sort(key=lambda x: x.sequencia)

    almoco_dt = _meal_datetime(turno, data, shift_starts, meal_times)

    def _recalcular_janela(it: ItemProducaoOut, inicio: datetime) -> None:
        duracao = timedelta(
            minutes=calcular_tempo_producao_minutos(
                it.kanbans, it.qtd_por_kanban, it.tempo_por_peca_minutos
            )
        )
        fim = inicio + duracao
        almoco_inc = inicio < almoco_dt < fim
        if almoco_inc:
            fim += timedelta(minutes=lunch_break_min)
        it.hora_inicial = inicio
        it.hora_final = fim
        it.almoco_incluso = almoco_inc

    for _ in range(10):
        ajuste_houve = False
        materiais_map: dict[tuple[str, str], list[ItemProducaoOut]] = defaultdict(list)
        for it in resultado:
            if it.status == PlanItemStatus.NORMAL.value and it.hora_inicial is not None:
                mat = (it.material or "").strip().upper()
                if mat:
                    data_str = it.hora_inicial.strftime("%Y-%m-%d")
                    materiais_map[(mat, data_str)].append(it)

        for (_mat, _d_str), itens_tandem in materiais_map.items():
            if len(itens_tandem) > 1:
                postos_envolvidos = {it.posto_trabalho for it in itens_tandem}
                if len(postos_envolvidos) > 1:
                    max_inicio = max(it.hora_inicial for it in itens_tandem if it.hora_inicial)
                    for it in itens_tandem:
                        if it.hora_inicial and it.hora_inicial < max_inicio:
                            ajuste_houve = True
                            _recalcular_janela(it, max_inicio)
                            # Cascateia os próximos itens da fila deste posto
                            fila = itens_normais_por_posto[it.posto_trabalho]
                            idx = fila.index(it)
                            for i_seg in range(idx + 1, len(fila)):
                                seg = fila[i_seg]
                                prox_inicio = fila[i_seg - 1].hora_final
                                if prox_inicio:
                                    _recalcular_janela(seg, prox_inicio)

        if not ajuste_houve:
            break

    # Identifica itens em tandem / Produção em Linha (mesmo material em mais de 1 posto da linha na mesma data)
    postos_por_chave: dict[tuple[str, int, str, str], set[str]] = defaultdict(set)
    for it in resultado:
        if it.coluna_extra_id is not None or it.status == PlanItemStatus.EXCLUIDO.value:
            continue
        mat = (it.material or "").strip().upper()
        if mat:
            data_str = it.hora_inicial.strftime("%Y-%m-%d") if it.hora_inicial else "sem_data"
            chave = (it.linha, it.turno, data_str, mat)
            postos_por_chave[chave].add(it.posto_trabalho)

    for it in resultado:
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

    sugestoes_outros_turnos = []
    if len(staging) == 0:
        stmt_outros = (
            select(
                ItemProducaoStaging.linha,
                ItemProducaoStaging.turno,
                func.count(ItemProducaoStaging.id).label("total"),
            )
            .where(
                ItemProducaoStaging.setor == setor,
                ItemProducaoStaging.patan == patan_str,
                ItemProducaoStaging.usuario_id == current_user.id,
            )
            .group_by(ItemProducaoStaging.linha, ItemProducaoStaging.turno)
            .order_by(ItemProducaoStaging.linha, ItemProducaoStaging.turno)
        )
        rows_sug = db.execute(stmt_outros).all()
        if not rows_sug:
            stmt_fallback_sug = (
                select(
                    ItemProducaoStaging.linha,
                    ItemProducaoStaging.turno,
                    func.count(ItemProducaoStaging.id).label("total"),
                )
                .where(
                    ItemProducaoStaging.setor == setor,
                    ItemProducaoStaging.patan == patan_str,
                )
                .group_by(ItemProducaoStaging.linha, ItemProducaoStaging.turno)
                .order_by(ItemProducaoStaging.linha, ItemProducaoStaging.turno)
            )
            rows_sug = db.execute(stmt_fallback_sug).all()

        sugestoes_outros_turnos = [
            {"linha": r.linha, "turno": r.turno, "total": r.total}
            for r in rows_sug
        ]

    return SequenciaResponse(
        linha=linha,
        turno=turno,
        patan=patan_str,
        itens=resultado,
        sugestoes_outros_turnos=sugestoes_outros_turnos,
    )


@router.post(
    "/sequencia", response_model=list[ItemProducaoOut], status_code=status.HTTP_201_CREATED
)
def submeter_sequencia(
    payload: BulkSubmitRequest,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
) -> list[ItemProducaoOut]:
    bloqueados = set(listar_materiais_bloqueados(db))
    if bloqueados:
        conflitos: set[str] = set()
        for item in payload.itens:
            mat = getattr(item, "material", None)
            if not mat:
                continue
            mat_limpo = mat.strip()
            if mat_limpo in bloqueados:
                conflitos.add(mat_limpo)
            else:
                partes = [p.strip() for p in re.split(r"[/;,\+]", mat_limpo) if p.strip()]
                for p in partes:
                    if p in bloqueados:
                        conflitos.add(mat_limpo)
                        break
        if conflitos:
            conflitos_str = ", ".join(sorted(conflitos))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Não é possível enviar o lote: As seguintes ferramentas estão em manutenção na Ferramentaria: {conflitos_str}. Aguarde a liberação.",
            )

    try:
        patan_str = (
            payload.patan.value
            if hasattr(payload.patan, "value")
            else str(payload.patan).strip().upper()
        )
        persistidos = bulk_persist(
            db, payload.linha, payload.turno.value, patan_str, payload.itens, setor=payload.setor
        )
        ids_criticos = [
            item.id
            for item in payload.itens
            if item.status == PlanItemStatus.CRITICO and item.id is not None
        ]
        limpar_staging_apos_submit(
            db, current_user.id, payload.linha, payload.turno.value,
            patan_str, ids_criticos, setor=payload.setor,
        )
        # Build the response from these ORM objects BEFORE commit.
        resposta = [to_item_producao_out(item) for item in persistidos]
        
        create_audit_log(
            db=db,
            usuario_id=current_user.id,
            acao="enviar_lote",
            entidade="producao",
            detalhes={
                "linha": payload.linha,
                "turno": payload.turno.value,
                "patan": patan_str,
                "qtd_itens": len(payload.itens)
            }
        )
        
        db.commit()
        anyio.from_thread.run(
            manager.broadcast,
            {
                "tipo": "producao_atualizada",
                "linha": payload.linha,
                "turno": payload.turno.value,
                "patan": payload.patan.value,
            },
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception(
            "Falha ao persistir lote de sequencia (linha=%s, turno=%s, patan=%s)",
            payload.linha,
            payload.turno,
            payload.patan,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Falha ao persistir o lote; nada foi salvo.",
        ) from exc

    return resposta


@router.get("/patan-teorico")
def obter_patan_teorico(
    setor: str = Query("estamparia", description="Setor ('estamparia' ou 'solda')"),
    linha: str | None = Query(None, description="Linha de produção (ex: 'LINHA 1')"),
    turno: int | None = Query(None, description="Turno (1, 2 ou 3)"),
    patan: str | None = Query(None, description="Letra do Patan (ex: 'A')"),
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> dict:
    """Retorna os dados oficiais do Patan Teórico por prensa/máquina para visualização gráfica."""
    from app.services.estamparia_converter import carregar_base_patan_teorico

    try:
        dados = carregar_base_patan_teorico(linha=linha, turno=turno, patan=patan)
        return dados
    except Exception as exc:
        logger.exception("Erro ao carregar Patan Teórico: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao carregar base do Patan Teórico: {exc}",
        ) from exc


@router.get("/resumo-patans")
def obter_resumo_patans(
    setor: str = Query("solda", description="Setor ('solda' ou 'estamparia')"),
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
) -> dict[str, list[dict[str, Any]]]:
    """Retorna para cada Patan do setor as linhas e turnos onde há ordens cadastradas."""
    stmt = (
        select(
            ItemProducaoStaging.patan,
            ItemProducaoStaging.linha,
            ItemProducaoStaging.turno,
            func.count(ItemProducaoStaging.id).label("total"),
        )
        .where(
            ItemProducaoStaging.setor == setor,
            ItemProducaoStaging.usuario_id == current_user.id,
        )
        .group_by(ItemProducaoStaging.patan, ItemProducaoStaging.linha, ItemProducaoStaging.turno)
        .order_by(ItemProducaoStaging.patan, ItemProducaoStaging.linha, ItemProducaoStaging.turno)
    )
    rows = db.execute(stmt).all()
    if not rows:
        stmt_fallback = (
            select(
                ItemProducaoStaging.patan,
                ItemProducaoStaging.linha,
                ItemProducaoStaging.turno,
                func.count(ItemProducaoStaging.id).label("total"),
            )
            .where(ItemProducaoStaging.setor == setor)
            .group_by(ItemProducaoStaging.patan, ItemProducaoStaging.linha, ItemProducaoStaging.turno)
            .order_by(ItemProducaoStaging.patan, ItemProducaoStaging.linha, ItemProducaoStaging.turno)
        )
        rows = db.execute(stmt_fallback).all()

    res: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        res[r.patan].append({
            "linha": r.linha,
            "turno": r.turno,
            "total": r.total,
        })
    return res

