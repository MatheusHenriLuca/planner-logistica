from pydantic import BaseModel, ConfigDict


class CargoBase(BaseModel):
    descricao: str = ""
    pode_programar: bool = False
    pode_iniciar_producao: bool = True
    pode_reordenar_producao: bool = False
    pode_mover_colunas: bool = False
    pode_gerenciar_colunas: bool = False
    pode_ver_historico: bool = False
    pode_gerenciar_usuarios: bool = False
    pode_importar_sap: bool = False
    pode_configurar_parametros: bool = False
    pode_gerenciar_ferramentaria: bool = False
    pode_gerenciar_linhas: bool = False
    pode_ver_solda: bool = True
    pode_ver_estamparia: bool = True


class CargoCreate(CargoBase):
    nome: str


class CargoUpdate(BaseModel):
    descricao: str | None = None
    pode_programar: bool | None = None
    pode_iniciar_producao: bool | None = None
    pode_reordenar_producao: bool | None = None
    pode_mover_colunas: bool | None = None
    pode_gerenciar_colunas: bool | None = None
    pode_ver_historico: bool | None = None
    pode_gerenciar_usuarios: bool | None = None
    pode_importar_sap: bool | None = None
    pode_configurar_parametros: bool | None = None
    pode_gerenciar_ferramentaria: bool | None = None
    pode_gerenciar_linhas: bool | None = None
    pode_ver_solda: bool | None = None
    pode_ver_estamparia: bool | None = None


class CargoOut(CargoBase):
    id: int
    nome: str
    is_sistema: bool

    model_config = ConfigDict(from_attributes=True)
