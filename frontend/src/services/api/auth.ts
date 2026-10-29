import { API_BASE_URL, authHeaders, parseJsonOrThrow } from "./core";
import type { UserOut } from "./users";

export interface PermissoesUsuario {
  pode_programar: boolean;
  pode_iniciar_producao: boolean;
  pode_reordenar_producao: boolean;
  pode_mover_colunas: boolean;
  pode_gerenciar_colunas: boolean;
  pode_ver_historico: boolean;
  pode_gerenciar_usuarios: boolean;
  pode_importar_sap: boolean;
  pode_configurar_parametros: boolean;
  pode_gerenciar_ferramentaria: boolean;
  pode_gerenciar_linhas: boolean;
  pode_ver_solda: boolean;
  pode_ver_estamparia: boolean;
}

export interface UsuarioMe {
  id: number;
  username: string;
  role: string;
  permissoes: PermissoesUsuario;
}

export async function login(username: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username, password });
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await parseJsonOrThrow<{ access_token: string }>(response);
  return data.access_token;
}

export async function registerUser(
  token: string | null,
  payload: { username: string; password: string; role: string }
): Promise<UserOut> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<UserOut>(response);
}

export async function getAuthMe(token: string): Promise<UsuarioMe> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow<UsuarioMe>(response);
}

export async function trocarSenha(
  token: string,
  payload: { senha_atual: string; nova_senha: string }
): Promise<{ mensagem: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/trocar-senha`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<{ mensagem: string }>(response);
}
