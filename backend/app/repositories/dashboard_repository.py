from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.status import PlanItemStatus
from app.models.colaboracao import ChecklistItem
from app.models.producao import ItemProducao


def obter_metricas(
    db: Session,
    linha: str | None = None,
    turno: int | None = None,
    patan: str | None = None,
    setor: str | None = None,
) -> dict:
    """Aggregates current-state metrics from producao (Tabela B).

    Permite filtros combinados por linha, turno, patan e setor.
    Calcula KPIs Lean executivos: total de peças, aderência %, lotes em produção,
    concluídos, quebras e throughput por posto.
    """
    filtros = []
    if linha is not None and linha != "" and linha != "todas":
        filtros.append(ItemProducao.linha == linha)
    if turno is not None:
        filtros.append(ItemProducao.turno == turno)
    if patan is not None and patan != "":
        filtros.append(ItemProducao.patan == patan)
    if setor is not None and setor != "" and setor != "todos":
        filtros.append(ItemProducao.setor == setor)

    total_itens, total_criticos, itens_travados = db.execute(
        select(
            func.count(),
            func.count().filter(ItemProducao.is_critico.is_(True)),
            func.count().filter(ItemProducao.status == PlanItemStatus.LOCKED.value),
        )
        .select_from(ItemProducao)
        .where(*filtros)
    ).one()
    total_itens = total_itens or 0
    itens_travados = itens_travados or 0
    pct_itens_criticos = (total_criticos / total_itens * 100) if total_itens else 0.0

    total_checklist, concluidos_checklist = db.execute(
        select(
            func.count(),
            func.count().filter(ChecklistItem.concluido.is_(True)),
        )
        .select_from(ChecklistItem)
        .join(ItemProducao, ChecklistItem.item_producao_id == ItemProducao.id)
        .where(*filtros)
    ).one()
    taxa_conclusao_checklist = (
        (concluidos_checklist / total_checklist * 100) if total_checklist else 0.0
    )

    throughput_rows = db.execute(
        select(
            ItemProducao.posto_trabalho,
            ItemProducao.turno,
            func.sum(ItemProducao.kanbans * ItemProducao.qtd_por_kanban),
        )
        .where(*filtros)
        .group_by(ItemProducao.posto_trabalho, ItemProducao.turno)
    ).all()
    throughput_por_posto = [
        {"posto_trabalho": posto, "turno": turno_linha, "total_pecas": total or 0}
        for posto, turno_linha, total in throughput_rows
    ]

    linha_turno_rows = db.execute(
        select(
            ItemProducao.linha,
            ItemProducao.turno,
            func.count(),
            func.count().filter(ItemProducao.is_critico.is_(True)),
        )
        .where(*filtros)
        .group_by(ItemProducao.linha, ItemProducao.turno)
    ).all()
    por_linha_turno = [
        {
            "linha": linha_row,
            "turno": turno_row,
            "total_itens": total,
            "pct_itens_criticos": (criticos / total * 100) if total else 0.0,
        }
        for linha_row, turno_row, total, criticos in linha_turno_rows
    ]

    # Metricas avançadas de produção (Executivo / Power BI)
    total_pecas_planejadas = db.scalar(
        select(func.coalesce(func.sum(ItemProducao.kanbans * ItemProducao.qtd_por_kanban), 0)).where(*filtros)
    ) or 0

    total_pecas_produzidas = db.scalar(
        select(func.coalesce(func.sum(ItemProducao.quantidade_produzida_real), 0)).where(*filtros)
    ) or 0

    itens_em_producao = db.scalar(
        select(func.count(ItemProducao.id)).where(*filtros, ItemProducao.em_producao.is_(True))
    ) or 0

    itens_concluidos = db.scalar(
        select(func.count(ItemProducao.id)).where(
            *filtros,
            ItemProducao.fim_real.isnot(None),
            ItemProducao.motivo_interrupcao.is_(None),
        )
    ) or 0

    itens_quebra = db.scalar(
        select(func.count(ItemProducao.id)).where(
            *filtros,
            ItemProducao.motivo_interrupcao.isnot(None),
        )
    ) or 0

    itens_na_fila = max(0, total_itens - itens_em_producao - itens_concluidos - itens_quebra)

    aderencia_plano_pct = (
        round((total_pecas_produzidas / total_pecas_planejadas * 100), 1)
        if total_pecas_planejadas > 0
        else 0.0
    )

    qualidade_fator = max(0.0, 100.0 - pct_itens_criticos) / 100.0
    aderencia_fator = min(1.0, (total_pecas_produzidas / total_pecas_planejadas)) if total_pecas_planejadas > 0 else 0.0
    oee_estimado_pct = round(qualidade_fator * (0.5 + 0.5 * aderencia_fator) * 100.0, 1) if total_itens > 0 else 0.0

    return {
        "total_itens": total_itens,
        "pct_itens_criticos": pct_itens_criticos,
        "itens_travados": itens_travados,
        "taxa_conclusao_checklist": taxa_conclusao_checklist,
        "throughput_por_posto": throughput_por_posto,
        "por_linha_turno": por_linha_turno,
        "setor": setor,
        "total_pecas_planejadas": int(total_pecas_planejadas),
        "total_pecas_produzidas": int(total_pecas_produzidas),
        "aderencia_plano_pct": aderencia_plano_pct,
        "itens_em_producao": itens_em_producao,
        "itens_concluidos": itens_concluidos,
        "itens_na_fila": itens_na_fila,
        "itens_quebra": itens_quebra,
        "oee_estimado_pct": oee_estimado_pct,
    }
