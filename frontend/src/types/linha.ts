export interface LinhaProducao {
  id: number;
  nome: string;
  descricao: string;
  setor: "solda" | "estamparia" | string;
  ativo: boolean;
}

export interface LinhaProducaoCreate {
  nome: string;
  descricao?: string;
  setor: "solda" | "estamparia" | string;
}
