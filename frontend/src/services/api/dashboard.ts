import type { DashboardMetricasOut } from "../../types/dashboard";
import { API_BASE_URL, authHeaders, parseJsonOrThrow } from "./core";

export async function obterMetricas(
  token: string,
  params: { linha?: string; turno?: number; patan?: string; setor?: string } = {}
): Promise<DashboardMetricasOut> {
  const query = new URLSearchParams();
  if (params.linha && params.linha !== "todas") query.set("linha", params.linha);
  if (params.turno !== undefined) query.set("turno", String(params.turno));
  if (params.patan) query.set("patan", params.patan);
  if (params.setor && params.setor !== "todos") query.set("setor", params.setor);
  const queryString = query.toString();
  const response = await fetch(
    `${API_BASE_URL}/dashboard/metricas${queryString ? `?${queryString}` : ""}`,
    { headers: authHeaders(token) }
  );
  return parseJsonOrThrow<DashboardMetricasOut>(response);
}
