import type { ColunaExtra, ItemProducao } from "../../types/producao";
import { API_BASE_URL, ApiError, authHeaders, parseJsonOrThrow } from "./core";

export async function listarColunasExtras(
  token: string,
  setor?: string
): Promise<ColunaExtra[]> {
  const query = setor ? `?setor=${encodeURIComponent(setor)}` : "";
  const response = await fetch(`${API_BASE_URL}/producao/colunas-extras${query}`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<ColunaExtra[]>(response);
}

export async function criarColunaExtra(
  token: string,
  nome: string,
  setor?: string
): Promise<ColunaExtra> {
  const response = await fetch(`${API_BASE_URL}/producao/colunas-extras`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ nome, setor: setor ?? "todos" }),
  });
  return parseJsonOrThrow<ColunaExtra>(response);
}

export async function renomearColunaExtra(
  token: string,
  colunaExtraId: number,
  nome: string
): Promise<ColunaExtra> {
  const response = await fetch(`${API_BASE_URL}/producao/colunas-extras/${colunaExtraId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ nome }),
  });
  return parseJsonOrThrow<ColunaExtra>(response);
}

export async function removerColunaExtra(token: string, colunaExtraId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/producao/colunas-extras/${colunaExtraId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new ApiError(response.status, "Falha ao remover coluna extra.");
  }
}

export async function moverParaColunaExtra(
  token: string,
  itemId: number,
  colunaExtraId: number | null
): Promise<ItemProducao> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/coluna-extra`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ coluna_extra_id: colunaExtraId }),
  });
  return parseJsonOrThrow<ItemProducao>(response);
}
