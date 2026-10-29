from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ManutencaoCreate(BaseModel):
    material: str = Field(..., min_length=1, description="Código do material/ferramenta")
    descricao: str = Field("", description="Descrição da peça ou ferramenta")
    linha: str = Field("", description="Linha de produção")
    posto_trabalho: str = Field("", description="Posto de trabalho")
    motivo_quebra: str = Field(..., min_length=1, description="Motivo da quebra/avaria")
    pecas_produzidas: int = Field(0, ge=0, description="Peças produzidas até o momento")
    tipo_manutencao: str = Field("corretiva", description="Tipo da manutenção: corretiva ou preventiva")
    observacoes: str = Field("", description="Observações adicionais")


class ManutencaoUpdateStatus(BaseModel):
    status: Literal[
        "aguardando_manutencao",
        "aguardando_preventiva",
        "em_manutencao",
        "aguardando_tryout",
        "tryout",
        "disponivel",
    ]
    observacoes: str | None = None
    tryout_setor: str | None = None
    tryout_prensa: str | None = None
    tryout_ferramenta: str | None = None
    tryout_inicio: datetime | None = None
    tryout_fim: datetime | None = None


class ManutencaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    material: str
    descricao: str
    linha: str
    posto_trabalho: str
    status: str
    tipo_manutencao: str = "corretiva"
    motivo_quebra: str
    pecas_produzidas: int
    observacoes: str
    data_quebra: datetime
    data_liberacao: datetime | None = None
    usuario_id: int | None = None
    tryout_setor: str | None = None
    tryout_prensa: str | None = None
    tryout_ferramenta: str | None = None
    tryout_inicio: datetime | None = None
    tryout_fim: datetime | None = None


class CatalogoFerramentaCreate(BaseModel):
    codigo: str = Field(..., min_length=1, description="Código único da ferramenta/matriz")
    descricao: str = Field("", description="Descrição da ferramenta")
    setor: str = Field("estamparia", description="Setor: estamparia ou solda")
    linha: str = Field("", description="Linha de produção associada")
    posto_trabalho: str = Field("", description="Posto de trabalho / máquina")
    periodicidade_dias: int = Field(30, ge=1, description="Periodicidade para preventiva em dias")
    observacoes: str = Field("", description="Observações técnicas ou de setup")


class CatalogoFerramentaUpdate(BaseModel):
    descricao: str | None = None
    setor: str | None = None
    linha: str | None = None
    posto_trabalho: str | None = None
    periodicidade_dias: int | None = Field(None, ge=1)
    observacoes: str | None = None
    ativo: bool | None = None


class CatalogoFerramentaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str
    descricao: str
    setor: str
    linha: str
    posto_trabalho: str
    periodicidade_dias: int
    ultima_manutencao: datetime | None = None
    proxima_manutencao: datetime | None = None
    observacoes: str
    ativo: bool
    status_preventiva: str = "em_dia"
    dias_restantes: int | None = None



class ConcluirProducaoPayload(BaseModel):
    pecas_produzidas: int = Field(..., ge=1, description="Quantidade de peças produzidas (obrigatório)")
    comentarios: str = Field("", description="Comentários/observações opcionais")


class QuebraFerramentaPayload(BaseModel):
    pecas_produzidas: int = Field(..., ge=0, description="Quantidade de peças produzidas até a quebra (obrigatório)")
    motivo_quebra: str = Field(..., min_length=2, description="Motivo ou detalhe da quebra da ferramenta/máquina (obrigatório)")
    observacoes: str = Field("", description="Comentários ou observações adicionais")
