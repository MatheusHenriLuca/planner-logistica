"""Serviço de conversão e orquestração de dados da Estamparia.

Responsável por:
1. Gerar o arquivo AutomacaoPlanner_Estamparia.xlsx a partir de:
   - 01- Revisão de Carga Horária - ESTAMPARIA (OUT-26 até ABRIL-27).xlsx (aba DADOS)
   - Missão 1.xlsx (aba SEQUENCIA_PADRAO)
2. Fornecer a base estruturada do Patan Teórico para a tela de Visualização do Patan.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.domain.patan import PATANS_SOLDA, PATANS_ESTAMPARIA
from app.services.mb52_service import carregar_estoque_mb52, obter_saldo_material

logger = logging.getLogger(__name__)

# Caminhos padrão locais e de contingência
DESKTOP_DIR = Path(r"C:\Users\sb2mcontinua\Desktop\CARGA MAQ - ESTAMPARIA-agy")
DESKTOP_RESULTADO_DIR = DESKTOP_DIR / "RESULTADO"

FILE_01_NAME = "01- Revisão de Carga Horária - ESTAMPARIA (OUT-26 até ABRIL-27).xlsx"
FILE_MISSAO1_NAME = "Missão 1.xlsx"


def obter_caminho_arquivo_01() -> Path | None:
    """Busca o arquivo 01 de Carga Horária na pasta RESULTADO, no Desktop ou em backend/data."""
    candidatos = [
        DESKTOP_RESULTADO_DIR / FILE_01_NAME,
        DESKTOP_DIR / FILE_01_NAME,
        Path(__file__).resolve().parents[2] / "data" / FILE_01_NAME,
    ]
    for c in candidatos:
        if c.is_file():
            return c
    return None


def obter_caminho_missao1() -> Path | None:
    """Busca o arquivo Missão 1 na pasta RESULTADO, no Desktop ou em backend/data."""
    candidatos = [
        DESKTOP_RESULTADO_DIR / FILE_MISSAO1_NAME,
        DESKTOP_DIR / FILE_MISSAO1_NAME,
        Path(__file__).resolve().parents[2] / "data" / FILE_MISSAO1_NAME,
    ]
    for c in candidatos:
        if c.is_file():
            return c
    return None


def obter_caminho_arquivo_03() -> Path | None:
    """Busca o arquivo 03 de Linha 3 na pasta CARGA MAQ, RESULTADO ou backend/data."""
    candidatos = [
        DESKTOP_DIR,
        DESKTOP_RESULTADO_DIR,
        Path(__file__).resolve().parents[2] / "data",
    ]
    for d in candidatos:
        if d.is_dir():
            for p in d.glob("*LINHA 3*"):
                if p.is_file() and not p.name.startswith("~$"):
                    return p
    return None


def parse_depara_str(depara_str: str) -> dict[str, int]:
    """Converte string de DE-PARA (ex: 'A-2;I-2;C-1') em dicionário { 'A': 2, 'I': 2, 'C': 1 }."""
    if not depara_str or depara_str == "N/A":
        return {}
    res: dict[str, int] = {}
    for pair in str(depara_str).split(";"):
        if "-" in pair:
            p_code, s_code = pair.split("-", 1)
            p_code = p_code.strip().upper()
            try:
                res[p_code] = int(s_code.strip())
            except (ValueError, TypeError):
                pass
    return res


def gerar_automacao_planner_estamparia(
    arquivo_01_path: Path | None = None,
    output_path: Path | None = None,
) -> Path:
    """Gera o AutomacaoPlanner_Estamparia.xlsx a partir de Missão 1.xlsx (Linhas 1 e 4)
    e do arquivo 03 de Linha 3 (com todas as prensas PR-110, PR-109, PR-99, PR-98, PR-97)."""
    if output_path is None:
        output_path = Path(__file__).resolve().parents[2] / "data" / "AutomacaoPlanner_Estamparia.xlsx"

    output_path.parent.mkdir(parents=True, exist_ok=True)

    missao1_path = obter_caminho_missao1()
    arquivo_03_path = obter_caminho_arquivo_03()
    valid_patans = set(PATANS_ESTAMPARIA)
    mb_stock = carregar_estoque_mb52()

    # Cria workbook de destino com aba oficial 'A_ZQEXPV - Tratada'
    wb_dest = openpyxl.Workbook()
    ws_dest = wb_dest.active
    ws_dest.title = "A_ZQEXPV - Tratada"

    headers = [
        "Material", "op", "posto", "turno", "patan", "linha", "sequencia",
        "pcs/embalagem", "qtdCaixas", "tempPeca", "tempoProd",
        "seqA", "seqB", "seqC", "seqD", "seqE", "seqF", "seqG", "seqH",
        "lotePatan", "diasProd", "kanbanMax", "kanbanMin",
        "compComb", "totalLivre", "totalBloqueado", "leadTime", "isCritico"
    ]
    ws_dest.append(headers)

    consolidated: dict[tuple[str, int, str, str, str], dict[str, Any]] = {}

    if missao1_path and missao1_path.is_file():
        logger.info("Gerando AutomacaoPlanner_Estamparia a partir da base oficial Missão 1: %s", missao1_path)
        wb_m1 = openpyxl.load_workbook(str(missao1_path), read_only=True, data_only=True)
        ws_m1 = wb_m1["SEQUENCIA_PADRAO"]
        rows = list(ws_m1.iter_rows(values_only=True))
        wb_m1.close()

        for r in rows[1:]:
            linha = str(r[1]).strip().upper() if r[1] else "LINHA 1"
            if linha not in ("LINHA 1", "LINHA 3", "LINHA 4"):
                continue
            # Se temos o arquivo 03 oficial com as prensas reais da Linha 3, ignoramos Linha 3 do Missão 1
            if linha == "LINHA 3" and arquivo_03_path:
                continue

            posto = str(r[2]).strip().upper() if r[2] else "PR-92"
            turno_desc = str(r[3]).strip() if r[3] else "1º Turno"
            m_t = re.search(r"([123])", turno_desc)
            turno = int(m_t.group(1)) if m_t else 1
            patan = str(r[5]).strip().upper() if r[5] else "A"
            if patan not in valid_patans:
                continue
            seq = int(r[6]) if r[6] and str(r[6]).isdigit() else 1
            mat_raw = str(r[7]).strip() if r[7] else ""
            p1 = str(r[16]).strip() if len(r) > 16 and r[16] else ""
            p2 = str(r[17]).strip() if len(r) > 17 and r[17] else ""
            if p1 and p2 and p1 != p2:
                mat = f"{p1} / {p2}"
            else:
                mat_parts = [m.strip() for m in re.split(r"[\r\n/]+", mat_raw) if m.strip()]
                if len(mat_parts) >= 2:
                    mat = f"{mat_parts[0]} / {mat_parts[1]}"
                elif mat_parts:
                    mat = mat_parts[0]
                else:
                    mat = mat_raw
            if not mat:
                continue
            op = str(r[8]).strip() if r[8] else "0020"
            t_min = float(r[10]) if r[10] and str(r[10]).replace(".", "").isdigit() else 60.0
            pecas = int(r[11]) if r[11] and str(r[11]).isdigit() else 1000
            qk = str(r[12]) if r[12] else ""
            m_k = re.search(r"(\d+)", qk)
            kanbans = int(m_k.group(1)) if m_k else (pecas // 50 if pecas else 10)
            pcs_emb = (pecas // kanbans) if (kanbans > 0 and pecas >= kanbans) else 50

            key = (linha, turno, patan, posto, mat)
            if key in consolidated:
                prev = consolidated[key]
                prev["kanbans"] += kanbans
                prev["pecas"] += pecas
                prev["t_min"] += t_min
                prev["seq"] = min(prev["seq"], seq)
            else:
                consolidated[key] = {
                    "mat": mat,
                    "op": op,
                    "posto": posto,
                    "turno": turno,
                    "patan": patan,
                    "linha": linha,
                    "seq": seq,
                    "pcs_emb": pcs_emb,
                    "kanbans": kanbans,
                    "t_min": t_min,
                    "pecas": pecas,
                }

    # Extrai Linha 3 oficial do arquivo 03 com todas as 5 prensas
    if arquivo_03_path and arquivo_03_path.is_file():
        logger.info("Extraindo Linha 3 oficial (todas as 5 prensas) de: %s", arquivo_03_path)
        wb_3 = openpyxl.load_workbook(str(arquivo_03_path), data_only=True)
        valid_sheets = [(wb_3.sheetnames[0], 1), (wb_3.sheetnames[1], 2)]

        for sname, turno in valid_sheets:
            ws = wb_3[sname]
            r = 1
            while r <= ws.max_row:
                c2 = ws.cell(r, 2).value
                c3 = ws.cell(r, 3).value
                if c3 and "GESTAMP" in str(c3).upper():
                    padrao = re.sub(r"\s+", "", str(c2).strip().upper()) if c2 else ""
                    if not padrao or padrao == "DATA:":
                        for r_b in range(r - 1, max(1, r - 5), -1):
                            v_b = ws.cell(r_b, 2).value
                            if v_b and str(v_b).strip() not in ["", "DATA:"]:
                                padrao = re.sub(r"\s+", "", str(v_b).strip().upper())
                                break
                    if padrao not in valid_patans:
                        r += 1
                        continue

                    r_op = None
                    r_tempo = None
                    press_num = None
                    for r_sub in range(r + 1, min(r + 8, ws.max_row + 1)):
                        c3_sub = str(ws.cell(r_sub, 3).value or "").upper()
                        c2_sub = ws.cell(r_sub, 2).value
                        if isinstance(c2_sub, (int, float)) and int(c2_sub) in (97, 98, 99, 109, 110, 112):
                            press_num = int(c2_sub)
                        if "OPERA" in c3_sub:
                            r_op = r_sub
                        elif "TEMPO" in c3_sub:
                            r_tempo = r_sub

                    posto = f"PR-{press_num}" if press_num else "PR-110"

                    item_cols = []
                    for c in range(4, ws.max_column + 1):
                        p1 = ws.cell(r, c).value
                        p2 = ws.cell(r + 1, c).value if r_op and r + 1 < r_op else None
                        if p1 or p2:
                            p1_str = str(p1).strip() if p1 else ""
                            p2_str = str(p2).strip() if p2 else ""
                            item_cols.append((c, p1_str, p2_str))

                    item_cols.sort(key=lambda x: x[0])
                    for seq, (c, p1_str, p2_str) in enumerate(item_cols, 1):
                        op_val = str(ws.cell(r_op, c).value or "0020").strip() if r_op else "0020"
                        tempo_str = str(ws.cell(r_tempo, c).value or "").strip() if r_tempo else ""

                        m_tempo = re.search(r"(\d+)\s*min", tempo_str, re.I)
                        t_min = float(m_tempo.group(1)) if m_tempo else 60.0

                        m_pcs = re.search(r"([\d\.]+)\s*p[çc]s", tempo_str, re.I)
                        pecas = int(m_pcs.group(1).replace(".", "")) if m_pcs else 1000

                        m_k = re.search(r"=\s*(\d+)\s*k", tempo_str, re.I)
                        kanbans = int(m_k.group(1)) if m_k else (pecas // 50 if pecas else 10)
                        pcs_emb = (pecas // kanbans) if (kanbans > 0 and pecas >= kanbans) else 50

                        if p1_str and p2_str and p1_str != p2_str:
                            mat = f"{p1_str} / {p2_str}"
                        elif p1_str:
                            mat = p1_str
                        elif p2_str:
                            mat = p2_str
                        else:
                            continue

                        key = ("LINHA 3", turno, padrao, posto, mat)
                        if key in consolidated:
                            prev = consolidated[key]
                            prev["kanbans"] += kanbans
                            prev["pecas"] += pecas
                            prev["t_min"] += t_min
                            prev["seq"] = min(prev["seq"], seq)
                        else:
                            consolidated[key] = {
                                "mat": mat,
                                "op": op_val,
                                "posto": posto,
                                "turno": turno,
                                "patan": padrao,
                                "linha": "LINHA 3",
                                "seq": seq,
                                "pcs_emb": pcs_emb,
                                "kanbans": kanbans,
                                "t_min": t_min,
                                "pecas": pecas,
                            }
                r += 1
        wb_3.close()

    if consolidated:

        for entry in consolidated.values():
            t_min = entry["t_min"]
            pecas = entry["pecas"]
            kanbans = entry["kanbans"]
            pcs_emb = entry["pcs_emb"]
            temp_peca_min = (
                t_min / pecas
                if pecas > 0
                else (t_min / (kanbans * pcs_emb) if kanbans and pcs_emb else 0.03)
            )
            p_letra = entry["patan"]
            s = entry["seq"]
            saldo_mb52 = obter_saldo_material(entry["mat"], mb_stock)

            ws_dest.append([
                entry["mat"], entry["op"], entry["posto"], entry["turno"], p_letra, entry["linha"], s,
                pcs_emb, kanbans, temp_peca_min, t_min,
                s if p_letra == "A" else 0,
                s if p_letra == "B" else 0,
                s if p_letra == "C" else 0,
                s if p_letra == "D" else 0,
                s if p_letra == "E" else 0,
                s if p_letra == "F" else 0,
                s if p_letra == "G" else 0,
                s if p_letra == "H" else 0,
                pecas, 8, kanbans + 5, 1,
                "", saldo_mb52, 0, 0, False,
            ])

        wb_dest.save(str(output_path))
        logger.info(
            "AutomacaoPlanner_Estamparia gerado com sucesso via Missão 1: %d linhas em %s",
            len(consolidated),
            output_path,
        )
        return output_path

    # Contingência: arquivo 01
    if arquivo_01_path is None:
        arquivo_01_path = obter_caminho_arquivo_01()
        if not arquivo_01_path or not arquivo_01_path.is_file():
            raise FileNotFoundError(
                f"Nem Missão 1 nem Arquivo 01 de Carga Horária '{FILE_01_NAME}' foram encontrados."
            )

    logger.info("Gerando AutomacaoPlanner_Estamparia a partir de contingência: %s", arquivo_01_path)
    wb_src = openpyxl.load_workbook(str(arquivo_01_path), read_only=True, data_only=True)
    if "DADOS" not in wb_src.sheetnames:
        raise ValueError(f"Aba 'DADOS' não encontrada em {arquivo_01_path}")

    ws_src = wb_src["DADOS"]
    itens_gerados = 0
    chaves_inseridas: set[tuple[str, int, str, str, str]] = set()

    for idx, row in enumerate(ws_src.iter_rows(values_only=True)):
        if idx <= 1:
            continue

        # Status da ferramenta deve ser ATIVO
        status_ferr = str(row[3]).strip().upper() if len(row) > 3 and row[3] else ""
        if "INATIVO" in status_ferr:
            continue

        linha_raw = str(row[33]).strip().upper() if len(row) > 33 and row[33] else ""
        if linha_raw not in ("LINHA 1", "LINHA 3", "LINHA 4"):
            continue

        maq_raw = str(row[28]).strip() if len(row) > 28 and row[28] else (str(row[27]).strip() if len(row) > 27 else "")
        m_press = re.search(r"(PR-\d+|L-3)", maq_raw, re.I)
        posto = m_press.group(1).upper() if m_press else ""
        if not posto:
            continue

        mat_raw = row[9] if len(row) > 9 and row[9] else (row[2] if len(row) > 2 else "")
        if not mat_raw or str(mat_raw).strip() in ("", "None", "-"):
            continue

        mat_parts = [m.strip() for m in re.split(r"[\r\n/]+", str(mat_raw)) if m.strip()]
        if len(mat_parts) >= 2:
            mat = f"{mat_parts[0]} / {mat_parts[1]}"
        elif mat_parts:
            mat = mat_parts[0]
        else:
            mat = str(mat_raw).strip()

        op = str(row[10]).strip() if len(row) > 10 and row[10] else "0020"

        turno_raw = row[30] if len(row) > 30 else None
        m_t = re.search(r"([123])", str(turno_raw)) if turno_raw is not None else None
        turno = int(m_t.group(1)) if m_t else 1

        patan_raw = str(row[31]).strip().upper() if len(row) > 31 and row[31] else ""
        if not patan_raw or patan_raw in ("NONE", "-", "N/A"):
            continue

        try:
            pcs_emb = int(row[51]) if len(row) > 51 and row[51] and str(row[51]).isdigit() else 50
        except Exception:
            pcs_emb = 50

        try:
            qtd_cx = int(row[75]) if len(row) > 75 and row[75] and str(row[75]).isdigit() else 10
        except Exception:
            qtd_cx = 10

        try:
            tc_sec = float(row[65]) if len(row) > 65 and row[65] else 1.5
            temp_peca_min = tc_sec / 60.0
        except Exception:
            temp_peca_min = 0.025

        tempo_prod_min = qtd_cx * pcs_emb * temp_peca_min

        try:
            lote_prod = int(row[76]) if len(row) > 76 and row[76] and str(row[76]).isdigit() else (qtd_cx * pcs_emb)
        except Exception:
            lote_prod = qtd_cx * pcs_emb

        try:
            dias_prod = int(row[44]) if len(row) > 44 and row[44] and str(row[44]).isdigit() else 8
        except Exception:
            dias_prod = 8

        depara_val = str(row[97]).strip() if len(row) > 97 and row[97] is not None else ""
        seq_map = parse_depara_str(depara_val)

        patans_para_gerar: list[str] = [p for p in seq_map if p in valid_patans]
        if not patans_para_gerar:
            for p in re.split(r"[\s/;,]+", patan_raw):
                p_clean = re.sub(r"\(.*?\)", "", p).strip().upper()
                if p_clean in valid_patans and p_clean not in patans_para_gerar:
                    patans_para_gerar.append(p_clean)

        for pat_letra in patans_para_gerar:
            chave_unica = (linha_raw, turno, pat_letra, posto, mat)
            if chave_unica in chaves_inseridas:
                continue
            chaves_inseridas.add(chave_unica)
            seq_atual = seq_map.get(pat_letra, 1)
            saldo_mb52 = obter_saldo_material(mat, mb_stock)

            ws_dest.append([
                mat, op, posto, turno, pat_letra, linha_raw, seq_atual,
                pcs_emb, qtd_cx, temp_peca_min, tempo_prod_min,
                seq_atual if pat_letra == "A" else 0,
                seq_atual if pat_letra == "B" else 0,
                seq_atual if pat_letra == "C" else 0,
                seq_atual if pat_letra == "D" else 0,
                seq_atual if pat_letra == "E" else 0,
                seq_atual if pat_letra == "F" else 0,
                seq_atual if pat_letra == "G" else 0,
                seq_atual if pat_letra == "H" else 0,
                lote_prod, dias_prod, qtd_cx + 5, 1,
                "", saldo_mb52, 0, 0, False,
            ])
            itens_gerados += 1

    wb_src.close()
    wb_dest.save(str(output_path))
    logger.info("AutomacaoPlanner_Estamparia gerado com sucesso: %d linhas em %s", itens_gerados, output_path)
    return output_path


def carregar_base_patan_teorico(
    linha: str | None = None,
    turno: int | None = None,
    patan: str | None = None,
    missao1_path: Path | None = None,
) -> dict[str, Any]:
    """Lê a planilha Missão 1.xlsx e retorna a estrutura completa para a visualização do Patan Teórico."""
    if missao1_path is None:
        missao1_path = obter_caminho_missao1()
        if not missao1_path or not missao1_path.is_file():
            raise FileNotFoundError(
                f"Arquivo da base de Patan '{FILE_MISSAO1_NAME}' não encontrado."
            )

    wb = openpyxl.load_workbook(str(missao1_path), read_only=True, data_only=True)
    if "SEQUENCIA_PADRAO" not in wb.sheetnames:
        raise ValueError(f"Aba 'SEQUENCIA_PADRAO' não encontrada em {missao1_path}")

    ws = wb["SEQUENCIA_PADRAO"]

    # Agrupa por Prensa e Turno
    maquinas_map: dict[str, dict[str, Any]] = {}

    target_linha = linha.strip().upper() if linha else None
    target_turno = int(turno) if turno else None
    target_patan = patan.strip().upper() if patan else None

    # Horários padrão de turno para estimativa de início
    shift_starts = {1: "06:00", 2: "14:40", 3: "23:00"}

    for idx, row in enumerate(ws.iter_rows(values_only=True)):
        if idx == 0:
            continue  # Pula cabeçalho

        row_linha = str(row[1]).strip().upper() if row[1] else "LINHA 1"
        row_prensa = str(row[2]).strip().upper() if row[2] else "PR-92"
        row_turno_desc = str(row[3]).strip() if row[3] else "1º Turno"
        row_patan = str(row[5]).strip().upper() if row[5] else "A"

        # Extrai número do turno
        m_t = re.search(r"([123])", row_turno_desc)
        row_turno_num = int(m_t.group(1)) if m_t else 1

        # Filtros
        if target_linha and target_linha != row_linha:
            continue
        if target_turno and target_turno != row_turno_num:
            continue
        if target_patan and target_patan != row_patan and target_patan != row_patan[:1]:
            continue

        key = f"{row_linha}_{row_prensa}_{row_turno_num}"
        if key not in maquinas_map:
            maquinas_map[key] = {
                "prensa": row_prensa,
                "linha": row_linha,
                "turno": row_turno_num,
                "turno_desc": row_turno_desc,
                "tempo_total_minutos": 0,
                "total_pecas": 0,
                "total_kanbans": 0,
                "itens": [],
            }

        seq = int(row[6]) if row[6] and str(row[6]).isdigit() else len(maquinas_map[key]["itens"]) + 1
        num_produto = str(row[7]).strip() if row[7] else ""
        p1 = str(row[16]).strip() if len(row) > 16 and row[16] else ""
        p2 = str(row[17]).strip() if len(row) > 17 and row[17] else ""
        operacao = str(row[8]).strip() if row[8] else "0020"
        prod_antigo = str(row[9]).strip() if row[9] else ""
        tempo_min = int(row[10]) if row[10] and str(row[10]).isdigit() else 60
        qtd_pecas = int(row[11]) if row[11] and str(row[11]).isdigit() else 1000
        qtd_k = str(row[12]).strip() if row[12] else ""
        ph_padrao = float(row[14]) if row[14] and str(row[14]).replace(".", "").isdigit() else 0.0
        dupla_batida = str(row[18]).strip().upper() == "SIM"

        if p1 and p2 and p1 != p2:
            num_produto = f"{p1} / {p2}"
        elif "\n" in num_produto or "\r" in num_produto or "/" in num_produto:
            p_list = [m.strip() for m in re.split(r"[\r\n/]+", num_produto) if m.strip()]
            if len(p_list) >= 2:
                num_produto = f"{p_list[0]} / {p_list[1]}"
            elif p_list:
                num_produto = p_list[0]

        # Extrai número de kanbans
        m_k = re.search(r"(\d+)", qtd_k)
        kanbans_int = int(m_k.group(1)) if m_k else (qtd_pecas // 50 if qtd_pecas else 1)

        maquinas_map[key]["itens"].append({
            "sequencia": seq,
            "patan": row_patan,
            "numero_produto": num_produto,
            "operacao": operacao,
            "produto_antigo": prod_antigo,
            "tempo_producao_min": tempo_min,
            "qtd_pecas": qtd_pecas,
            "qtd_k": qtd_k or f"{kanbans_int}K",
            "kanbans": kanbans_int,
            "pecas_hora_padrao": int(ph_padrao) if ph_padrao else None,
            "dupla_batida": dupla_batida,
        })
        maquinas_map[key]["tempo_total_minutos"] += tempo_min
        maquinas_map[key]["total_pecas"] += qtd_pecas
        maquinas_map[key]["total_kanbans"] += kanbans_int

    wb.close()

    # Ordena máquinas e itens
    maquinas_lista = list(maquinas_map.values())
    maquinas_lista.sort(key=lambda m: (m["linha"], m["prensa"], m["turno"]))

    for maq in maquinas_lista:
        maq["itens"].sort(key=lambda it: it["sequencia"])

        # Calcula horários estimados em cascata a partir do início do turno
        h_str = shift_starts.get(maq["turno"], "06:00")
        h_start, m_start = map(int, h_str.split(":"))
        minuto_corrente = h_start * 60 + m_start

        for it in maq["itens"]:
            h_ini = (minuto_corrente // 60) % 24
            m_ini = minuto_corrente % 60
            it["hora_inicio_estimada"] = f"{h_ini:02d}:{m_ini:02d}"

            minuto_corrente += it["tempo_producao_min"]
            h_fim = (minuto_corrente // 60) % 24
            m_fim = minuto_corrente % 60
            it["hora_fim_estimada"] = f"{h_fim:02d}:{m_fim:02d}"

    return {
        "setor": "estamparia",
        "linha": target_linha,
        "turno": target_turno,
        "patan": target_patan,
        "total_maquinas": len(maquinas_lista),
        "maquinas": maquinas_lista,
    }
