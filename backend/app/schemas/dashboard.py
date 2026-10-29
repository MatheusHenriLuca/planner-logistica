from pydantic import BaseModel


class ThroughputPostoOut(BaseModel):
    posto_trabalho: str
    turno: int
    total_pecas: int


class LinhaTurnoOut(BaseModel):
    linha: str
    turno: int
    total_itens: int
    pct_itens_criticos: float


class DashboardMetricasOut(BaseModel):
    total_itens: int
    pct_itens_criticos: float
    itens_travados: int
    taxa_conclusao_checklist: float
    throughput_por_posto: list[ThroughputPostoOut]
    por_linha_turno: list[LinhaTurnoOut]

    # Campos executivos estilo Power BI
    setor: str | None = None
    total_pecas_planejadas: int = 0
    total_pecas_produzidas: int = 0
    aderencia_plano_pct: float = 0.0
    itens_em_producao: int = 0
    itens_concluidos: int = 0
    itens_na_fila: int = 0
    itens_quebra: int = 0
    oee_estimado_pct: float = 0.0

