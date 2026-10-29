import type {
  CatalogoFerramenta,
  CatalogoFerramentaCreate,
  CatalogoFerramentaUpdate,
  ManutencaoCreate,
  ManutencaoFerramenta,
  ManutencaoUpdateStatus,
  StatusFerramenta,
} from "../../types/ferramentaria";
import { API_BASE_URL, ApiError, authHeaders, parseJsonOrThrow } from "./core";

export async function getManutencoes(
  token: string,
  status?: string,
  material?: string
): Promise<ManutencaoFerramenta[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (material) params.set("material", material);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const response = await fetch(`${API_BASE_URL}/ferramentaria/manutencoes${qs}`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<ManutencaoFerramenta[]>(response);
}

export async function getMateriaisBloqueados(token: string): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/ferramentaria/materiais-bloqueados`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<string[]>(response);
}

export async function criarManutencao(
  token: string,
  payload: ManutencaoCreate
): Promise<ManutencaoFerramenta> {
  const response = await fetch(`${API_BASE_URL}/ferramentaria/manutencoes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<ManutencaoFerramenta>(response);
}

export async function atualizarStatusManutencao(
  token: string,
  manutencaoId: number,
  payload: ManutencaoUpdateStatus | StatusFerramenta,
  observacoesLegado?: string
): Promise<ManutencaoFerramenta> {
  const body =
    typeof payload === "string"
      ? { status: payload, observacoes: observacoesLegado }
      : payload;

  const response = await fetch(`${API_BASE_URL}/ferramentaria/manutencoes/${manutencaoId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow<ManutencaoFerramenta>(response);
}

export async function getCatalogo(
  token: string,
  params?: { setor?: string; linha?: string; status_preventiva?: string }
): Promise<CatalogoFerramenta[]> {
  const query = new URLSearchParams();
  if (params?.setor) query.set("setor", params.setor);
  if (params?.linha) query.set("linha", params.linha);
  if (params?.status_preventiva) query.set("status_preventiva", params.status_preventiva);
  const qs = query.toString() ? `?${query.toString()}` : "";

  const response = await fetch(`${API_BASE_URL}/ferramentaria/catalogo${qs}`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<CatalogoFerramenta[]>(response);
}

export async function criarFerramentaCatalogo(
  token: string,
  payload: CatalogoFerramentaCreate
): Promise<CatalogoFerramenta> {
  const response = await fetch(`${API_BASE_URL}/ferramentaria/catalogo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<CatalogoFerramenta>(response);
}

export async function atualizarFerramentaCatalogo(
  token: string,
  id: number,
  payload: CatalogoFerramentaUpdate
): Promise<CatalogoFerramenta> {
  const response = await fetch(`${API_BASE_URL}/ferramentaria/catalogo/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<CatalogoFerramenta>(response);
}

export async function removerFerramentaCatalogo(token: string, id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/ferramentaria/catalogo/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(response.status, body.detail ?? "Erro ao remover ferramenta");
  }
}

export async function abrirPreventivaCatalogo(
  token: string,
  id: number,
  payload?: { motivo?: string; observacoes?: string }
): Promise<ManutencaoFerramenta> {
  const response = await fetch(`${API_BASE_URL}/ferramentaria/catalogo/${id}/abrir-preventiva`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload ?? {}),
  });
  return parseJsonOrThrow<ManutencaoFerramenta>(response);
}
