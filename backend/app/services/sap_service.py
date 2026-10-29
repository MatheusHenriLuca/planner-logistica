"""Service for SAP synchronization and file staging orchestration."""

from __future__ import annotations

import datetime
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import TYPE_CHECKING

from app.core.config import get_settings

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

LOCAL_MB52_PY = Path(__file__).resolve().parents[2] / "scripts" / "sap" / "mb52.py"
NETWORK_MB52_PY = Path(
    r"\\sb2-fs\4_GESTAO_DA_QUALIDADE$\00_KPI_&_GSD\Melhoria Contínua\Fluxos\014. Planner Project Modularizado\main-m\mb52.py"
)


class SapSyncResult:
    def __init__(
        self,
        arquivo_path: Path,
        origem: str,
        mensagem: str,
        data_arquivo: str | None = None,
        comando_executado: str | None = None,
        saida_comando: str | None = None,
    ):
        self.arquivo_path = arquivo_path
        self.origem = origem
        self.mensagem = mensagem
        self.data_arquivo = data_arquivo
        self.comando_executado = comando_executado
        self.saida_comando = saida_comando


def resolver_comando_sap(comando: str | None = None, db: Session | None = None) -> str | None:
    """Resolve qual comando ou script SAP deve ser disparado no PC servidor."""
    if comando and comando.strip():
        return comando.strip()

    if db is not None:
        try:
            from app.repositories.parametro_repository import obter_parametro

            p = obter_parametro(db, "comando_atualizacao_sap")
            if p and p.valor and p.valor.strip():
                return p.valor.strip()
        except Exception as exc:
            logger.warning("Erro ao consultar parametro comando_atualizacao_sap: %s", exc)

    settings = get_settings()
    if getattr(settings, "sap_command", None) and settings.sap_command.strip():
        return settings.sap_command.strip()

    if getattr(settings, "sap_script_path", None) and settings.sap_script_path.strip():
        return settings.sap_script_path.strip()

    # Prioridade 1: script mb52.py local em backend/scripts/sap/mb52.py
    if LOCAL_MB52_PY.is_file():
        return f'"{sys.executable}" "{LOCAL_MB52_PY}"'

    # Prioridade 2: script mb52.py na rede em 014. Planner Project Modularizado
    if NETWORK_MB52_PY.is_file():
        return f'"{sys.executable}" "{NETWORK_MB52_PY}"'

    return None


def sincronizar_dados_sap(
    setor: str = "solda",
    comando: str | None = None,
    db: Session | None = None,
) -> SapSyncResult:
    """Synchronize SAP data files from script/command, network share, or local fallback.

    Order of priority:
    1. Execute SAP extraction command directly on the server host machine.
    2. Synchronize spreadsheets (for Estamparia, converts Carga Horaria; for Solda, syncs network share).
    3. Fallback to existing local Excel file if network/script is unreachable.
    """
    settings = get_settings()
    local_base = Path(settings.excel_path)
    if not local_base.is_absolute():
        local_base = Path(__file__).resolve().parents[2] / local_base

    local_base.parent.mkdir(parents=True, exist_ok=True)

    if setor == "estamparia":
        local_target = local_base.parent / "AutomacaoPlanner_Estamparia.xlsx"
    else:
        local_target = local_base

    script_executado = False
    comando_executado: str | None = None
    saida_comando: str | None = None
    origem = "local"
    mensagem = "Dados carregados a partir do arquivo local."

    # 1. Execução do comando SAP no servidor PC
    cmd_to_run = resolver_comando_sap(comando=comando, db=db)
    if cmd_to_run:
        logger.info("Executando comando SAP no servidor: %s", cmd_to_run)
        try:
            if cmd_to_run.lower().endswith(".py") and Path(cmd_to_run).is_file():
                cmd_args = [sys.executable, cmd_to_run]
                use_shell = False
            else:
                cmd_args = cmd_to_run
                use_shell = True

            res = subprocess.run(
                cmd_args,
                shell=use_shell,
                capture_output=True,
                text=True,
                timeout=300,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            comando_executado = cmd_to_run
            saida_completa = (res.stdout or "") + (f"\nSTDERR:\n{res.stderr}" if res.stderr else "")
            saida_comando = saida_completa.strip()

            if res.returncode == 0:
                script_executado = True
                origem = "sap_script"
                mensagem = f"Comando SAP executado com sucesso no servidor ({cmd_to_run})."
                logger.info("Comando SAP executado com sucesso no servidor.")
            else:
                logger.warning(
                    "Comando SAP retornou código %s. Erro: %s",
                    res.returncode,
                    res.stderr.strip()[:300] if res.stderr else "Sem detalhes",
                )
                mensagem = f"Comando SAP finalizou com código {res.returncode}."
        except Exception as exc:
            logger.warning("Falha ao invocar comando SAP no servidor: %s", exc)
            mensagem = f"Falha ao executar comando SAP no servidor: {exc}"

    # 2. Conversão da Carga Horária se for Estamparia
    if setor == "estamparia":
        from app.services.estamparia_converter import (
            gerar_automacao_planner_estamparia,
            obter_caminho_arquivo_01,
        )

        f01 = obter_caminho_arquivo_01()
        if f01 and f01.is_file():
            try:
                gerar_automacao_planner_estamparia(f01, local_target)
                if not script_executado:
                    origem = "carga_horaria_estamparia"
                    mensagem = "Planilha de automação da Estamparia gerada a partir da Carga Horária e Patan."
                    script_executado = True
            except Exception as exc:
                logger.warning("Erro ao converter Carga Horária da Estamparia: %s", exc)

    # 3. Sincronização a partir da rede compartilhada
    if settings.sap_network_path:
        network_base = Path(settings.sap_network_path)
        if setor == "estamparia":
            network_target = network_base.parent / "AutomacaoPlanner_Estamparia.xlsx"
        else:
            network_target = network_base

        try:
            if network_target and network_target.is_file():
                logger.info("Copiando arquivo atualizado da rede: %s -> %s", network_target, local_target)
                shutil.copy2(network_target, local_target)
                if not script_executado:
                    origem = "rede_compartilhada"
                    mensagem = "Planilha mestre do SAP sincronizada com sucesso a partir da rede interna."

            # Sincroniza estoque.xlsx se existir na pasta de Estoque da rede
            rede_estoque = network_base.parent / "Estoque" / "estoque.xlsx"
            local_estoque = local_base.parent / "estoque.xlsx"
            if rede_estoque.is_file():
                logger.info("Copiando arquivo de estoque da rede: %s -> %s", rede_estoque, local_estoque)
                shutil.copy2(rede_estoque, local_estoque)
        except (OSError, PermissionError) as exc:
            logger.warning("Nao foi possivel acessar a rede compartilhada do SAP (%s): %s", network_target, exc)

    # 4. Validar se o arquivo local existe
    if not local_target.is_file():
        if setor == "estamparia" and local_base.is_file():
            local_target = local_base
        else:
            raise FileNotFoundError(
                f"Arquivo de dados do SAP nao encontrado nem na rede nem localmente: {local_target}"
            )

    # 5. Obter data da última modificação
    try:
        mtime = local_target.stat().st_mtime
        dt = datetime.datetime.fromtimestamp(mtime)
        data_formatada = dt.strftime("%d/%m/%Y às %H:%M:%S")
    except Exception:
        data_formatada = None

    return SapSyncResult(
        arquivo_path=local_target,
        origem=origem,
        mensagem=mensagem,
        data_arquivo=data_formatada,
        comando_executado=comando_executado,
        saida_comando=saida_comando,
    )
