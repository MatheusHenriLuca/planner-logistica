import { API_BASE_URL, authHeaders, parseJsonOrThrow } from "./core";

export interface ImportResponse {
  total_importados: number;
  total_ignorados: number;
  resumo_por_linha: Record<string, number>;
}

export interface AtualizarSapResponse {
  sucesso: boolean;
  mensagem: string;
  total_importados: number;
  total_ignorados: number;
  resumo_por_linha: Record<string, number>;
  origem: string;
  data_arquivo?: string | null;
  comando_executado?: string | null;
  saida_comando?: string | null;
}

export async function importarExcel(token: string, setor: string = "solda"): Promise<ImportResponse> {
  const url = `${API_BASE_URL}/producao/importar-excel?setor=${encodeURIComponent(setor)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<ImportResponse>(response);
}

export async function atualizarSap(
  token: string,
  setor: string = "solda",
  comando?: string
): Promise<AtualizarSapResponse> {
  const url = `${API_BASE_URL}/producao/atualizar-sap?setor=${encodeURIComponent(setor)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: comando ? JSON.stringify({ comando }) : undefined,
  });
  return parseJsonOrThrow<AtualizarSapResponse>(response);
}

export interface SincronizarEstoqueMb52Response {
  sucesso: boolean;
  mensagem: string;
  total_materiais_mb52: number;
  staging_atualizados: number;
  producao_atualizados: number;
  data_arquivo?: string;
  caminho_usado?: string;
}

export interface StatusMb52Response {
  caminho_local_servidor: string;
  caminho_rede_gestamp: string;
  arquivo_encontrado: boolean;
  caminho_ativo?: string | null;
  ultima_atualizacao?: string | null;
}

export async function sincronizarEstoqueMb52(
  token: string,
  setor?: string
): Promise<SincronizarEstoqueMb52Response> {
  const url = `${API_BASE_URL}/producao/sincronizar-estoque-mb52${setor ? `?setor=${encodeURIComponent(setor)}` : ""}`;
  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<SincronizarEstoqueMb52Response>(response);
}

export async function uploadEstoqueMb52(
  token: string,
  file: File,
  setor?: string
): Promise<SincronizarEstoqueMb52Response> {
  const url = `${API_BASE_URL}/producao/upload-mb52${setor ? `?setor=${encodeURIComponent(setor)}` : ""}`;
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });
  return parseJsonOrThrow<SincronizarEstoqueMb52Response>(response);
}

export async function obterStatusMb52(token: string): Promise<StatusMb52Response> {
  const url = `${API_BASE_URL}/producao/status-mb52`;
  const response = await fetch(url, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<StatusMb52Response>(response);
}

