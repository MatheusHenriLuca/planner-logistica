export const LINHAS_DISPONIVEIS = [
  { valor: "LINHA 1", label: "Linha 1" },
  { valor: "LINHA 2", label: "Linha 2" },
  { valor: "LINHA 3", label: "Linha 3" },
] as const;

export const LINHAS_SOLDA_PADRAO = [
  { valor: "LINHA 1", label: "Linha 1" },
  { valor: "LINHA 2", label: "Linha 2" },
  { valor: "LINHA 3", label: "Linha 3" },
];

export const LINHAS_ESTAMPARIA_PADRAO = [
  { valor: "LINHA 1", label: "Linha 1" },
  { valor: "LINHA 3", label: "Linha 3" },
  { valor: "LINHA 4", label: "Linha 4" },
];

export type Linha = (typeof LINHAS_DISPONIVEIS)[number]["valor"];

export const PATANS_SOLDA = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export const PATANS_ESTAMPARIA = [
  "A", "B", "C", "C1", "C2", "C3", "C4",
  "D", "D1", "D2",
  "E", "E1", "E2", "E3", "E4",
  "F", "F1", "F2", "F3", "F4",
  "G", "G1", "G2",
  "H", "H1", "H2", "H3", "H4",
  "I",
  "J", "J1", "J2",
  "K", "K1", "K2", "K3", "K4",
  "L", "L1", "L2", "L3", "L4",
  "M", "M1", "M2",
  "N", "N1", "N2",
  "O", "O1", "O2", "O3", "O4",
  "P", "P1", "P2",
] as const;

export type Patan = string;

export enum PlanItemStatus {
  Excluido = 0,
  Normal = 2,
  Critico = 3,
  Locked = 9,
}

export interface ItemProducao {
  id: number | null;
  material?: string;
  setor?: string;
  linha: string;
  turno: number;
  patan: Patan;
  posto_trabalho: string;
  status: PlanItemStatus;
  sequencia: number;
  hora_inicial: string | null;
  hora_final: string | null;
  almoco_incluso: boolean;
  kanbans: number;
  qtd_por_kanban: number;
  tempo_por_peca_minutos: number;
  is_critico: boolean;
  tem_falta_estoque: boolean;
  saldo_estoque?: number;
  demanda?: number;
  dias_prod?: number | null;
  kanban_max?: number | null;
  kanban_min?: number | null;
  coluna_extra_id: number | null;
  em_producao?: boolean;
  inicio_real?: string | null;
  fim_real?: string | null;
  quantidade_produzida_real?: number | null;
  motivo_interrupcao?: string | null;
  producao_em_linha?: boolean;
  postos_vinculados?: string[];
  comp_comb?: string | null;
  anotacoes?: string | null;
  mostrar_anotacoes_quadro?: boolean;
  posto_sap?: string | null;
  data_programada?: string | null;
}

export interface ColunaExtra {
  id: number;
  nome: string;
  setor?: string;
}

export interface SugestaoOutroTurno {
  linha: string;
  turno: number;
  total: number;
}

export interface SequenciaResponse {
  linha: string;
  turno: number;
  patan: string;
  itens: ItemProducao[];
  sugestoes_outros_turnos?: SugestaoOutroTurno[];
}

export interface BulkSubmitRequest {
  linha: string;
  turno: number;
  patan: Patan;
  itens: ItemProducao[];
  setor?: string;
  data_programada?: string | null;
}

export interface InserirCardProducaoPayload {
  setor?: string;
  linha: string;
  turno: number;
  patan: Patan;
  posto_trabalho: string;
  material: string;
  kanbans: number;
  qtd_por_kanban: number;
  tempo_por_peca_minutos: number;
  hora_inicial: string;
  is_critico?: boolean;
  demanda?: number;
  saldo_estoque?: number;
  posto_sap?: string | null;
  data_programada?: string | null;
}

export interface InserirCardProducaoResponse {
  item_criado: ItemProducao;
  total_afetados: number;
  mensagem: string;
}
