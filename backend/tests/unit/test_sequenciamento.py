from datetime import date, datetime

from app.domain.sequenciamento import (
    LUNCH_BREAK_LABEL,
    SequenciaItem,
    Turno,
    calcular_cascata,
    calcular_tempo_producao_minutos,
)
from app.domain.status import PlanItemStatus


def test_calcular_tempo_producao_minutos_applies_the_formula():
    assert calcular_tempo_producao_minutos(kanbans=3, qtd_por_kanban=10, tempo_por_peca_minutos=0.5) == 15.0


def test_primeiro_item_comeca_no_horario_fixo_do_turno():
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=30),
    ]
    resultado = calcular_cascata(Turno.PRIMEIRO, date(2026, 8, 24), itens)
    assert resultado[0].hora_inicial == datetime(2026, 8, 24, 6, 20)  # noqa: DTZ001
    assert resultado[0].hora_final == datetime(2026, 8, 24, 6, 50)  # noqa: DTZ001
    assert resultado[0].almoco_incluso is False


def test_item_seguinte_comeca_onde_o_anterior_terminou():
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=30),
        SequenciaItem(2, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=20),
    ]
    resultado = calcular_cascata(Turno.PRIMEIRO, date(2026, 8, 24), itens)
    assert resultado[1].hora_inicial == resultado[0].hora_final
    assert resultado[1].hora_final == datetime(2026, 8, 24, 7, 10)  # noqa: DTZ001


def test_item_que_cruza_o_almoco_ganha_quarenta_minutos_uma_vez():
    # Turno 1 meal placeholder is 10:20. An item starting 10:00 for 40min
    # (10:00-10:40) strictly spans it.
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=220),  # 06:20 -> 10:00
        SequenciaItem(2, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=40),   # 10:00 -> 10:40 (+lunch)
        SequenciaItem(3, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=10),
    ]
    resultado = calcular_cascata(Turno.PRIMEIRO, date(2026, 8, 24), itens)
    assert resultado[0].almoco_incluso is False
    assert resultado[1].almoco_incluso is True
    assert resultado[1].hora_final == datetime(2026, 8, 24, 11, 20)  # noqa: DTZ001 (10:40 + 40min lunch)
    assert resultado[1].hora_final.time().strftime("%H:%M") == "11:20"
    # Cascade inherits the delay for free — not added again.
    assert resultado[2].hora_inicial == resultado[1].hora_final
    assert resultado[2].almoco_incluso is False


def test_item_que_nao_cruza_o_almoco_nao_ganha_atraso():
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=30),
    ]
    resultado = calcular_cascata(Turno.PRIMEIRO, date(2026, 8, 24), itens)
    assert resultado[0].almoco_incluso is False


def test_janela_que_toca_o_almoco_exatamente_na_virada_nao_conta_como_cruzamento():
    # Item ends exactly at 10:20 (the meal instant) - boundary touch, not a
    # strict crossing, per this plan's stated tie-break decision.
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=240),  # 06:20 -> 10:20
    ]
    resultado = calcular_cascata(Turno.PRIMEIRO, date(2026, 8, 24), itens)
    assert resultado[0].hora_final == datetime(2026, 8, 24, 10, 20)  # noqa: DTZ001
    assert resultado[0].almoco_incluso is False


def test_janela_que_comeca_exatamente_no_almoco_nao_conta_como_cruzamento():
    # Item 1 ends exactly at 10:20, so item 2's hora_inicial lands exactly on
    # the meal instant too - start-side boundary touch, not a strict
    # crossing, per this plan's stated tie-break decision (mirrors the
    # end-side case above, but on the other edge of the strict inequality).
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=240),  # 06:20 -> 10:20
        SequenciaItem(2, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=10),   # starts exactly at 10:20
    ]
    resultado = calcular_cascata(Turno.PRIMEIRO, date(2026, 8, 24), itens)
    assert resultado[1].hora_inicial == datetime(2026, 8, 24, 10, 20)  # noqa: DTZ001
    assert resultado[1].almoco_incluso is False


def test_turno_tres_vira_o_dia_para_calcular_o_almoco():
    # Turno 3 starts 23:00; its meal placeholder 03:00 is the next calendar
    # day. An item spanning 23:00 -> 04:00 must cross it.
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=300),  # 23:00 -> 04:00 (+1 day)
    ]
    resultado = calcular_cascata(Turno.TERCEIRO, date(2026, 8, 24), itens)
    assert resultado[0].hora_inicial == datetime(2026, 8, 24, 23, 0)  # noqa: DTZ001
    assert resultado[0].almoco_incluso is True
    assert resultado[0].hora_final == datetime(2026, 8, 25, 4, 40)  # noqa: DTZ001 (+40min lunch)


def test_turno_segundo_usa_seu_proprio_horario_de_inicio_e_almoco():
    # Turno 2 starts 14:40, meal placeholder 18:40 - confirms SEGUNDO's own
    # dict entries are wired correctly, not just PRIMEIRO/TERCEIRO's.
    itens = [
        SequenciaItem(1, PlanItemStatus.NORMAL, "posto-1", tempo_producao_minutos=250),  # 14:40 -> 18:50
    ]
    resultado = calcular_cascata(Turno.SEGUNDO, date(2026, 8, 24), itens)
    assert resultado[0].hora_inicial == datetime(2026, 8, 24, 14, 40)  # noqa: DTZ001
    assert resultado[0].almoco_incluso is True
    assert resultado[0].hora_final == datetime(2026, 8, 24, 19, 30)  # noqa: DTZ001 (18:50 + 40min lunch)


def test_almoco_incluso_card_mostra_o_texto_exato():
    assert LUNCH_BREAK_LABEL == "HORARIO DE ALMOCO INCLUSO"
