export type StatusFerramenta =
  | "aguardando_manutencao"
  | "aguardando_preventiva"
  | "em_manutencao"
  | "aguardando_tryout"
  | "tryout"
  | "disponivel";

export interface ManutencaoFerramenta {
  id: number;
  material: string;
  descricao: string;
  linha: string;
  posto_trabalho: string;
  status: StatusFerramenta;
  motivo_quebra: string;
  pecas_produzidas: number;
  observacoes: string;
  tipo_manutencao?: "corretiva" | "preventiva";
  data_quebra: string;
  data_liberacao?: string | null;
  usuario_id?: number | null;
  tryout_setor?: string | null;
  tryout_prensa?: string | null;
  tryout_ferramenta?: string | null;
  tryout_inicio?: string | null;
  tryout_fim?: string | null;
}

export interface ManutencaoCreate {
  material: string;
  descricao?: string;
  linha?: string;
  posto_trabalho?: string;
  motivo_quebra: string;
  pecas_produzidas?: number;
  observacoes?: string;
  tipo_manutencao?: "corretiva" | "preventiva";
}

export interface ManutencaoUpdateStatus {
  status: StatusFerramenta;
  observacoes?: string;
  tryout_setor?: string;
  tryout_prensa?: string;
  tryout_ferramenta?: string;
  tryout_inicio?: string;
  tryout_fim?: string;
}

export interface ConcluirProducaoPayload {
  pecas_produzidas: number;
  comentarios?: string;
}

export interface QuebraFerramentaPayload {
  pecas_produzidas: number;
  motivo_quebra: string;
  observacoes?: string;
}

export interface CatalogoFerramenta {
  id: number;
  codigo: string;
  descricao: string;
  setor: string;
  linha: string;
  posto_trabalho: string;
  periodicidade_dias: number;
  ultima_manutencao?: string | null;
  proxima_manutencao?: string | null;
  observacoes?: string | null;
  ativo: boolean;
  status_preventiva: "em_dia" | "proxima" | "vencida";
  dias_ate_preventiva?: number | null;
}

export interface CatalogoFerramentaCreate {
  codigo: string;
  descricao: string;
  setor?: string;
  linha?: string;
  posto_trabalho?: string;
  periodicidade_dias: number;
  ultima_manutencao?: string;
  observacoes?: string;
}

export interface CatalogoFerramentaUpdate {
  descricao?: string;
  setor?: string;
  linha?: string;
  posto_trabalho?: string;
  periodicidade_dias?: number;
  ultima_manutencao?: string;
  observacoes?: string;
  ativo?: boolean;
}
