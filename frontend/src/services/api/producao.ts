import type {
  BulkSubmitRequest,
  InserirCardProducaoPayload,
  InserirCardProducaoResponse,
  ItemProducao,
  SequenciaResponse,
} from "../../types/producao";
import { API_BASE_URL, ApiError, authHeaders, parseJsonOrThrow } from "./core";

export async function getSequencia(
  token: string,
  params: { linha: string; turno: number; patan: string; setor?: string; data_base?: string }
): Promise<SequenciaResponse> {
  const query = new URLSearchParams({
    linha: params.linha,
    turno: String(params.turno),
    patan: params.patan,
  });
  if (params.setor) query.set("setor", params.setor);
  if (params.data_base) query.set("data_base", params.data_base);
  const response = await fetch(`${API_BASE_URL}/producao/sequencia?${query}`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<SequenciaResponse>(response);
}

export async function submitBulkSequencia(
  token: string,
  payload: BulkSubmitRequest
): Promise<ItemProducao[]> {
  const response = await fetch(`${API_BASE_URL}/producao/sequencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<ItemProducao[]>(response);
}

export async function listarTabelaB(
  token: string,
  params: { linha?: string; patan?: string; turno?: number; setor?: string; data?: string } = {}
): Promise<ItemProducao[]> {
  const query = new URLSearchParams();
  if (params.linha && params.linha !== "todas") query.set("linha", params.linha);
  if (params.patan && params.patan !== "todos") query.set("patan", params.patan);
  if (params.turno !== undefined && params.turno !== 0) query.set("turno", String(params.turno));
  if (params.setor && params.setor !== "todos") query.set("setor", params.setor);
  if (params.data && params.data !== "todas") query.set("data", params.data);
  const queryString = query.toString();
  const response = await fetch(
    `${API_BASE_URL}/producao/tabela-b${queryString ? `?${queryString}` : ""}`,
    {
      headers: authHeaders(token),
    }
  );
  return parseJsonOrThrow<ItemProducao[]>(response);
}

export async function exportarProducaoCsv(
  token: string,
  params: { linha: string; patan?: string; turno?: number; setor?: string }
): Promise<Blob> {
  const query = new URLSearchParams({ linha: params.linha });
  if (params.patan) query.set("patan", params.patan);
  if (params.turno !== undefined) query.set("turno", String(params.turno));
  if (params.setor) query.set("setor", params.setor);
  const response = await fetch(`${API_BASE_URL}/producao/exportar?${query}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(response.status, body.detail ?? "Erro desconhecido");
  }
  return response.blob();
}

export async function reordenarProducao(
  token: string,
  payload: {
    linha: string;
    turno?: number;
    patan?: string;
    posto_trabalho: string;
    ids_em_ordem: number[];
    setor?: string;
    recalcular_horarios?: boolean;
  }
): Promise<ItemProducao[]> {
  const response = await fetch(`${API_BASE_URL}/producao/reordenar`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<ItemProducao[]>(response);
}

export async function iniciarProducao(token: string, itemId: number): Promise<ItemProducao> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/iniciar-producao`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<ItemProducao>(response);
}

export async function pausarProducao(token: string, itemId: number): Promise<ItemProducao> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/pausar-producao`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<ItemProducao>(response);
}

export async function desfazerInicioProducao(token: string, itemId: number): Promise<ItemProducao> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/desfazer-inicio`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<ItemProducao>(response);
}

export async function concluirProducao(
  token: string,
  itemId: number,
  payload: { pecas_produzidas: number; comentarios?: string }
): Promise<ItemProducao> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/concluir-producao`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<ItemProducao>(response);
}

export async function quebraFerramenta(
  token: string,
  itemId: number,
  payload: { pecas_produzidas: number; motivo_quebra: string; observacoes?: string }
): Promise<ItemProducao> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/quebra-ferramenta`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<ItemProducao>(response);
}

export async function inserirCardProducao(
  token: string,
  payload: InserirCardProducaoPayload
): Promise<InserirCardProducaoResponse> {
  const response = await fetch(`${API_BASE_URL}/producao/inserir-card`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<InserirCardProducaoResponse>(response);
}

export interface ItemPatanTeorico {
  sequencia: number;
  patan: string;
  numero_produto: string;
  operacao: string;
  produto_antigo?: string;
  tempo_producao_min: number;
  qtd_pecas: number;
  qtd_k: string;
  kanbans: number;
  pecas_hora_padrao?: number;
  dupla_batida: boolean;
  hora_inicio_estimada: string;
  hora_fim_estimada: string;
}

export interface MaquinaPatanTeorico {
  prensa: string;
  linha: string;
  turno: number;
  turno_desc: string;
  tempo_total_minutos: number;
  total_pecas: number;
  total_kanbans: number;
  itens: ItemPatanTeorico[];
}

export interface PatanTeoricoResponse {
  setor: string;
  linha?: string | null;
  turno?: number | null;
  patan?: string | null;
  total_maquinas: number;
  maquinas: MaquinaPatanTeorico[];
}

export async function getPatanTeorico(
  token: string,
  params: { setor?: string; linha?: string; turno?: number; patan?: string } = {}
): Promise<PatanTeoricoResponse> {
  const query = new URLSearchParams();
  if (params.setor) query.set("setor", params.setor);
  if (params.linha && params.linha !== "todas") query.set("linha", params.linha);
  if (params.turno && params.turno !== 0) query.set("turno", String(params.turno));
  if (params.patan && params.patan !== "todos") query.set("patan", params.patan);
  const queryString = query.toString();
  const response = await fetch(
    `${API_BASE_URL}/producao/patan-teorico${queryString ? `?${queryString}` : ""}`,
    {
      headers: authHeaders(token),
    }
  );
  return parseJsonOrThrow<PatanTeoricoResponse>(response);
}

export interface ResumoPatanInfo {
  linha: string;
  turno: number;
  total: number;
}

export async function getResumoPatans(
  token: string,
  setor: string = "solda"
): Promise<Record<string, ResumoPatanInfo[]>> {
  const response = await fetch(
    `${API_BASE_URL}/producao/resumo-patans?setor=${encodeURIComponent(setor)}`,
    {
      headers: authHeaders(token),
    }
  );
  return parseJsonOrThrow<Record<string, ResumoPatanInfo[]>>(response);
}

export interface AnotacoesResponse {
  item_id: number;
  anotacoes: string;
  mostrar_anotacoes_quadro: boolean;
}

export async function obterAnotacoesItem(
  token: string,
  itemId: number
): Promise<AnotacoesResponse> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/anotacoes`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<AnotacoesResponse>(response);
}

export async function atualizarAnotacoesItem(
  token: string,
  itemId: number,
  payload: { anotacoes: string; mostrar_anotacoes_quadro?: boolean }
): Promise<ItemProducao> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/anotacoes`, {
    method: "PATCH",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      anotacoes: payload.anotacoes,
      mostrar_anotacoes_quadro: Boolean(payload.mostrar_anotacoes_quadro),
    }),
  });
  return parseJsonOrThrow<ItemProducao>(response);
}

export interface EditarItemProducaoPayload {
  hora_inicial?: string;
  hora_final?: string;
  kanbans?: number;
  qtd_por_kanban?: number;
  tempo_por_peca_minutos?: number;
  material?: string;
  posto_trabalho?: string;
  turno?: number;
  patan?: string;
  sequencia?: number;
  recalcular_subsequentes?: boolean;
}

export async function editarItemProducao(
  token: string,
  itemId: number,
  payload: EditarItemProducaoPayload
): Promise<ItemProducao> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}`, {
    method: "PATCH",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<ItemProducao>(response);
}

export async function excluirItemProducao(
  token: string,
  itemId: number,
  removerIrmaosTandem: boolean = true
): Promise<{ mensagem: string; itens_removidos: number }> {
  const query = new URLSearchParams({ remover_irmaos_tandem: String(removerIrmaosTandem) });
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}?${query}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<{ mensagem: string; itens_removidos: number }>(response);
}



