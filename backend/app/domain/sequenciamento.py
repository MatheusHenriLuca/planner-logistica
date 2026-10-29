from dataclasses import dataclass, replace
from datetime import date, datetime, time, timedelta
from enum import Enum

from app.domain.status import PlanItemStatus


class Turno(int, Enum):
    PRIMEIRO = 1
    SEGUNDO = 2
    TERCEIRO = 3


SHIFT_START_TIME: dict[Turno, time] = {
    Turno.PRIMEIRO: time(6, 20),
    Turno.SEGUNDO: time(14, 40),
    Turno.TERCEIRO: time(23, 0),
}

# Placeholder meal times (shift start + 4h) - user will hand-tune later.
# Edit these directly; the cascade logic reads them, it does not derive
# them from SHIFT_START_TIME.
MEAL_TIME: dict[Turno, time] = {
    Turno.PRIMEIRO: time(10, 20),
    Turno.SEGUNDO: time(18, 40),
    Turno.TERCEIRO: time(3, 0),
}

LUNCH_BREAK_MINUTES = 40
LUNCH_BREAK_LABEL = "HORARIO DE ALMOCO INCLUSO"


@dataclass(frozen=True)
class SequenciaItem:
    sequencia: int
    status: PlanItemStatus
    posto_trabalho: str
    tempo_producao_minutos: float
    hora_inicial: datetime | None = None
    hora_final: datetime | None = None
    almoco_incluso: bool = False


def calcular_tempo_producao_minutos(
    kanbans: int, qtd_por_kanban: int, tempo_por_peca_minutos: float
) -> float:
    return (kanbans * qtd_por_kanban) * tempo_por_peca_minutos


def _meal_datetime(
    turno: Turno,
    data_base: date,
    shift_start_times: dict[Turno, time] | None = None,
    meal_times: dict[Turno, time] | None = None,
) -> datetime:
    starts = shift_start_times or SHIFT_START_TIME
    meals = meal_times or MEAL_TIME
    inicio = datetime.combine(data_base, starts[turno])
    almoco = datetime.combine(data_base, meals[turno])
    if almoco <= inicio:
        almoco += timedelta(days=1)
    return almoco


meal_datetime = _meal_datetime


def calcular_cascata(
    turno: Turno,
    data_base: date,
    itens: list[SequenciaItem],
    shift_start_times: dict[Turno, time] | None = None,
    meal_times: dict[Turno, time] | None = None,
    lunch_break_minutes: int = LUNCH_BREAK_MINUTES,
) -> list[SequenciaItem]:
    """Chain hora_inicial/hora_final/almoco_incluso for one posto's queue.

    `itens` must already be filtered to PlanItemStatus.NORMAL and sorted by
    `sequencia` ascending - item sequencia==1 starts at the shift's fixed
    start time; every later item starts where the previous one ended. If an
    item's window strictly spans the shift's meal instant, the lunch break duration
    is added to that item's hora_final once; later items inherit the delay through
    the chain. Returns a new list - `itens` is never mutated.
    """
    starts = shift_start_times or SHIFT_START_TIME
    meals = meal_times or MEAL_TIME
    almoco = _meal_datetime(turno, data_base, starts, meals)
    proximo_inicio = datetime.combine(data_base, starts[turno])
    resultado: list[SequenciaItem] = []

    for item in itens:
        hora_inicial = proximo_inicio
        hora_final = hora_inicial + timedelta(minutes=item.tempo_producao_minutos)
        almoco_incluso = hora_inicial < almoco < hora_final
        if almoco_incluso:
            hora_final += timedelta(minutes=lunch_break_minutes)

        resultado.append(
            replace(
                item,
                hora_inicial=hora_inicial,
                hora_final=hora_final,
                almoco_incluso=almoco_incluso,
            )
        )
        proximo_inicio = hora_final

    return resultado
