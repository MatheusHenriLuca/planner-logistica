import type { Cargo, CargoCreate, CargoUpdate, ParametroSistema } from "../../types/parametros";
export type { Cargo, CargoCreate, CargoUpdate, ParametroSistema };
import { API_BASE_URL, authHeaders, parseJsonOrThrow } from "./core";

export async function getParametros(token: string): Promise<ParametroSistema[]> {
  const response = await fetch(`${API_BASE_URL}/parametros`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<ParametroSistema[]>(response);
}

export async function updateParametro(
  token: string,
  chave: string,
  valor: string
): Promise<ParametroSistema> {
  const response = await fetch(`${API_BASE_URL}/parametros/${encodeURIComponent(chave)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ valor }),
  });
  return parseJsonOrThrow<ParametroSistema>(response);
}

export async function getCargos(token: string): Promise<Cargo[]> {
  const response = await fetch(`${API_BASE_URL}/cargos`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<Cargo[]>(response);
}

export async function createCargo(token: string, payload: CargoCreate): Promise<Cargo> {
  const response = await fetch(`${API_BASE_URL}/cargos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<Cargo>(response);
}

export async function updateCargo(
  token: string,
  id: number,
  payload: CargoUpdate
): Promise<Cargo> {
  const response = await fetch(`${API_BASE_URL}/cargos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<Cargo>(response);
}

export async function deleteCargo(token: string, id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/cargos/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail ?? "Falha ao remover cargo.");
  }
}
