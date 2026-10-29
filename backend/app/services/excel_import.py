"""Excel → Staging import service.

Reads the AutomacaoPlanner.xlsx workbook (sheet ``A_ZQEXPV - Tratada``)
and replaces the calling programmer's entire staging with the parsed rows.
Each programmer has their own staging (scoped by ``usuario_id``), so one
sync never affects another programmer's work-in-progress.

Column mapping (Excel header → staging column):
    Material        → material
    linha           → linha
    turno           → turno (int)
    patan           → patan (str, single letter A-H)
    posto           → posto_trabalho
    qtdCaixas       → kanbans
    pcs/embalagem   → qtd_por_kanban
    tempPeca        → tempo_por_peca_minutos
    totalLivre      → saldo_estoque
    lotePatan       → demanda
    seq{PATAN}      → sequencia (reads the column matching this row's patan)
    isCritico       → is_critico (None → False)

Rows with turno='x' or patan='x' are skipped (no programming assigned).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import openpyxl
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.domain.patan import PATANS_SOLDA, PATANS_ESTAMPARIA
from app.domain.postos import normalizar_posto_trabalho
from app.domain.status import PlanItemStatus
from app.models.producao import ItemProducaoStaging

logger = logging.getLogger(__name__)

# Maps each Patan letter to its sequencia column in the Excel
_SEQ_COLUMNS = {
    "A": "seqA", "B": "seqB", "C": "seqC", "D": "seqD",
    "E": "seqE", "F": "seqF", "G": "seqG", "H": "seqH",
}


@dataclass(frozen=True)
class ImportResult:
    """Summary of an import operation."""
    total_importados: int
    total_ignorados: int
    resumo_por_linha: dict[str, int]


def _safe_int(value: object, default: int = 0) -> int:
    """Coerce a cell value to int, handling None, empty strings and numeric strings."""
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def _safe_optional_int(value: object) -> int | None:
    """Coerce a cell value to int, returning None if empty, None, or <= 0."""
    if value is None or value == "":
        return None
    try:
        val = int(value)
        return val if val > 0 else None
    except (ValueError, TypeError):
        return None


def _safe_float(value: object, default: float = 0.0) -> float:
    """Coerce a cell value to float."""
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def _safe_bool(value: object) -> bool | None:
    """Coerce cell value to bool, returning None if indeterminate."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    s = str(value).strip().lower()
    if s in ("true", "verdadeiro", "sim", "s", "1"):
        return True
    if s in ("false", "falso", "nao", "não", "n", "0"):
        return False
    return None


def _is_item_critico(
    is_critico_raw: object,
    total_bloqueado: float,
    comp_comb: str,
    demanda: float = 0.0,
) -> bool:
    """Determine if an item is critical (STATUS 3).

    1. If isCritico column has an explicit boolean/truthy indicator, respect it.
    2. If isCritico is None / empty, apply the domain rule from requisitos.md:
       'STATUS == 3 (Itens Críticos): Peças em quarentena ou com falta de componentes.'
       - Quarentena: total_bloqueado > 0
       - Falta de componentes: any component in compComb has totalLivre == 0
         or totalLivre < demand.
    """
    explicit = _safe_bool(is_critico_raw)
    if explicit is not None:
        return explicit

    if total_bloqueado > 0:
        return True

    if comp_comb:
        for entry in comp_comb.split("$$$$"):
            parts = [p.strip() for p in entry.split("|")]
            if len(parts) >= 5:
                try:
                    c_livre = _safe_float(parts[3])
                    if c_livre == 0:
                        return True
                    c_qtd = _safe_float(parts[1], default=1.0)
                    if demanda > 0 and c_livre < (c_qtd * demanda):
                        return True
                except (ValueError, TypeError):
                    pass

    return False


def _parse_rows(excel_path: Path, setor: str = "solda") -> list[dict]:
    """Parse the Excel workbook and return a list of dicts ready for staging insert.

    Pure function: reads the file, applies filtering and mapping, returns
    plain dicts — no DB interaction.
    """
    wb = openpyxl.load_workbook(str(excel_path), data_only=True, read_only=True)
    try:
        ws = wb["A_ZQEXPV - Tratada"]
    except KeyError as exc:
        raise ValueError(
            "Aba 'A_ZQEXPV - Tratada' nao encontrada no arquivo Excel."
        ) from exc

    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        return []

    headers = rows[0]
    parsed: list[dict] = []
    ignorados = 0

    valid_patans = set(PATANS_ESTAMPARIA) if setor == "estamparia" else set(PATANS_SOLDA)

    for row_values in rows[1:]:
        if not any(row_values):
            continue

        row = dict(zip(headers, row_values))

        # Filter: skip rows with turno='x' or patan='x' (unassigned)
        turno_raw = row.get("turno")
        patan_raw = row.get("patan")

        if turno_raw is None or patan_raw is None:
            ignorados += 1
            continue

        turno_str = str(turno_raw).strip().lower()
        patan_str = str(patan_raw).strip().upper()

        if turno_str == "x" or patan_str == "X":
            ignorados += 1
            continue

        # Validate patan according to setor
        if patan_str not in valid_patans:
            logger.warning(
                "Patan invalido '%s' para setor '%s' ignorado (Material=%s)",
                patan_str,
                setor,
                row.get("Material"),
            )
            ignorados += 1
            continue

        turno_int = _safe_int(turno_raw)
        if turno_int not in (1, 2, 3):
            logger.warning("Turno invalido '%s' ignorado (Material=%s)", turno_raw, row.get("Material"))
            ignorados += 1
            continue

        # Get sequencia directly from column 'sequencia' or matching this row's patan
        if "sequencia" in row and row.get("sequencia") is not None and str(row.get("sequencia")).strip() != "":
            sequencia = _safe_int(row.get("sequencia"))
        elif "seq" in row and row.get("seq") is not None and str(row.get("seq")).strip() != "":
            sequencia = _safe_int(row.get("seq"))
        else:
            seq_col = f"seq{patan_str}"
            if seq_col in row and row.get(seq_col) is not None and str(row.get(seq_col)).strip() != "":
                sequencia = _safe_int(row.get(seq_col))
            elif patan_str in _SEQ_COLUMNS and _SEQ_COLUMNS[patan_str] in row:
                sequencia = _safe_int(row.get(_SEQ_COLUMNS[patan_str]))
            else:
                sequencia = 0


        total_bloqueado = _safe_float(row.get("totalBloqueado"))
        comp_comb = str(row.get("compComb") or "")
        demanda = _safe_float(row.get("lotePatan"))

        is_critico = _is_item_critico(
            row.get("isCritico"),
            total_bloqueado=total_bloqueado,
            comp_comb=comp_comb,
            demanda=demanda,
        )

        status = PlanItemStatus.CRITICO.value if is_critico else PlanItemStatus.NORMAL.value
        # Critical items always receive sequencia = 0 (requisitos.md)
        if is_critico:
            sequencia = 0

        kanbans = _safe_int(row.get("qtdCaixas"))
        qtd_por_kanban = _safe_int(row.get("pcs/embalagem"))
        tempo_por_peca = _safe_float(row.get("tempPeca"))
        if tempo_por_peca <= 0:
            tempo_prod = _safe_float(row.get("tempoProd"))
            total_pecas_lote = kanbans * qtd_por_kanban
            if tempo_prod > 0 and total_pecas_lote > 0:
                tempo_por_peca = tempo_prod / total_pecas_lote
            elif tempo_prod > 0:
                tempo_por_peca = tempo_prod

        parsed.append({
            "material": str(row.get("Material", "")).strip(),
            "linha": str(row.get("linha", "")).strip(),
            "turno": turno_int,
            "patan": patan_str,
            "posto_trabalho": normalizar_posto_trabalho(str(row.get("posto", "")).strip(), setor=setor),
            "kanbans": kanbans,
            "qtd_por_kanban": qtd_por_kanban,
            "tempo_por_peca_minutos": tempo_por_peca,
            "demanda": demanda,
            "saldo_estoque": _safe_float(row.get("totalLivre")),
            "dias_prod": _safe_optional_int(row.get("diasProd")),
            "kanban_max": _safe_optional_int(row.get("kanbanMax")),
            "kanban_min": _safe_optional_int(row.get("kanbanMin")),
            "sequencia": sequencia,
            "status": status,
            "is_critico": is_critico,
            "comp_comb": comp_comb,
        })

    wb.close()
    logger.info("Excel parsed: %d items, %d ignored", len(parsed), ignorados)
    return parsed


def importar_staging(
    db: Session, usuario_id: int, excel_path: Path, setor: str = "solda"
) -> ImportResult:
    """Replace the programmer's staging for this setor with data from Excel.

    1. Delete existing staging rows for this (usuario_id, setor).
    2. Parse the Excel file.
    3. Insert all parsed rows into staging scoped to this usuario_id and setor.
    4. Return a summary.

    The caller is responsible for committing the transaction.
    """
    # Step 1: wipe this programmer's staging for this setor
    db.execute(
        delete(ItemProducaoStaging).where(
            ItemProducaoStaging.usuario_id == usuario_id,
            ItemProducaoStaging.setor == setor,
        )
    )

    # Step 2: parse
    parsed = _parse_rows(excel_path, setor=setor)

    # Step 3: insert
    resumo_por_linha: dict[str, int] = {}
    for item_data in parsed:
        registro = ItemProducaoStaging(usuario_id=usuario_id, setor=setor, **item_data)
        db.add(registro)
        linha = item_data["linha"]
        resumo_por_linha[linha] = resumo_por_linha.get(linha, 0) + 1

    db.flush()

    ignorados = 0  # already filtered in _parse_rows
    return ImportResult(
        total_importados=len(parsed),
        total_ignorados=ignorados,
        resumo_por_linha=resumo_por_linha,
    )
