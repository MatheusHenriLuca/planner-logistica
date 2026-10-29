from pydantic import BaseModel, ConfigDict


class LinhaProducaoBase(BaseModel):
    nome: str
    descricao: str = ""
    setor: str
    ativo: bool = True


class LinhaProducaoCreate(BaseModel):
    nome: str
    descricao: str = ""
    setor: str


class LinhaProducaoOut(LinhaProducaoBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
