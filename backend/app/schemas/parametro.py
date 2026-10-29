from pydantic import BaseModel, ConfigDict


class ParametroOut(BaseModel):
    chave: str
    valor: str
    descricao: str
    tipo: str

    model_config = ConfigDict(from_attributes=True)


class ParametroUpdate(BaseModel):
    valor: str
