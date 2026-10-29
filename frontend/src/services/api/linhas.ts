import { API_BASE_URL, authHeaders, parseJsonOrThrow } from "./core";
import type { LinhaProducao, LinhaProducaoCreate } from "../../types/linha";

export async function listarLinhas(token: string, setor?: string): Promise<LinhaProducao[]> {
  const url = new URL(`${API_BASE_URL}/linhas`);
  if (setor) url.searchParams.set("setor", setor);
  const response = await fetch(url.toString(), {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<LinhaProducao[]>(response);
}

export async function criarLinha(token: string, payload: LinhaProducaoCreate): Promise<LinhaProducao> {
  const response = await fetch(`${API_BASE_URL}/linhas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<LinhaProducao>(response);
}

export async function removerLinha(token: string, linhaId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/linhas/${linhaId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!response.ok) {
    await parseJsonOrThrow(response);
  }
}

export async function limparProducao(
  token: string,
  params: { linha: string; setor: string; turno?: number }
): Promise<{ mensagem: string; itens_removidos: number }> {
  const url = new URL(`${API_BASE_URL}/producao/limpar-producao`);
  url.searchParams.set("linha", params.linha);
  url.searchParams.set("setor", params.setor);
  if (params.turno !== undefined && params.turno !== null) {
    url.searchParams.set("turno", String(params.turno));
  }
  const response = await fetch(url.toString(), {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<{ mensagem: string; itens_removidos: number }>(response);
}
