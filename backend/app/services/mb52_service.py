"""Serviço de extração, mapeamento e sincronização de estoque do SAP MB52 (estoque.xlsx).

Responsável por:
1. Localizar o arquivo estoque.xlsx oficial (local ou na rede Gestamp).
2. Carregar o estoque livre (Unrestricted) de todos os materiais do MB52.
3. Resolver o saldo para peças simples e duplas (ex: 'P1 / P2' -> min(saldo(P1), saldo(P2))).
4. Atualizar o saldo_estoque no banco de dados tanto na Programação (Staging) quanto na Produção.
"""

from __future__ import annotations

import datetime
import logging
import os
import shutil
from pathlib import Path
from typing import Any

import openpyxl
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.producao import ItemProducao, ItemProducaoStaging
from app.models.user import User  # noqa: F401

logger = logging.getLogger(__name__)

# Caminho padrão na rede Gestamp onde a automação do SAP salva o estoque.xlsx exportado da MB52
NETWORK_ESTOQUE_PATH = Path(
    r"\\sb2-fs\4_GESTAO_DA_QUALIDADE$\00_KPI_&_GSD\Melhoria Contínua\APPs\Automação Planner\Estoque\estoque.xlsx"
)


def obter_diretorio_dados_local() -> Path:
    """Retorna o diretório local de dados do backend onde o estoque.xlsx é armazenado."""
    settings = get_settings()
    base_excel = Path(settings.excel_path)
    if not base_excel.is_absolute():
        base_excel = Path(__file__).resolve().parents[2] / base_excel
    data_dir = base_excel.parent
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def obter_caminho_estoque_local() -> Path:
    """Retorna o caminho local exato de destino do arquivo estoque.xlsx."""
    return obter_diretorio_dados_local() / "estoque.xlsx"


def obter_caminho_estoque() -> Path | None:
    """Localiza o arquivo estoque.xlsx mais recente disponível (rede ou local).
    
    Se houver um arquivo mais novo na rede, sincroniza para a pasta local.
    """
    local_path = obter_caminho_estoque_local()

    # Se a rede estiver acessível, verifica se há arquivo novo ou ausente localmente
    try:
        if NETWORK_ESTOQUE_PATH.is_file():
            copiar = False
            if not local_path.is_file():
                copiar = True
            else:
                mtime_rede = NETWORK_ESTOQUE_PATH.stat().st_mtime
                mtime_local = local_path.stat().st_mtime
                if mtime_rede > mtime_local:
                    copiar = True

            if copiar:
                logger.info("Copiando estoque.xlsx atualizado da rede: %s -> %s", NETWORK_ESTOQUE_PATH, local_path)
                shutil.copy2(NETWORK_ESTOQUE_PATH, local_path)
    except (OSError, PermissionError) as exc:
        logger.warning("Rede compartilhada inacessível para estoque.xlsx: %s", exc)

    if local_path.is_file():
        return local_path

    if NETWORK_ESTOQUE_PATH.is_file():
        return NETWORK_ESTOQUE_PATH

    return None


def carregar_estoque_mb52(caminho_arquivo: Path | None = None) -> dict[str, float]:
    """Lê o arquivo estoque.xlsx e retorna um dicionário { material: saldo_livre_total }.
    
    Soma as quantidades de utilização livre (Unrestricted) de todos os depósitos e centros do material.
    """
    path = caminho_arquivo or obter_caminho_estoque()
    if not path or not path.is_file():
        logger.warning("Arquivo estoque.xlsx não encontrado em nenhum local conhecido.")
        return {}

    logger.info("Carregando estoque MB52 de: %s", path)
    wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)

    header = next(rows, None)
    if not header:
        wb.close()
        return {}

    # Localizar índices das colunas de Material e Unrestricted
    col_mat_idx = 0
    col_unrestricted_idx = 5

    for idx, cell in enumerate(header):
        if not cell:
            continue
        c_str = str(cell).strip().lower()
        if "material" in c_str:
            col_mat_idx = idx
        elif "unrestricted" in c_str or "livre" in c_str:
            col_unrestricted_idx = idx

    stock_map: dict[str, float] = {}

    for row in rows:
        if not row or len(row) <= col_mat_idx:
            continue
        raw_mat = row[col_mat_idx]
        if not raw_mat:
            continue
        mat_str = str(raw_mat).strip().upper()
        if mat_str in ("MATERIAL", "MATERIAL NUMBER", "NOME DO MATERIAL"):
            continue

        raw_qty = row[col_unrestricted_idx] if len(row) > col_unrestricted_idx else 0
        try:
            qty = float(raw_qty or 0)
        except (ValueError, TypeError):
            qty = 0.0

        stock_map[mat_str] = stock_map.get(mat_str, 0.0) + qty

    wb.close()
    logger.info("Estoque MB52 carregado com sucesso: %d materiais únicos mapeados.", len(stock_map))
    return stock_map


def obter_saldo_material(material: str, estoque_mb52: dict[str, float]) -> float:
    """Calcula o saldo livre disponível para um determinado código de material.
    
    Suporta peças simples (ex: 'H03161EB6A') e peças duplas estampadas em conjunto (ex: 'P1 / P2').
    Para peças duplas, o saldo efetivo utilizável do par é o menor saldo entre as partes (gargalo).
    """
    if not material or not estoque_mb52:
        return 0.0

    mat_clean = material.strip().upper()

    # Caso seja peça dupla (ex: "L34002EB6A / L34003EB6A")
    if "/" in mat_clean:
        parts = [p.strip() for p in mat_clean.split("/") if p.strip()]
        saldos: list[float] = []
        for p in parts:
            if p in estoque_mb52:
                saldos.append(estoque_mb52[p])
            else:
                # Tenta sem zeros à esquerda ou variações
                p_lstrip = p.lstrip("0")
                matched = next((v for k, v in estoque_mb52.items() if k.lstrip("0") == p_lstrip), None)
                saldos.append(matched if matched is not None else 0.0)
        return min(saldos) if saldos else 0.0

    if mat_clean in estoque_mb52:
        return estoque_mb52[mat_clean]

    # Busca alternativa sem zeros à esquerda
    mat_lstrip = mat_clean.lstrip("0")
    for k, v in estoque_mb52.items():
        if k.lstrip("0") == mat_lstrip:
            return v

    return 0.0


def sincronizar_estoque_banco(
    db: Session,
    setor: str | None = None,
    caminho_arquivo: Path | None = None,
) -> dict[str, Any]:
    """Lê o estoque.xlsx do MB52 e atualiza os saldos de estoque (saldo_estoque) no banco de dados.
    
    Atualiza:
    1. ItemProducaoStaging (Tabela A - Programação dos usuários)
    2. ItemProducao (Tabela B - Produção ativa)
    """
    path = caminho_arquivo or obter_caminho_estoque()
    if not path or not path.is_file():
        raise FileNotFoundError(
            f"Arquivo de estoque MB52 (estoque.xlsx) não encontrado nem em "
            f"'{obter_caminho_estoque_local()}' nem em '{NETWORK_ESTOQUE_PATH}'."
        )

    data_modificacao = datetime.datetime.fromtimestamp(path.stat().st_mtime).strftime("%d/%m/%Y %H:%M:%S")
    estoque_mb52 = carregar_estoque_mb52(path)

    if not estoque_mb52:
        return {
            "sucesso": False,
            "mensagem": "Arquivo de estoque lido mas nenhum registro foi encontrado.",
            "total_materiais_mb52": 0,
            "staging_atualizados": 0,
            "producao_atualizados": 0,
            "data_arquivo": data_modificacao,
        }

    # 1. Atualizar Staging
    stmt_staging = select(ItemProducaoStaging)
    if setor:
        stmt_staging = stmt_staging.where(ItemProducaoStaging.setor == setor)
    itens_staging = list(db.scalars(stmt_staging).all())

    staging_atualizados = 0
    for it in itens_staging:
        novo_saldo = obter_saldo_material(it.material, estoque_mb52)
        if it.saldo_estoque != novo_saldo:
            it.saldo_estoque = novo_saldo
            staging_atualizados += 1

    # 2. Atualizar Produção (Tabela B)
    stmt_producao = select(ItemProducao)
    if setor:
        stmt_producao = stmt_producao.where(ItemProducao.setor == setor)
    itens_producao = list(db.scalars(stmt_producao).all())

    producao_atualizados = 0
    for it in itens_producao:
        novo_saldo = obter_saldo_material(it.material, estoque_mb52)
        if it.saldo_estoque != novo_saldo:
            it.saldo_estoque = novo_saldo
            producao_atualizados += 1

    db.commit()

    logger.info(
        "Sincronização de estoque concluída: %d itens staging e %d itens produção atualizados.",
        staging_atualizados,
        producao_atualizados,
    )

    return {
        "sucesso": True,
        "mensagem": f"Estoque MB52 sincronizado: {len(estoque_mb52)} materiais no SAP. "
        f"{staging_atualizados} itens de programação e {producao_atualizados} de produção atualizados.",
        "total_materiais_mb52": len(estoque_mb52),
        "staging_atualizados": staging_atualizados,
        "producao_atualizados": producao_atualizados,
        "data_arquivo": data_modificacao,
        "caminho_usado": str(path),
    }
