export interface ThroughputPostoOut {
  posto_trabalho: string;
  turno: number;
  total_pecas: number;
}

export interface LinhaTurnoOut {
  linha: string;
  turno: number;
  total_itens: number;
  pct_itens_criticos: number;
}

export interface DashboardMetricasOut {
  total_itens: number;
  pct_itens_criticos: number;
  itens_travados: number;
  taxa_conclusao_checklist: number;
  throughput_por_posto: ThroughputPostoOut[];
  por_linha_turno: LinhaTurnoOut[];
  setor?: string;
  total_pecas_planejadas: number;
  total_pecas_produzidas: number;
  aderencia_plano_pct: number;
  itens_em_producao: number;
  itens_concluidos: number;
  itens_na_fila: number;
  itens_quebra: number;
  oee_estimado_pct: number;
}

