import { AuditLogResponse } from "../../types/auditoria";
import { API_BASE_URL, authHeaders, parseJsonOrThrow } from "./core";

export async function getAuditLogs(
  token: string,
  skip = 0,
  limit = 50,
  acao?: string,
  usuario_id?: number
): Promise<AuditLogResponse> {
  const params = new URLSearchParams();
  params.append("skip", skip.toString());
  params.append("limit", limit.toString());
  if (acao) params.append("acao", acao);
  if (usuario_id) params.append("usuario_id", usuario_id.toString());

  const response = await fetch(`${API_BASE_URL}/auditoria/?${params.toString()}`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<AuditLogResponse>(response);
}
