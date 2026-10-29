from collections import defaultdict
from datetime import datetime, time, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.datetime_utils import para_brasilia_naive
from app.domain.postos import normalizar_posto_trabalho
from app.domain.sequenciamento import (
    LUNCH_BREAK_MINUTES,
    MEAL_TIME,
    SHIFT_START_TIME,
    Turno,
    meal_datetime,
)
from app.domain.catalogo_embalagens import obter_embalagem, obter_embalagem_solda
from app.domain.catalogo_estamparia import obter_embalagem_estamparia, obter_mp_estamparia
from app.domain.status import PlanItemStatus
from app.models.producao import ColunaExtra, ItemProducao, ItemProducaoStaging
from app.repositories.colaboracao_repository import seed_checklist_padrao, seed_labels_padrao
from app.schemas.producao import EditarItemProducaoRequest, ItemProducaoBulkIn


def get_staging_itens(
    db: Session, usuario_id: int, linha: str, turno: int, patan: str, setor: str = "solda"
) -> list[ItemProducaoStaging]:
    stmt = select(ItemProducaoStaging).where(
        ItemProducaoStaging.usuario_id == usuario_id,
        ItemProducaoStaging.setor == setor,
        ItemProducaoStaging.linha == linha,
        ItemProducaoStaging.turno == turno,
        ItemProducaoStaging.patan == patan,
        ItemProducaoStaging.status != PlanItemStatus.EXCLUIDO.value,
    )
    itens = list(db.scalars(stmt).all())
    if not itens:
        # Fallback para base mestre/global de staging (ex: importada pelo admin ou outro usuário)
        stmt_fallback = select(ItemProducaoStaging).where(
            ItemProducaoStaging.setor == setor,
            ItemProducaoStaging.linha == linha,
            ItemProducaoStaging.turno == turno,
            ItemProducaoStaging.patan == patan,
            ItemProducaoStaging.status != PlanItemStatus.EXCLUIDO.value,
        )
        itens = list(db.scalars(stmt_fallback).all())
    return itens


def get_pecas_criticas_by_linha(
    db: Session, usuario_id: int, linha: str, setor: str = "solda"
) -> list[ItemProducaoStaging]:
    stmt = select(ItemProducaoStaging).where(
        ItemProducaoStaging.usuario_id == usuario_id,
        ItemProducaoStaging.setor == setor,
        ItemProducaoStaging.linha == linha,
        ItemProducaoStaging.status == PlanItemStatus.CRITICO.value,
    )
    itens = list(db.scalars(stmt).all())
    if not itens:
        # Fallback para peças críticas da linha de qualquer usuário
        stmt_fallback = select(ItemProducaoStaging).where(
            ItemProducaoStaging.setor == setor,
            ItemProducaoStaging.linha == linha,
            ItemProducaoStaging.status == PlanItemStatus.CRITICO.value,
        )
        itens = list(db.scalars(stmt_fallback).all())
    return itens


def _gerar_anotacoes_padrao_backend(
    material: str,
    linha: str,
    turno: int,
    patan: str,
    posto_trabalho: str,
    kanbans: int,
    qtd_por_kanban: int,
    hora_inicial: datetime | None,
    hora_final: datetime | None,
    setor: str = "solda",
) -> str:
    emb = obter_embalagem(material, setor=setor)
    emb_str = f" - Embalagem: {emb}" if emb else ""
    total_p = (kanbans or 0) * (qtd_por_kanban or 0)
    ini_str = hora_inicial.strftime("%H:%M") if hora_inicial else "--:--"
    fim_str = hora_final.strftime("%H:%M") if hora_final else "--:--"
    linhas_anotacao = [
        f"INÍCIO  : {ini_str}",
        f"TÉRMINO : {fim_str}",
        f"TOTAL CAIXAS - {kanbans or 0} K = {total_p} PÇS{emb_str}",
        f"MATERIAL: {material or 'N/A'}",
        f"POSTO / MÁQUINA: {posto_trabalho}",
        f"LINHA: {linha} | TURNO: {turno}º | PATAN: {patan}",
    ]
    if setor == "estamparia":
        cxs_por_palete = 20
        pal_comp = (kanbans or 0) // cxs_por_palete
        cxs_comp = pal_comp * cxs_por_palete
        cxs_quebra = (kanbans or 0) % cxs_por_palete
        quebra_txt = f" + 1P ({cxs_quebra} cx quebra)" if cxs_quebra > 0 else ""
        linhas_anotacao.append(f"PALETIZAÇÃO: {pal_comp}P ({cxs_comp} cx){quebra_txt}")
        mp_info = obter_mp_estamparia(material)
        if mp_info:
            mp_cod, consumo_unit = mp_info
            peso_kg = round(total_p * consumo_unit, 1)
            linhas_anotacao.append(f"MATÉRIA-PRIMA: {mp_cod} — {peso_kg} KG")
        linhas_anotacao.append(f"FERRAMENTA: FERR. - {material}")

    return "\n".join(linhas_anotacao) + "\n"



def bulk_persist(
    db: Session,
    linha: str,
    turno: int,
    patan: str,
    itens: list[ItemProducaoBulkIn],
    setor: str = "solda",
) -> list[ItemProducao]:
    """All-or-nothing persist to Tabela B, scoped to (setor, patan, linha, turno).

    Deletes existing rows in scope that are not em_producao, preserves rows
    marked em_producao untouched, then inserts every submitted item. Normal
    items receive strictly sequential, collision-free numbers (1..N) per
    workstation starting after any preserved em_producao rows. Critical items
    are assigned non-colliding sequences starting at 0. Runs inside the
    caller's transaction (caller commits/rolls back for all-or-nothing semantics).
    """
    escopo = (
        (ItemProducao.setor == setor)
        & (ItemProducao.linha == linha)
        & (ItemProducao.turno == turno)
        & (ItemProducao.patan == patan)
    )

    datas = {it.hora_inicial.date() for it in itens if it.hora_inicial}
    if datas:
        for d in datas:
            inicio_dia = datetime.combine(d, time.min)
            fim_dia = datetime.combine(d, time.max)
            escopo_dia = (
                escopo
                & (ItemProducao.hora_inicial >= inicio_dia)
                & (ItemProducao.hora_inicial <= fim_dia)
            )
            db.execute(delete(ItemProducao).where(escopo_dia, ItemProducao.em_producao.is_(False)))
    else:
        db.execute(delete(ItemProducao).where(escopo, ItemProducao.em_producao.is_(False)))

    preservados = db.scalars(
        select(ItemProducao).where(escopo, ItemProducao.em_producao.is_(True))
    ).all()
    max_sequencia_por_posto: dict[str, int] = {}
    for registro in preservados:
        atual = max_sequencia_por_posto.get(registro.posto_trabalho, 0)
        max_sequencia_por_posto[registro.posto_trabalho] = max(atual, registro.sequencia)

    itens_por_posto: dict[str, list[ItemProducaoBulkIn]] = defaultdict(list)
    for item in itens:
        itens_por_posto[item.posto_trabalho].append(item)

    persistidos: list[ItemProducao] = []
    for posto, lista in itens_por_posto.items():
        normais = [it for it in lista if it.status == PlanItemStatus.NORMAL or it.sequencia > 0]
        criticos = [it for it in lista if it.status != PlanItemStatus.NORMAL and it.sequencia <= 0]

        # Mantem a ordem enviada; se ja possuia sequencia > 0 respeita, sequencias <= 0 vao ao fim
        normais.sort(key=lambda it: (1 if it.sequencia <= 0 else 0, it.sequencia))

        proximo = max_sequencia_por_posto.get(posto, 0) + 1
        for it in normais:
            dados = it.model_dump(exclude={"id", "turno", "patan", "status", "sequencia", "setor"})
            dados["setor"] = setor
            dados["turno"] = turno
            dados["patan"] = patan
            dados["status"] = it.status.value
            dados["sequencia"] = proximo
            proximo += 1

            if not dados.get("anotacoes") or not str(dados.get("anotacoes")).strip():
                dados["anotacoes"] = _gerar_anotacoes_padrao_backend(
                    material=dados.get("material", ""),
                    linha=linha,
                    turno=turno,
                    patan=patan,
                    posto_trabalho=posto,
                    kanbans=dados.get("kanbans", 0),
                    qtd_por_kanban=dados.get("qtd_por_kanban", 0),
                    hora_inicial=dados.get("hora_inicial"),
                    hora_final=dados.get("hora_final"),
                    setor=setor,
                )
                dados["mostrar_anotacoes_quadro"] = False

            registro = ItemProducao(**dados)
            db.add(registro)
            persistidos.append(registro)

        crit_seq = 0
        for it in criticos:
            dados = it.model_dump(exclude={"id", "turno", "patan", "status", "sequencia", "setor"})
            dados["setor"] = setor
            dados["turno"] = it.turno.value if hasattr(it.turno, "value") else int(it.turno)
            dados["patan"] = it.patan.value if hasattr(it.patan, "value") else str(it.patan)
            dados["status"] = it.status.value if hasattr(it.status, "value") else int(it.status)
            dados["sequencia"] = crit_seq
            crit_seq -= 1

            if not dados.get("anotacoes") or not str(dados.get("anotacoes")).strip():
                dados["anotacoes"] = _gerar_anotacoes_padrao_backend(
                    material=dados.get("material", ""),
                    linha=linha,
                    turno=dados["turno"],
                    patan=dados["patan"],
                    posto_trabalho=posto,
                    kanbans=dados.get("kanbans", 0),
                    qtd_por_kanban=dados.get("qtd_por_kanban", 0),
                    hora_inicial=dados.get("hora_inicial"),
                    hora_final=dados.get("hora_final"),
                    setor=setor,
                )
                dados["mostrar_anotacoes_quadro"] = False

            registro = ItemProducao(**dados)
            db.add(registro)
            persistidos.append(registro)

    db.flush()

    for registro in persistidos:
        seed_checklist_padrao(db, registro.id, setor=registro.setor)
        seed_labels_padrao(db, registro.id, registro.posto_trabalho)

    return persistidos


def limpar_staging_apos_submit(
    db: Session, usuario_id: int, linha: str, turno: int, patan: str,
    ids_criticos_incluidos: list[int],
    setor: str = "solda",
) -> None:
    """Staging (Tabela A) preserva os itens normais como receita/modelo do Patan,
    permitindo que o programador programe o mesmo Patan para diferentes datas.
    Apenas itens críticos que foram de fato incluídos neste envio saem da quarentena da staging.
    """
    if ids_criticos_incluidos:
        db.execute(
            delete(ItemProducaoStaging).where(ItemProducaoStaging.id.in_(ids_criticos_incluidos))
        )


def listar_persistidos(
    db: Session,
    linha: str | None = None,
    patan: str | None = None,
    turno: int | None = None,
    setor: str | None = None,
    data: str | None = None,
) -> list[ItemProducao]:
    """Reads the real persisted Tabela B rows - no cascade recompute,
    hora_inicial/hora_final are already stored from submit time.
    linha, setor, patan, turno and data are all optional.
    """
    filtros = []
    if linha is not None and linha != "" and linha != "todas":
        filtros.append(ItemProducao.linha == linha)
    if setor is not None and setor != "" and setor != "todos":
        filtros.append(ItemProducao.setor == setor)
    if patan is not None and patan != "":
        filtros.append(ItemProducao.patan == patan)
    if turno is not None:
        filtros.append(ItemProducao.turno == turno)
    if data is not None and data != "" and data != "todas":
        try:
            d = datetime.strptime(data, "%Y-%m-%d").date()
            inicio_dia = datetime.combine(d, time.min)
            fim_dia = datetime.combine(d, time.max)
            filtros.append(ItemProducao.hora_inicial >= inicio_dia)
            filtros.append(ItemProducao.hora_inicial <= fim_dia)
        except ValueError:
            pass
    stmt = (
        select(ItemProducao)
        .where(*filtros)
        .order_by(ItemProducao.turno, ItemProducao.posto_trabalho, ItemProducao.sequencia)
    )
    return list(db.scalars(stmt).all())


def reordenar_persistidos(
    db: Session,
    linha: str,
    turno: int | None,
    patan: str | None,
    posto_trabalho: str,
    ids_em_ordem: list[int],
    setor: str | None = None,
    recalcular_horarios: bool = False,
) -> list[ItemProducao] | None:
    """Atualiza a sequencia dos itens persistidos (Tabela B) na ordem recebida.
    Se recalcular_horarios for True, recalcula a cascata horária a partir do horário
    do primeiro item da fila ou início do turno.
    """
    registros: list[tuple[ItemProducao, int]] = []
    for sequencia, item_id in enumerate(ids_em_ordem, start=1):
        registro = db.get(ItemProducao, item_id)
        if (
            registro is None
            or registro.linha != linha
            or (turno is not None and registro.turno != turno)
            or (patan is not None and registro.patan != patan)
            or (setor is not None and registro.setor != setor)
            or registro.posto_trabalho != posto_trabalho
            or registro.coluna_extra_id is not None
        ):
            return None
        registros.append((registro, sequencia))

    for registro, sequencia in registros:
        if registro.status == PlanItemStatus.NORMAL.value:
            registro.sequencia = -sequencia
    db.flush()
    for registro, sequencia in registros:
        if registro.status == PlanItemStatus.NORMAL.value:
            registro.sequencia = sequencia
    db.flush()

    if recalcular_horarios and registros:
        # Ordenar os registros de produção normal por sequencia
        itens_normais = [r for r, _ in registros if r.status == PlanItemStatus.NORMAL.value and r.coluna_extra_id is None]
        itens_normais.sort(key=lambda x: x.sequencia)
        if itens_normais:
            horarios = [it.hora_inicial for it in itens_normais if it.hora_inicial is not None]
            cursor_tempo = min(horarios) if horarios else None
            for item in itens_normais:
                if cursor_tempo is not None:
                    item.hora_inicial = cursor_tempo
                duracao = item.kanbans * item.qtd_por_kanban * item.tempo_por_peca_minutos
                if item.hora_inicial is not None:
                    item.hora_final = item.hora_inicial + timedelta(minutes=duracao)
                    cursor_tempo = item.hora_final
            db.flush()

    return [registro for registro, _ in registros]


def recalcular_cascata_e_tandem_persistidos(
    db: Session,
    setor: str,
    linha: str,
    turno: int | None = None,
    item_ancora: ItemProducao | None = None,
) -> None:
    """Recalcula a cascata horária e sincronização tandem multimáquinas em cadeia
    para os itens persistidos da Tabela B (ItemProducao).
    
    Garante paridade com sequenciaReducer do frontend:
    - Se item_ancora for fornecido, preserva itens anteriores e cascateia subsequentes.
    - Se item_ancora for None (ex: após exclusão de card), a fila inteira é reorganizada:
      se houver item em produção, o primeiro não-produzido começa em seu hora_final;
      caso contrário, começa no início do turno (SHIFT_START_TIME).
    - Executa loop de convergência de ponto fixo (até 25 iterações) para sincronizar
      lotes em linha (tandem) alinhando max(hora_inicial) e cascateando os subsequentes
      em cadeia por todas as máquinas da linha.
    """
    shift_starts = dict(SHIFT_START_TIME)
    meal_times = dict(MEAL_TIME)
    lunch_break_min = LUNCH_BREAK_MINUTES
    try:
        from app.repositories.parametro_repository import obter_parametro

        p_t1 = obter_parametro(db, "hora_inicio_turno_1")
        p_t2 = obter_parametro(db, "hora_inicio_turno_2")
        p_t3 = obter_parametro(db, "hora_inicio_turno_3")
        if p_t1 and p_t2 and p_t3:
            h1, m1 = map(int, p_t1.valor.split(":"))
            h2, m2 = map(int, p_t2.valor.split(":"))
            h3, m3 = map(int, p_t3.valor.split(":"))
            shift_starts = {
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
            lunch_break_min = int(p_dur.valor)
    except Exception:
        pass

    condicoes = [
        ItemProducao.setor == setor,
        ItemProducao.linha == linha,
        ItemProducao.coluna_extra_id.is_(None),
        ItemProducao.status == PlanItemStatus.NORMAL.value,
    ]
    if turno is not None:
        condicoes.append(ItemProducao.turno == turno)

    itens = list(
        db.scalars(
            select(ItemProducao)
            .where(*condicoes)
            .order_by(ItemProducao.posto_trabalho, ItemProducao.sequencia, ItemProducao.id)
        ).all()
    )
    if not itens:
        return

    itens_por_posto: dict[str, list[ItemProducao]] = defaultdict(list)
    for it in itens:
        itens_por_posto[it.posto_trabalho].append(it)

    def _recalcular_janela(it: ItemProducao, inicio: datetime) -> None:
        dur_min = max(0.1, (it.kanbans * it.qtd_por_kanban) * it.tempo_por_peca_minutos)
        dur = timedelta(minutes=dur_min)
        fim = inicio + dur
        turno_enum = Turno(it.turno)
        almoco = meal_datetime(turno_enum, inicio.date(), shift_starts, meal_times)
        almoco_inc = inicio < almoco < fim
        if almoco_inc:
            fim += timedelta(minutes=lunch_break_min)
        it.hora_inicial = inicio
        it.hora_final = fim
        it.almoco_incluso = almoco_inc

    # 1. Cascata base por posto
    for posto, fila in itens_por_posto.items():
        if not fila:
            continue

        fila.sort(
            key=lambda x: (
                0 if x.em_producao else 1,
                x.sequencia if x.sequencia > 0 else 999999,
                x.hora_inicial or datetime.max,
                x.id or 0,
            )
        )

        cursor = None
        for idx, it in enumerate(fila):
            it.sequencia = -(idx + 1)
        db.flush()

        for idx, it in enumerate(fila, start=1):
            it.sequencia = idx

            if it.em_producao:
                if it.hora_inicial and (it.hora_final is None or it.hora_final <= it.hora_inicial):
                    _recalcular_janela(it, it.hora_inicial)
                cursor = it.hora_final
                continue

            if item_ancora and it.id == item_ancora.id:
                cursor = it.hora_final
                continue

            if item_ancora and it.posto_trabalho == item_ancora.posto_trabalho and it.sequencia < item_ancora.sequencia:
                cursor = it.hora_final or cursor
                continue

            if cursor is None:
                d_base = it.hora_inicial.date() if it.hora_inicial else datetime.now().date()
                inicio_turno = datetime.combine(d_base, shift_starts[Turno(it.turno)])
                cursor = inicio_turno

            _recalcular_janela(it, cursor)
            cursor = it.hora_final

    db.flush()

    # 2. Sincronização Tandem Multimáquinas em Ponto Fixo (Loop em cadeia)
    ajustes_por_chave: dict[str, int] = defaultdict(int)
    for _ in range(25):
        ajuste_houve = False
        ocorrencias: dict[str, list[tuple[str, int]]] = defaultdict(list)
        contagem_por_posto: dict[tuple[str, str], int] = defaultdict(int)

        for posto, fila in itens_por_posto.items():
            for idx, it in enumerate(fila):
                if it.em_producao or not it.material:
                    continue
                mat = it.material.strip().upper()
                contagem_por_posto[(posto, mat)] += 1
                occ_num = contagem_por_posto[(posto, mat)]
                chave = f"{mat}__occ_{occ_num}"
                ocorrencias[chave].append((posto, idx))

        for _chave, grupo in ocorrencias.items():
            if len(grupo) <= 1:
                continue
            postos_envolvidos = {p for p, _ in grupo}
            if len(postos_envolvidos) <= 1:
                continue

            ajustes_por_chave[_chave] += 1
            if ajustes_por_chave[_chave] > 3:
                continue

            itens_tandem = [itens_por_posto[p][idx] for p, idx in grupo]
            horarios_ini = [it.hora_inicial for it in itens_tandem if it.hora_inicial]
            if not horarios_ini:
                continue

            max_inicio = max(horarios_ini)
            for it in itens_tandem:
                if it.hora_inicial and it.hora_inicial < max_inicio:
                    ajuste_houve = True
                    _recalcular_janela(it, max_inicio)
                    fila = itens_por_posto[it.posto_trabalho]
                    idx_it = fila.index(it)
                    cursor_sub = it.hora_final
                    for seg_idx in range(idx_it + 1, len(fila)):
                        seg = fila[seg_idx]
                        if not seg.em_producao and cursor_sub:
                            _recalcular_janela(seg, cursor_sub)
                            cursor_sub = seg.hora_final

        if not ajuste_houve:
            break

    db.flush()


def excluir_item_producao(
    db: Session,
    item_id: int,
    remover_irmaos_tandem: bool = True,
) -> tuple[ItemProducao, list[ItemProducao]] | None:
    """Exclui um item persistido de produção (Tabela B) e, opcionalmente, seus parceiros em tandem.
    Recalcula a cascata horária e sincronização em cadeia dos itens restantes do posto.
    """
    item = db.get(ItemProducao, item_id)
    if not item:
        return None

    irmaos_removidos: list[ItemProducao] = []
    if remover_irmaos_tandem and item.material:
        candidatos = list(
            db.scalars(
                select(ItemProducao).where(
                    ItemProducao.setor == item.setor,
                    ItemProducao.linha == item.linha,
                    ItemProducao.turno == item.turno,
                    ItemProducao.material == item.material,
                    ItemProducao.coluna_extra_id.is_(None),
                    ItemProducao.status == PlanItemStatus.NORMAL.value,
                    ItemProducao.posto_trabalho != item.posto_trabalho,
                    ItemProducao.id != item.id,
                )
            ).all()
        )
        irmaos_removidos = candidatos

    setor = item.setor
    linha = item.linha
    turno = item.turno

    todos_para_deletar = [item, *irmaos_removidos]
    for it in todos_para_deletar:
        db.delete(it)
    db.flush()

    # Recalcula a cascata e tandem em cadeia dos itens restantes
    recalcular_cascata_e_tandem_persistidos(
        db=db,
        setor=setor,
        linha=linha,
        turno=turno,
        item_ancora=None,
    )
    return item, irmaos_removidos


def editar_item_persistido(
    db: Session,
    item_id: int,
    payload: EditarItemProducaoRequest,
) -> ItemProducao | None:
    item = db.get(ItemProducao, item_id)
    if not item:
        return None

    # Bloqueio de imutabilidade: ordens finalizadas (concluídas ou em quebra) não podem ser editadas
    if item.coluna_extra_id is not None:
        col = db.get(ColunaExtra, item.coluna_extra_id)
        col_nome_lower = col.nome.lower() if col else ""
        if (
            "conclu" in col_nome_lower
            or "quebra" in col_nome_lower
            or item.fim_real is not None
            or item.motivo_interrupcao == "quebra"
        ):
            raise ValueError(
                "Ordens concluídas ou registradas em quebra de máquina não podem ser editadas."
            )

    if payload.hora_inicial is not None:
        item.hora_inicial = para_brasilia_naive(payload.hora_inicial)
    if payload.hora_final is not None:
        item.hora_final = para_brasilia_naive(payload.hora_final)
    if payload.kanbans is not None:
        item.kanbans = payload.kanbans
    if payload.qtd_por_kanban is not None:
        item.qtd_por_kanban = payload.qtd_por_kanban
    if payload.tempo_por_peca_minutos is not None:
        item.tempo_por_peca_minutos = payload.tempo_por_peca_minutos
    if payload.material is not None and payload.material.strip():
        item.material = payload.material.strip()
    if payload.posto_trabalho is not None and payload.posto_trabalho.strip():
        item.posto_trabalho = normalizar_posto_trabalho(payload.posto_trabalho.strip())
    if payload.turno is not None:
        item.turno = payload.turno.value if hasattr(payload.turno, "value") else int(payload.turno)
    if payload.patan is not None:
        item.patan = payload.patan.value if hasattr(payload.patan, "value") else str(payload.patan)
    if payload.sequencia is not None:
        item.sequencia = payload.sequencia

    # Se hora_final não foi informada mas hora_inicial e quantidades estão presentes, garante coerência
    if payload.hora_final is None and item.hora_inicial is not None:
        duracao = item.kanbans * item.qtd_por_kanban * item.tempo_por_peca_minutos
        item.hora_final = item.hora_inicial + timedelta(minutes=duracao)

    # Identificar itens parceiros em tandem (produção em linha) para sincronizar quantidades e duração
    irmaos = list(
        db.scalars(
            select(ItemProducao).where(
                ItemProducao.setor == item.setor,
                ItemProducao.linha == item.linha,
                ItemProducao.turno == item.turno,
                ItemProducao.material == item.material,
                ItemProducao.coluna_extra_id.is_(None),
                ItemProducao.status == PlanItemStatus.NORMAL.value,
                ItemProducao.id != item.id,
            )
        ).all()
    )

    if irmaos:
        for irmao in irmaos:
            if payload.kanbans is not None:
                irmao.kanbans = item.kanbans
            if payload.qtd_por_kanban is not None:
                irmao.qtd_por_kanban = item.qtd_por_kanban
            if irmao.hora_inicial is not None:
                if item.hora_inicial is not None and irmao.hora_inicial < item.hora_inicial:
                    irmao.hora_inicial = item.hora_inicial
                dur_irm = irmao.kanbans * irmao.qtd_por_kanban * irmao.tempo_por_peca_minutos
                irmao.hora_final = irmao.hora_inicial + timedelta(minutes=dur_irm)

    db.flush()

    # Se solicitado, recalcula a cascata e sincronização tandem em cadeia
    if payload.recalcular_subsequentes:
        recalcular_cascata_e_tandem_persistidos(
            db=db,
            setor=item.setor,
            linha=item.linha,
            turno=item.turno,
            item_ancora=item,
        )

    db.flush()
    return item


def listar_colunas_extras(db: Session, setor: str | None = None) -> list[ColunaExtra]:
    query = select(ColunaExtra).order_by(ColunaExtra.nome)
    if setor is not None:
        query = query.where((ColunaExtra.setor == setor) | (ColunaExtra.setor == "todos"))
    return list(db.scalars(query).all())


def criar_coluna_extra(db: Session, nome: str, setor: str = "todos") -> ColunaExtra:
    coluna = ColunaExtra(nome=nome, setor=setor)
    db.add(coluna)
    db.flush()
    return coluna


def remover_coluna_extra(db: Session, coluna_extra_id: int) -> bool:
    coluna = db.get(ColunaExtra, coluna_extra_id)
    if coluna is None:
        return False
    col_nome_lower = coluna.nome.lower()
    if "conclu" in col_nome_lower or "quebra" in col_nome_lower:
        raise ValueError("Colunas do sistema ('Concluídas' e 'Quebra de Máquina') não podem ser removidas.")
    db.delete(coluna)
    db.flush()
    return True


def renomear_coluna_extra(db: Session, coluna_extra_id: int, nome: str) -> ColunaExtra | None:
    coluna = db.get(ColunaExtra, coluna_extra_id)
    if coluna is None:
        return None
    col_nome_lower = coluna.nome.lower()
    if "conclu" in col_nome_lower or "quebra" in col_nome_lower:
        raise ValueError("Colunas do sistema ('Concluídas' e 'Quebra de Máquina') não podem ser renomeadas.")
    coluna.nome = nome
    db.flush()
    return coluna


def mover_para_coluna_extra(
    db: Session, item_id: int, coluna_extra_id: int | None
) -> ItemProducao | None:
    item = db.get(ItemProducao, item_id)
    if item is None:
        return None

    # Bloqueio de imutabilidade: se o item já está em uma coluna de Concluídas ou Quebra de Máquina,
    # ele NÃO pode mais mudar de coluna e nem retornar para a produção ativa (coluna_extra_id = None).
    if item.coluna_extra_id is not None and item.coluna_extra_id != coluna_extra_id:
        coluna_atual = db.get(ColunaExtra, item.coluna_extra_id)
        col_nome_lower = coluna_atual.nome.lower() if coluna_atual else ""
        if (
            "conclu" in col_nome_lower
            or "quebra" in col_nome_lower
            or item.fim_real is not None
            or item.motivo_interrupcao == "quebra"
        ):
            raise ValueError(
                "Ordens concluídas ou registradas em quebra de máquina não podem retornar para a fila de produção ou mudar de coluna."
            )

    if coluna_extra_id is None:
        # Ao retornar para a coluna original do posto, coloca no final da fila (maior sequencia + 1)
        max_seq = db.scalar(
            select(func.coalesce(func.max(ItemProducao.sequencia), 0)).where(
                ItemProducao.linha == item.linha,
                ItemProducao.turno == item.turno,
                ItemProducao.posto_trabalho == item.posto_trabalho,
                ItemProducao.coluna_extra_id.is_(None),
                ItemProducao.id != item.id,
                ItemProducao.status == PlanItemStatus.NORMAL.value,
            )
        ) or 0
        item.sequencia = max_seq + 1
    else:
        # Ao mover para uma coluna adicional (bucket), libera o número de sequência
        item.sequencia = 0

    item.coluna_extra_id = coluna_extra_id
    db.flush()
    return item


def inserir_item_producao_direto(
    db: Session,
    setor: str,
    linha: str,
    turno: int,
    patan: str,
    posto_trabalho: str,
    material: str,
    kanbans: int,
    qtd_por_kanban: int,
    tempo_por_peca_minutos: float,
    hora_inicial: datetime,
    is_critico: bool = False,
    demanda: float = 0.0,
    saldo_estoque: float = 0.0,
    lunch_break_minutes: int = 40,
    meal_times: dict[Turno, time] | None = None,
    shift_start_times: dict[Turno, time] | None = None,
) -> tuple[ItemProducao, list[ItemProducao]]:
    """Insere um novo item de producao diretamente na Tabela B e empurra cronologicamente
    os horarios dos itens subsequentes daquele mesmo posto de trabalho.
    """
    hora_inicial = para_brasilia_naive(hora_inicial) or hora_inicial
    posto_trabalho = normalizar_posto_trabalho(posto_trabalho, setor=setor)
    duracao_min = (kanbans * qtd_por_kanban) * tempo_por_peca_minutos
    turno_enum = Turno(turno)
    data_base = hora_inicial.date()
    almoco = meal_datetime(turno_enum, data_base, shift_start_times, meal_times)

    hora_final = hora_inicial + timedelta(minutes=duracao_min)
    almoco_incluso = False
    if hora_inicial <= almoco < hora_final:
        hora_final += timedelta(minutes=lunch_break_minutes)
        almoco_incluso = True

    status_val = PlanItemStatus.CRITICO.value if is_critico else PlanItemStatus.NORMAL.value
    anotacoes_padrao = _gerar_anotacoes_padrao_backend(
        material=material,
        linha=linha,
        turno=turno,
        patan=patan,
        posto_trabalho=posto_trabalho,
        kanbans=kanbans,
        qtd_por_kanban=qtd_por_kanban,
        hora_inicial=hora_inicial,
        hora_final=hora_final,
        setor=setor,
    )
    novo_item = ItemProducao(
        setor=setor,
        linha=linha,
        turno=turno,
        patan=patan,
        posto_trabalho=posto_trabalho,
        material=material,
        kanbans=kanbans,
        qtd_por_kanban=qtd_por_kanban,
        tempo_por_peca_minutos=tempo_por_peca_minutos,
        hora_inicial=hora_inicial,
        hora_final=hora_final,
        almoco_incluso=almoco_incluso,
        status=status_val,
        sequencia=0,
        saldo_estoque=saldo_estoque,
        is_critico=is_critico,
        anotacoes=anotacoes_padrao,
        mostrar_anotacoes_quadro=False,
    )
    db.add(novo_item)
    db.flush()

    # Buscar itens da fila regular desse posto para reordenar horarios subsequentes
    itens_posto = list(
        db.scalars(
            select(ItemProducao).where(
                ItemProducao.setor == setor,
                ItemProducao.linha == linha,
                ItemProducao.posto_trabalho == posto_trabalho,
                ItemProducao.coluna_extra_id.is_(None),
                ItemProducao.em_producao == False,
                ItemProducao.id != novo_item.id,
            ).order_by(ItemProducao.hora_inicial, ItemProducao.sequencia)
        ).all()
    )

    itens_afetados: list[ItemProducao] = []
    proximo_inicio = novo_item.hora_final

    for it in itens_posto:
        if it.hora_inicial is not None and it.hora_final is not None:
            if it.hora_final <= novo_item.hora_inicial:
                continue

        if it.hora_inicial is None or it.hora_inicial < proximo_inicio:
            it.hora_inicial = proximo_inicio
            it_duracao = (it.kanbans * it.qtd_por_kanban) * it.tempo_por_peca_minutos
            it_turno_enum = Turno(it.turno)
            it_almoco = meal_datetime(it_turno_enum, it.hora_inicial.date(), shift_start_times, meal_times)
            it_fim = it.hora_inicial + timedelta(minutes=it_duracao)
            it_almoco_inc = False
            if it.hora_inicial <= it_almoco < it_fim:
                it_fim += timedelta(minutes=lunch_break_minutes)
                it_almoco_inc = True
            it.hora_final = it_fim
            it.almoco_incluso = it_almoco_inc
            itens_afetados.append(it)
            proximo_inicio = it.hora_final
        else:
            proximo_inicio = max(proximo_inicio, it.hora_final)

    # Reatribui as sequencias dos itens normais da fila deste posto em ordem cronologica
    todos_normais = list(
        db.scalars(
            select(ItemProducao).where(
                ItemProducao.setor == setor,
                ItemProducao.linha == linha,
                ItemProducao.posto_trabalho == posto_trabalho,
                ItemProducao.coluna_extra_id.is_(None),
                ItemProducao.status == PlanItemStatus.NORMAL.value,
            ).order_by(ItemProducao.hora_inicial, ItemProducao.id)
        ).all()
    )

    for idx, it in enumerate(todos_normais, start=1):
        it.sequencia = -idx
    db.flush()

    for idx, it in enumerate(todos_normais, start=1):
        it.sequencia = idx
    db.flush()

    # Recalcula e propaga sincronização tandem em cadeia para todos os postos afetados
    recalcular_cascata_e_tandem_persistidos(
        db=db,
        setor=setor,
        linha=linha,
        turno=turno,
        item_ancora=novo_item,
    )

    seed_checklist_padrao(db, novo_item.id, setor=novo_item.setor)
    seed_labels_padrao(db, novo_item.id, novo_item.posto_trabalho)
    return novo_item, itens_afetados
