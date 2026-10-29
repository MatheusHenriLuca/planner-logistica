from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.patan import Patan, PatanStr
from app.domain.sequenciamento import Turno
from app.domain.status import PlanItemStatus
from app.models.producao import ItemProducao


class ItemProducaoOut(BaseModel):
    id: int | None
    setor: str = "solda"
    material: str
    linha: str
    turno: Turno
    patan: PatanStr
    posto_trabalho: str
    status: PlanItemStatus
    sequencia: int
    hora_inicial: datetime | None
    hora_final: datetime | None
    almoco_incluso: bool
    kanbans: int
    qtd_por_kanban: int
    tempo_por_peca_minutos: float
    is_critico: bool
    tem_falta_estoque: bool
    saldo_estoque: float | None = None
    demanda: float | None = None
    dias_prod: int | None = None
    kanban_max: int | None = None
    kanban_min: int | None = None
    coluna_extra_id: int | None = None
    em_producao: bool = False
    inicio_real: datetime | None = None
    fim_real: datetime | None = None
    quantidade_produzida_real: int | None = None
    motivo_interrupcao: str | None = None
    producao_em_linha: bool = False
    postos_vinculados: list[str] = Field(default_factory=list)
    comp_comb: str | None = ""
    anotacoes: str | None = ""
    mostrar_anotacoes_quadro: bool = False

    model_config = ConfigDict(from_attributes=True)


def to_item_producao_out(item: ItemProducao) -> ItemProducaoOut:
    return ItemProducaoOut(
        id=item.id,
        setor=getattr(item, "setor", "solda"),
        material=item.material,
        linha=item.linha,
        turno=item.turno,
        patan=item.patan,
        posto_trabalho=item.posto_trabalho,
        status=item.status,
        sequencia=item.sequencia,
        hora_inicial=item.hora_inicial or item.inicio_real,
        hora_final=item.hora_final or item.fim_real,
        almoco_incluso=item.almoco_incluso,
        kanbans=item.kanbans,
        qtd_por_kanban=item.qtd_por_kanban,
        tempo_por_peca_minutos=item.tempo_por_peca_minutos,
        is_critico=item.is_critico,
        tem_falta_estoque=False,
        saldo_estoque=getattr(item, "saldo_estoque", None),
        demanda=getattr(item, "demanda", None),
        dias_prod=getattr(item, "dias_prod", None),
        kanban_max=getattr(item, "kanban_max", None),
        kanban_min=getattr(item, "kanban_min", None),
        coluna_extra_id=item.coluna_extra_id,
        em_producao=getattr(item, "em_producao", False),
        inicio_real=getattr(item, "inicio_real", None),
        fim_real=getattr(item, "fim_real", None),
        quantidade_produzida_real=getattr(item, "quantidade_produzida_real", None),
        motivo_interrupcao=getattr(item, "motivo_interrupcao", None),
        producao_em_linha=getattr(item, "producao_em_linha", False) if item.coluna_extra_id is None else False,
        postos_vinculados=getattr(item, "postos_vinculados", []) if item.coluna_extra_id is None else [],
        comp_comb=getattr(item, "comp_comb", "") or "",
        anotacoes=getattr(item, "anotacoes", "") or "",
        mostrar_anotacoes_quadro=getattr(item, "mostrar_anotacoes_quadro", False),
    )


class ColunaExtraOut(BaseModel):
    id: int
    nome: str
    setor: str = "todos"

    model_config = ConfigDict(from_attributes=True)


class ColunaExtraCreate(BaseModel):
    nome: str
    setor: str = "todos"


class MoverColunaExtraRequest(BaseModel):
    coluna_extra_id: int | None


class SequenciaResponse(BaseModel):
    linha: str
    turno: Turno
    patan: PatanStr
    itens: list[ItemProducaoOut]
    sugestoes_outros_turnos: list[dict[str, Any]] = Field(default_factory=list)


class ItemProducaoBulkIn(BaseModel):
    id: int | None = None
    setor: str = "solda"
    material: str = ""
    linha: str
    turno: Turno
    patan: PatanStr
    posto_trabalho: str
    status: PlanItemStatus
    sequencia: int
    hora_inicial: datetime | None = None
    hora_final: datetime | None = None
    almoco_incluso: bool = False
    kanbans: int
    qtd_por_kanban: int
    tempo_por_peca_minutos: float
    saldo_estoque: float | None = None
    dias_prod: int | None = None
    kanban_max: int | None = None
    kanban_min: int | None = None
    is_critico: bool = False
    comp_comb: str | None = None
    anotacoes: str | None = None
    mostrar_anotacoes_quadro: bool = False


class BulkSubmitRequest(BaseModel):
    setor: str = "solda"
    linha: str
    turno: Turno
    patan: PatanStr
    itens: list[ItemProducaoBulkIn]

    @model_validator(mode="after")
    def _itens_devem_pertencer_ao_escopo(self) -> "BulkSubmitRequest":
        for item in self.itens:
            if item.linha != self.linha:
                raise ValueError(
                    "Todos os itens devem pertencer a mesma linha do envio."
                )
            # Itens criticos (ou com is_critico=True) sao globais da linha e podem ser incluidos no lote
            if not item.is_critico and item.status != PlanItemStatus.CRITICO and (item.turno, item.patan) != (
                self.turno,
                self.patan,
            ):
                raise ValueError(
                    "Itens nao criticos devem pertencer ao mesmo escopo (turno, patan) do envio."
                )
        return self


class ReordenarProducaoRequest(BaseModel):
    setor: str = "solda"
    linha: str
    turno: Turno | None = None
    patan: PatanStr | None = None
    posto_trabalho: str
    ids_em_ordem: list[int]
    recalcular_horarios: bool = False


class EditarItemProducaoRequest(BaseModel):
    hora_inicial: datetime | None = None
    hora_final: datetime | None = None
    kanbans: int | None = Field(default=None, gt=0, description="Quantidade de kanbans")
    qtd_por_kanban: int | None = Field(default=None, gt=0, description="Quantidade por kanban")
    tempo_por_peca_minutos: float | None = Field(default=None, gt=0, description="Tempo por peça em minutos")
    material: str | None = None
    posto_trabalho: str | None = None
    turno: Turno | None = None
    patan: PatanStr | None = None
    sequencia: int | None = Field(default=None, ge=0)
    recalcular_subsequentes: bool = False


class InserirItemProducaoRequest(BaseModel):
    setor: str = "solda"
    linha: str
    turno: Turno
    patan: PatanStr
    posto_trabalho: str
    material: str
    kanbans: int = Field(gt=0, description="Quantidade de kanbans")
    qtd_por_kanban: int = Field(gt=0, description="Quantidade de peças por kanban")
    tempo_por_peca_minutos: float = Field(gt=0, description="Tempo de ciclo por peça em minutos")
    hora_inicial: datetime = Field(description="Horário planejado de início")
    is_critico: bool = False
    demanda: float = 0.0
    saldo_estoque: float = 0.0
    anotacoes: str = ""
    mostrar_anotacoes_quadro: bool = False


class InserirItemProducaoResponse(BaseModel):
    item_criado: ItemProducaoOut
    total_afetados: int
    mensagem: str

