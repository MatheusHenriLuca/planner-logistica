export interface AuditLog {
  id: number;
  usuario_id: number;
  usuario_nome: string;
  acao: string;
  entidade: string;
  entidade_id?: number;
  detalhes?: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogResponse {
  items: AuditLog[];
  total: number;
  skip: number;
  limit: number;
}
