"""Route for importing Excel data into the programmer's staging."""

import logging
import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import require_role
from app.db.session import get_db
from app.models.user import Role, User
from app.repositories.audit_log_repository import create_audit_log
from app.services.excel_import import importar_staging
from app.services.sap_service import sincronizar_dados_sap

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/producao", tags=["importacao"])


class ImportResponse(BaseModel):
    total_importados: int
    total_ignorados: int
    resumo_por_linha: dict[str, int]


class AtualizarSapRequest(BaseModel):
    comando: str | None = None


class AtualizarSapResponse(BaseModel):
    sucesso: bool
    mensagem: str
    total_importados: int
    total_ignorados: int
    resumo_por_linha: dict[str, int]
    origem: str
    data_arquivo: str | None = None
    comando_executado: str | None = None
    saida_comando: str | None = None


@router.post(
    "/importar-excel",
    response_model=ImportResponse,
    status_code=status.HTTP_200_OK,
)
def importar_excel(
    setor: str = "solda",
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
) -> ImportResponse:
    """Sync the calling programmer's staging from the Excel file on disk for the given setor.

    Replaces the programmer's staging for this setor (scoped by usuario_id and setor)
    with the data from the respective Excel file.
    """
    settings = get_settings()
    base_excel = Path(settings.excel_path)

    if setor == "estamparia":
        excel_path = base_excel.parent / "AutomacaoPlanner_Estamparia.xlsx"
        from app.services.estamparia_converter import (
            gerar_automacao_planner_estamparia,
            obter_caminho_arquivo_01,
            obter_caminho_missao1,
            obter_caminho_arquivo_03,
        )

        f01 = obter_caminho_arquivo_01()
        fm1 = obter_caminho_missao1()
        f03 = obter_caminho_arquivo_03()
        sources = [f for f in (fm1, f03, f01) if f and f.is_file()]
        if sources:
            deve_gerar = not excel_path.is_file() or any(
                f.stat().st_mtime > excel_path.stat().st_mtime for f in sources
            )
            if deve_gerar:
                try:
                    logger.info("Gerando AutomacaoPlanner_Estamparia.xlsx a partir das fontes: %s", [s.name for s in sources])
                    gerar_automacao_planner_estamparia(f01, excel_path)
                except Exception as exc:
                    logger.warning("Falha ao gerar automação da estamparia: %s", exc)
    else:
        excel_path = base_excel

    if not excel_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Arquivo Excel nao encontrado: {excel_path}",
        )

    try:
        result = importar_staging(db, current_user.id, excel_path, setor=setor)
        create_audit_log(
            db=db,
            usuario_id=current_user.id,
            acao="importar_excel",
            entidade="staging",
            detalhes={
                "setor": setor,
                "arquivo": excel_path.name,
                "total_importados": result.total_importados,
                "total_ignorados": result.total_ignorados,
            },
        )
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Falha ao importar Excel para staging (user=%s)", current_user.username)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao importar dados do Excel; nada foi salvo.",
        ) from exc

    return ImportResponse(
        total_importados=result.total_importados,
        total_ignorados=result.total_ignorados,
        resumo_por_linha=result.resumo_por_linha,
    )


@router.post(
    "/atualizar-sap",
    response_model=AtualizarSapResponse,
    status_code=status.HTTP_200_OK,
)
def atualizar_sap(
    setor: str = "solda",
    payload: AtualizarSapRequest | None = None,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR)),  # noqa: B008
) -> AtualizarSapResponse:
    """Trigger SAP data sync (script/network share) and immediately populate programmer's staging."""
    from app.services.mb52_service import sincronizar_estoque_banco

    comando = payload.comando if payload else None
    try:
        sync_result = sincronizar_dados_sap(setor=setor, comando=comando, db=db)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("Falha na sincronizacao do SAP: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erro ao sincronizar com SAP: {exc}",
        ) from exc

    try:
        result = importar_staging(db, current_user.id, sync_result.arquivo_path, setor=setor)
        # Sincroniza também o estoque real do MB52 tanto no staging quanto na produção
        try:
            sincronizar_estoque_banco(db=db, setor=setor)
        except Exception as mb_exc:
            logger.warning("Aviso: Falha secundária ao sincronizar MB52 durante atualizar-sap: %s", mb_exc)

        create_audit_log(
            db=db,
            usuario_id=current_user.id,
            acao="atualizar_sap",
            entidade="staging",
            detalhes={
                "setor": setor,
                "origem": sync_result.origem,
                "data_arquivo": sync_result.data_arquivo,
                "comando_executado": sync_result.comando_executado,
                "total_importados": result.total_importados,
                "total_ignorados": result.total_ignorados,
            },
        )
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Falha ao importar dados do SAP para staging (user=%s)", current_user.username)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao gravar dados do SAP na staging; nada foi salvo.",
        ) from exc

    return AtualizarSapResponse(
        sucesso=True,
        mensagem=sync_result.mensagem,
        total_importados=result.total_importados,
        total_ignorados=result.total_ignorados,
        resumo_por_linha=result.resumo_por_linha,
        origem=sync_result.origem,
        data_arquivo=sync_result.data_arquivo,
        comando_executado=sync_result.comando_executado,
        saida_comando=sync_result.saida_comando,
    )


@router.post(
    "/sincronizar-estoque-mb52",
    status_code=status.HTTP_200_OK,
)
def sincronizar_estoque_endpoint(
    setor: str | None = None,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR, Role.USUARIO_COMUM)),  # noqa: B008
) -> dict[str, object]:
    """Sincroniza o saldo de estoque (MB52) no banco de dados para todos os materiais da programação e produção."""
    from app.services.mb52_service import sincronizar_estoque_banco

    try:
        res = sincronizar_estoque_banco(db=db, setor=setor)
        return res
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Erro ao sincronizar estoque MB52: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao processar estoque MB52: {exc}",
        ) from exc


@router.post(
    "/upload-mb52",
    status_code=status.HTTP_200_OK,
)
async def upload_mb52_endpoint(
    file: UploadFile = File(...),
    setor: str | None = None,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(require_role(Role.ADMIN, Role.PROGRAMADOR, Role.USUARIO_COMUM)),  # noqa: B008
) -> dict[str, object]:
    """Recebe upload do arquivo estoque.xlsx (MB52) e sincroniza imediatamente o estoque no banco."""
    from app.services.mb52_service import obter_caminho_estoque_local, sincronizar_estoque_banco

    dest_path = obter_caminho_estoque_local()
    try:
        content = await file.read()
        with open(dest_path, "wb") as f:
            f.write(content)

        res = sincronizar_estoque_banco(db=db, setor=setor, caminho_arquivo=dest_path)
        return {
            **res,
            "arquivo_recebido": file.filename,
            "tamanho_bytes": len(content),
        }
    except Exception as exc:
        logger.exception("Erro ao receber upload do estoque MB52: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao salvar/processar estoque: {exc}",
        ) from exc


@router.get(
    "/status-mb52",
    status_code=status.HTTP_200_OK,
)
def status_mb52_endpoint() -> dict[str, object]:
    """Informa onde o estoque.xlsx é armazenado e a data da última sincronização."""
    from app.services.mb52_service import (
        NETWORK_ESTOQUE_PATH,
        obter_caminho_estoque,
        obter_caminho_estoque_local,
    )

    local_path = obter_caminho_estoque_local()
    active_path = obter_caminho_estoque()
    mtime = (
        datetime.datetime.fromtimestamp(active_path.stat().st_mtime).strftime("%d/%m/%Y %H:%M:%S")
        if active_path and active_path.is_file()
        else None
    )
    return {
        "caminho_local_servidor": str(local_path),
        "caminho_rede_gestamp": str(NETWORK_ESTOQUE_PATH),
        "arquivo_encontrado": bool(active_path and active_path.is_file()),
        "caminho_ativo": str(active_path) if active_path else None,
        "ultima_atualizacao": mtime,
    }

