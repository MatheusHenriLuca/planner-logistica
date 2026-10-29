from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ChecklistItemOut(BaseModel):
    id: int
    item_producao_id: int
    texto: str
    concluido: bool
    ordem: int

    model_config = ConfigDict(from_attributes=True)


class ChecklistItemCreate(BaseModel):
    texto: str
    ordem: int


class ChecklistItemUpdate(BaseModel):
    texto: str | None = None
    concluido: bool | None = None


class LabelOut(BaseModel):
    id: int
    nome: str
    cor: str

    model_config = ConfigDict(from_attributes=True)


class LabelSetRequest(BaseModel):
    label_ids: list[int]


class ComentarioOut(BaseModel):
    id: int
    texto: str
    autor_id: int
    autor_username: str
    criado_em: datetime


class ComentarioCreate(BaseModel):
    texto: str


class AnexoOut(BaseModel):
    id: int
    titulo: str
    url: str
    enviado_por: int
    enviado_por_username: str
    criado_em: datetime


class AnexoCreate(BaseModel):
    titulo: str
    url: str


class AnotacoesOut(BaseModel):
    item_id: int
    anotacoes: str = ""
    mostrar_anotacoes_quadro: bool = False


class AnotacoesUpdate(BaseModel):
    anotacoes: str = ""
    mostrar_anotacoes_quadro: bool = False

