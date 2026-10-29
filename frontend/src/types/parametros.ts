export interface ParametroSistema {
  chave: string;
  valor: string;
  descricao: string;
  tipo: string;
}

export interface Cargo {
  id: number;
  nome: string;
  descricao: string;
  is_sistema: boolean;
  pode_programar: boolean;
  pode_iniciar_producao: boolean;
  pode_reordenar_producao: boolean;
  pode_mover_colunas: boolean;
  pode_gerenciar_colunas: boolean;
  pode_ver_historico: boolean;
  pode_gerenciar_usuarios: boolean;
  pode_importar_sap: boolean;
  pode_configurar_parametros: boolean;
  pode_gerenciar_ferramentaria: boolean;
  pode_gerenciar_linhas?: boolean;
  pode_ver_solda?: boolean;
  pode_ver_estamparia?: boolean;
}

export type CargoCreate = Omit<Cargo, "id" | "is_sistema">;
export type CargoUpdate = Partial<Omit<Cargo, "id" | "nome" | "is_sistema">>;
