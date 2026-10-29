import csv
import io

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.domain.patan import Patan
from app.domain.sequenciamento import Turno
from app.models.user import User
from app.repositories.producao_repository import listar_persistidos

router = APIRouter(prefix="/producao", tags=["producao"])


def _celula_csv_segura(valor: str) -> str:
    """Prefixa com aspas simples se o valor começar com um caractere que
    Excel/LibreOffice interpretam como início de fórmula - sem isso, um
    linha/posto_trabalho como "=WEBSERVICE(...)" executaria ao abrir o CSV
    (CWE-1236, "CSV injection"). Não afeta números/bool/datetime.
    """
    if valor and valor[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{valor}"
    return valor


@router.get("/exportar")
def exportar_tabela_b(
    linha: str,
    setor: str = "solda",
    patan: str | None = None,
    turno: Turno | None = None,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> Response:
    registros = listar_persistidos(
        db,
        linha,
        patan.value if hasattr(patan, "value") else patan,
        turno.value if turno is not None else None,
        setor=setor,
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "linha", "turno", "patan", "posto_trabalho", "status", "sequencia",
            "hora_inicial", "hora_final", "kanbans", "qtd_por_kanban",
            "tempo_por_peca_minutos", "is_critico",
        ]
    )
    for r in registros:
        writer.writerow(
            [
                _celula_csv_segura(r.linha), r.turno, r.patan,
                _celula_csv_segura(r.posto_trabalho), r.status, r.sequencia,
                r.hora_inicial, r.hora_final, r.kanbans, r.qtd_por_kanban,
                r.tempo_por_peca_minutos, r.is_critico,
            ]
        )
    patan_tag = (patan.value if hasattr(patan, "value") else str(patan)) if patan is not None else "todos"
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="producao_{linha}_{patan_tag}.csv"'
        },
    )
