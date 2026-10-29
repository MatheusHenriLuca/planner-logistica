import type {
  AnexoOut,
  AtualizarChecklistItemRequest,
  ChecklistItemOut,
  ComentarioOut,
  CriarAnexoRequest,
  CriarChecklistItemRequest,
  CriarComentarioRequest,
  LabelOut,
} from "../../types/colaboracao";
import { API_BASE_URL, ApiError, authHeaders, parseJsonOrThrow } from "./core";

export async function listarChecklist(token: string, itemId: number): Promise<ChecklistItemOut[]> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/checklist`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<ChecklistItemOut[]>(response);
}

export async function criarChecklistItem(
  token: string,
  itemId: number,
  payload: CriarChecklistItemRequest
): Promise<ChecklistItemOut> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/checklist`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<ChecklistItemOut>(response);
}

export async function atualizarChecklistItem(
  token: string,
  itemId: number,
  checklistItemId: number,
  payload: AtualizarChecklistItemRequest
): Promise<ChecklistItemOut> {
  const response = await fetch(
    `${API_BASE_URL}/producao/itens/${itemId}/checklist/${checklistItemId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(payload),
    }
  );
  return parseJsonOrThrow<ChecklistItemOut>(response);
}

export async function removerChecklistItem(
  token: string,
  itemId: number,
  checklistItemId: number
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/producao/itens/${itemId}/checklist/${checklistItemId}`,
    { method: "DELETE", headers: authHeaders(token) }
  );
  if (!response.ok) {
    throw new ApiError(response.status, "Falha ao remover item do checklist.");
  }
}

export async function listarCatalogoLabels(token: string): Promise<LabelOut[]> {
  const response = await fetch(`${API_BASE_URL}/labels`, { headers: authHeaders(token) });
  return parseJsonOrThrow<LabelOut[]>(response);
}

export async function listarLabelsDoItem(token: string, itemId: number): Promise<LabelOut[]> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/labels`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<LabelOut[]>(response);
}

export async function substituirLabelsDoItem(
  token: string,
  itemId: number,
  labelIds: number[]
): Promise<LabelOut[]> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/labels`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ label_ids: labelIds }),
  });
  return parseJsonOrThrow<LabelOut[]>(response);
}

export async function listarComentarios(token: string, itemId: number): Promise<ComentarioOut[]> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/comentarios`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<ComentarioOut[]>(response);
}

export async function criarComentario(
  token: string,
  itemId: number,
  payload: CriarComentarioRequest
): Promise<ComentarioOut> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/comentarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<ComentarioOut>(response);
}

export async function listarAnexos(token: string, itemId: number): Promise<AnexoOut[]> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/anexos`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<AnexoOut[]>(response);
}

export async function criarAnexo(
  token: string,
  itemId: number,
  payload: CriarAnexoRequest
): Promise<AnexoOut> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/anexos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<AnexoOut>(response);
}

export async function removerAnexo(token: string, itemId: number, anexoId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/producao/itens/${itemId}/anexos/${anexoId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new ApiError(response.status, "Falha ao remover anexo.");
  }
}
