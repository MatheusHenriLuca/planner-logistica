from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.dashboard_repository import obter_metricas
from app.schemas.dashboard import DashboardMetricasOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/metricas", response_model=DashboardMetricasOut)
def obter_metricas_dashboard(
    linha: str | None = None,
    turno: int | None = None,
    patan: str | None = None,
    setor: str | None = None,
    db: Session = Depends(get_db),  # noqa: B008
    _: User = Depends(get_current_user),  # noqa: B008
) -> DashboardMetricasOut:
    metricas = obter_metricas(db, linha=linha, turno=turno, patan=patan, setor=setor)
    return DashboardMetricasOut(**metricas)

